/**
 * Ask / Plan Mode Extension
 *
 * Ask mode: read-only Q&A. The assistant may inspect but must not modify.
 * Plan mode: read-only exploration plus numbered implementation plan extraction.
 * Execution mode: after explicit approval, normal tools are restored and progress
 * can be tracked with [DONE:n] markers.
 */
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
} from "@mariozechner/pi-coding-agent";
import {
  type AskPlanMode,
  type PlanStep,
  extractPlanSteps,
  formatPlanSteps,
  isSafeReadOnlyCommand,
  markCompletedSteps,
} from "./utils.js";

const READ_ONLY_TOOLS = ["read", "bash", "grep", "find", "ls"];
const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant" && Array.isArray(message.content);
}

function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export default function askPlanExtension(pi: ExtensionAPI): void {
  let mode: AskPlanMode = "off";
  let previousTools: string[] | undefined;
  let planSteps: PlanStep[] = [];

  pi.registerFlag("ask", {
    description: "Start in ask mode (read-only Q&A)",
    type: "boolean",
    default: false,
  });

  pi.registerFlag("plan", {
    description: "Start in plan mode (read-only planning)",
    type: "boolean",
    default: false,
  });

  function persistState(): void {
    pi.appendEntry("ask-plan-mode", {
      mode,
      planSteps,
      previousTools,
    });
  }

  function updateStatus(ctx: ExtensionContext): void {
    if (mode === "ask") {
      ctx.ui.setStatus("ask-plan", ctx.ui.theme.fg("warning", "ask"));
      ctx.ui.setWidget("ask-plan-steps", undefined);
      return;
    }

    if (mode === "plan") {
      ctx.ui.setStatus("ask-plan", ctx.ui.theme.fg("warning", "plan"));
      ctx.ui.setWidget("ask-plan-steps", undefined);
      return;
    }

    if (mode === "execute" && planSteps.length > 0) {
      const done = planSteps.filter((step) => step.completed).length;
      ctx.ui.setStatus("ask-plan", ctx.ui.theme.fg("accent", `plan ${done}/${planSteps.length}`));
      ctx.ui.setWidget(
        "ask-plan-steps",
        planSteps.map((step) => {
          if (step.completed) {
            return ctx.ui.theme.fg("success", `[x] ${step.text}`);
          }
          return ctx.ui.theme.fg("muted", `[ ] ${step.text}`);
        }),
      );
      return;
    }

    ctx.ui.setStatus("ask-plan", undefined);
    ctx.ui.setWidget("ask-plan-steps", undefined);
  }

  function restoreTools(): void {
    pi.setActiveTools(previousTools ?? DEFAULT_TOOLS);
    previousTools = undefined;
  }

  function enterMode(nextMode: AskPlanMode, ctx: ExtensionContext): void {
    if (nextMode === "off") {
      mode = "off";
      planSteps = [];
      restoreTools();
      ctx.ui.notify("Ask/plan mode disabled.", "info");
      updateStatus(ctx);
      persistState();
      return;
    }

    if (mode !== "ask" && mode !== "plan") {
      previousTools = pi.getActiveTools();
    }

    mode = nextMode;
    if (nextMode !== "execute") {
      planSteps = [];
      pi.setActiveTools(READ_ONLY_TOOLS);
      ctx.ui.notify(
        `${nextMode === "ask" ? "Ask" : "Plan"} mode enabled. Read-only tools: ${READ_ONLY_TOOLS.join(", ")}`,
        "info",
      );
    }
    updateStatus(ctx);
    persistState();
  }

  function startExecution(ctx: ExtensionContext): void {
    mode = "execute";
    restoreTools();
    updateStatus(ctx);
    persistState();

    const first = planSteps.find((step) => !step.completed);
    pi.sendMessage(
      {
        customType: "ask-plan-execute",
        content: first
          ? `Execute the approved plan. Start with step ${first.step}: ${first.text}`
          : "Execute the approved plan.",
        display: true,
      },
      { triggerTurn: true },
    );
  }

  pi.registerCommand("ask", {
    description: "Toggle ask mode (read-only Q&A)",
    handler: async (_args, ctx) => {
      enterMode(mode === "ask" ? "off" : "ask", ctx);
    },
  });

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only planning)",
    handler: async (_args, ctx) => {
      enterMode(mode === "plan" ? "off" : "plan", ctx);
    },
  });

  pi.registerCommand("execute-plan", {
    description: "Execute the current approved plan",
    handler: async (_args, ctx) => {
      if (planSteps.length === 0) {
        ctx.ui.notify("No plan steps are available.", "warning");
        return;
      }
      startExecution(ctx);
    },
  });

  pi.registerCommand("mode", {
    description: "Show ask/plan mode status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        [`Mode: ${mode}`, "", formatPlanSteps(planSteps)].join("\n"),
        "info",
      );
    },
  });

  pi.on("tool_call", async (event) => {
    if (mode !== "ask" && mode !== "plan") return;

    if (event.toolName === "edit" || event.toolName === "write") {
      return {
        block: true,
        reason: `${mode} mode is read-only. Use /${mode} to leave ${mode} mode before modifying files.`,
      };
    }

    if (isToolCallEventType("bash", event) && !isSafeReadOnlyCommand(event.input.command)) {
      return {
        block: true,
        reason: `${mode} mode blocks non-read-only bash commands.\nCommand: ${event.input.command}`,
      };
    }
  });

  pi.on("before_agent_start", async () => {
    if (mode === "ask") {
      return {
        message: {
          customType: "ask-mode-context",
          content: `[ASK MODE ACTIVE]
You are in read-only ask mode.

Rules:
- Answer the user's question directly.
- You may inspect files with read-only tools.
- Do not modify files.
- Do not produce implementation unless the user explicitly leaves ask mode.
- Ask concise clarifying questions when required.`,
          display: false,
        },
      };
    }

    if (mode === "plan") {
      return {
        message: {
          customType: "plan-mode-context",
          content: `[PLAN MODE ACTIVE]
You are in read-only plan mode.

Rules:
- Inspect and reason, but do not modify files.
- Produce a concrete numbered plan under a "Plan:" header.
- Keep steps executable and file-specific.
- Do not start implementation.`,
          display: false,
        },
      };
    }

    if (mode === "execute" && planSteps.length > 0) {
      const remaining = planSteps.filter((step) => !step.completed);
      return {
        message: {
          customType: "plan-execution-context",
          content: `[EXECUTING APPROVED PLAN]
Remaining steps:
${formatPlanSteps(remaining)}

Execute the remaining steps in order.
After completing a step, include [DONE:n] in your response.`,
          display: false,
        },
      };
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    if (mode !== "plan") return;

    const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
    if (!lastAssistant) return;

    const extracted = extractPlanSteps(getTextContent(lastAssistant));
    if (extracted.length === 0) return;

    planSteps = extracted;
    persistState();

    pi.sendMessage(
      {
        customType: "ask-plan-steps",
        content: `Plan Steps:\n\n${formatPlanSteps(planSteps)}`,
        display: true,
      },
      { triggerTurn: false },
    );

    if (!ctx.hasUI) {
      pi.sendMessage(
        {
          customType: "ask-plan-next-step",
          content: "Review the extracted plan, then run /execute-plan to start implementation.",
          display: true,
        },
        { triggerTurn: false },
      );
      return;
    }

    const choice = await ctx.ui.select("Plan complete", [
      "Execute the plan",
      "Stay in plan mode",
      "Refine the plan",
    ]);

    if (choice === "Execute the plan") {
      startExecution(ctx);
    } else if (choice === "Refine the plan") {
      const refinement = await ctx.ui.editor("Refine the plan:", "");
      if (refinement?.trim()) {
        pi.sendUserMessage(refinement.trim());
      }
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (mode !== "execute" || planSteps.length === 0) return;
    if (!isAssistantMessage(event.message)) return;

    if (markCompletedSteps(getTextContent(event.message), planSteps) > 0) {
      updateStatus(ctx);
      persistState();
    }

    if (planSteps.every((step) => step.completed)) {
      pi.sendMessage(
        {
          customType: "ask-plan-complete",
          content: `Plan complete.\n\n${formatPlanSteps(planSteps)}`,
          display: true,
        },
        { triggerTurn: false },
      );
      mode = "off";
      planSteps = [];
      updateStatus(ctx);
      persistState();
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const entry = ctx.sessionManager
      .getEntries()
      .filter((candidate: { type: string; customType?: string }) => {
        return candidate.type === "custom" && candidate.customType === "ask-plan-mode";
      })
      .pop() as
      | {
          data?: {
            mode?: AskPlanMode;
            planSteps?: PlanStep[];
            previousTools?: string[];
          };
        }
      | undefined;

    if (entry?.data) {
      mode = entry.data.mode ?? mode;
      planSteps = entry.data.planSteps ?? planSteps;
      previousTools = entry.data.previousTools ?? previousTools;
    }

    if (pi.getFlag("ask") === true) {
      mode = "ask";
      planSteps = [];
    }
    if (pi.getFlag("plan") === true) {
      mode = "plan";
      planSteps = [];
    }

    if (mode === "ask" || mode === "plan") {
      previousTools ??= pi.getActiveTools();
      pi.setActiveTools(READ_ONLY_TOOLS);
    }

    updateStatus(ctx);
  });
}
