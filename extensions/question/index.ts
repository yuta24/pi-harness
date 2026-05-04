/**
 * Question Extension
 *
 * Adds an ask_user_question tool, similar in spirit to Claude Code's
 * AskUserQuestionTool. The assistant can ask for explicit user input when
 * requirements are ambiguous or confirmation is required before proceeding.
 */
import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import {
  type NormalizedQuestion,
  type QuestionResult,
  formatResult,
  makeResult,
  normalizeQuestion,
  optionAnswer,
} from "./utils.js";

const QuestionParams = {
  type: "object",
  additionalProperties: false,
  required: ["question"],
  properties: {
    question: {
      type: "string",
      description: "The concise question to ask the user.",
    },
    kind: {
      type: "string",
      enum: ["text", "confirm", "select"],
      description: 'Question style. "text" asks for free-form input, "confirm" asks yes/no, "select" asks from options.',
      default: "text",
    },
    options: {
      type: "array",
      description: 'Options for kind="select". Each item is { label, value? }.',
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: {
          label: { type: "string" },
          value: { type: "string" },
        },
      },
    },
    defaultAnswer: {
      type: "string",
      description: "Optional answer to use when the user cancels or the question times out.",
    },
    timeoutSeconds: {
      type: "number",
      description: "Optional UI timeout in seconds. 0 means no timeout.",
      default: 0,
    },
  },
} as any;

type AskQuestionParams = {
  question: string;
  kind?: "text" | "confirm" | "select";
  options?: Array<{ label: string; value?: string }>;
  defaultAnswer?: string;
  timeoutSeconds?: number;
};

interface QuestionDetails {
  question: NormalizedQuestion;
  result: QuestionResult;
}

function toolResult(
  question: NormalizedQuestion,
  result: QuestionResult,
  isError = false,
): AgentToolResult<QuestionDetails> {
  return {
    content: [{ type: "text", text: formatResult(result) }],
    details: { question, result },
    isError,
  };
}

function timeoutOptions(question: NormalizedQuestion): { timeout?: number } | undefined {
  if (!question.timeoutMs || question.timeoutMs <= 0) return undefined;
  return { timeout: question.timeoutMs };
}

function defaultOrCancelled(question: NormalizedQuestion): QuestionResult {
  const timedOut = Boolean(question.timeoutMs && question.timeoutMs > 0);
  if (question.defaultAnswer !== undefined) {
    return makeResult(question.defaultAnswer, "default", timedOut);
  }
  return makeResult(null, "cancelled", timedOut);
}

export default function questionExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask User",
    description:
      "Ask the user a direct question when you need missing requirements, a decision, or confirmation before proceeding. Use this instead of guessing.",
    promptSnippet:
      "ask_user_question - Ask the user for missing requirements, decisions, or confirmation before proceeding.",
    promptGuidelines: [
      "Use ask_user_question when requirements are ambiguous and guessing would affect the implementation.",
      "Ask one concise question at a time; provide select options when the answer should be constrained.",
      "Do not use ask_user_question for information you can discover safely from the repository.",
    ],
    parameters: QuestionParams,

    async execute(_toolCallId, params: AskQuestionParams, _signal, _onUpdate, ctx) {
      let question: NormalizedQuestion;
      try {
        question = normalizeQuestion(params);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const fallback = {
          question: String(params.question ?? ""),
          kind: params.kind ?? "text",
          options: params.options ?? [],
          defaultAnswer: params.defaultAnswer,
        } as NormalizedQuestion;
        return {
          content: [{ type: "text", text: `Invalid question: ${message}` }],
          details: { question: fallback, result: makeResult(null, "cancelled") },
          isError: true,
        };
      }

      if (!ctx.hasUI) {
        const result = makeResult(question.defaultAnswer ?? null, "unavailable");
        return toolResult(question, result, question.defaultAnswer === undefined);
      }

      if (question.kind === "confirm") {
        const answer = await ctx.ui.select(question.question, ["Yes", "No"], timeoutOptions(question));
        if (answer === "Yes") return toolResult(question, makeResult("yes", "user"));
        if (answer === "No") return toolResult(question, makeResult("no", "user"));
        return toolResult(question, defaultOrCancelled(question));
      }

      if (question.kind === "select") {
        const labels = question.options.map((option) => option.label);
        const selected = await ctx.ui.select(question.question, labels, timeoutOptions(question));
        if (!selected) return toolResult(question, defaultOrCancelled(question));

        const option = question.options.find((candidate) => candidate.label === selected);
        return toolResult(question, makeResult(option ? optionAnswer(option) : selected, "user"));
      }

      const answer = await ctx.ui.input("Question", question.question, timeoutOptions(question));
      if (answer !== undefined) return toolResult(question, makeResult(answer.trim(), "user"));

      return toolResult(question, defaultOrCancelled(question));
    },

    renderCall(args: AskQuestionParams, theme) {
      const kind = args.kind ?? "text";
      const options = Array.isArray(args.options) ? args.options.map((option) => option.label).join(", ") : "";
      const details = options ? ` (${kind}: ${options})` : ` (${kind})`;
      return new Text(
        theme.fg("toolTitle", theme.bold("ask_user_question ")) +
          theme.fg("muted", `${args.question ?? ""}${details}`),
        0,
        0,
      );
    },

    renderResult(result, _options, theme) {
      const text = result.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      return new Text(theme.fg(result.isError ? "error" : "success", text), 0, 0);
    },
  });

  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}

Question tool guidance:
- Use ask_user_question when missing requirements, user preferences, or risky decisions would otherwise require guessing.
- Ask only one concise question at a time, and prefer select or confirm when the answer space is constrained.
- Do not ask about information that can be discovered safely from the repository or current session context.`,
    };
  });
}
