export type QuestionKind = "text" | "confirm" | "select";

export interface QuestionOption {
  label: string;
  value?: string;
}

export interface QuestionParams {
  question: string;
  kind?: QuestionKind;
  options?: QuestionOption[];
  defaultAnswer?: string;
  timeoutSeconds?: number;
}

export interface NormalizedQuestion {
  question: string;
  kind: QuestionKind;
  options: QuestionOption[];
  defaultAnswer?: string;
  timeoutMs?: number;
}

export interface QuestionResult {
  answer: string | null;
  source: "user" | "default" | "cancelled" | "unavailable";
  timedOut: boolean;
  cancelled: boolean;
}

const MAX_TIMEOUT_SECONDS = 3600;
const QUESTION_KINDS = new Set(["text", "confirm", "select"]);

export function normalizeOptions(options: QuestionOption[] | undefined): QuestionOption[] {
  return (options ?? [])
    .map((option) => ({
      label: String(option.label ?? "").trim(),
      value: option.value === undefined ? undefined : String(option.value),
    }))
    .filter((option) => option.label.length > 0);
}

export function normalizeQuestion(params: QuestionParams): NormalizedQuestion {
  const question = String(params.question ?? "").trim();
  if (!question) throw new Error("question is required");

  let kind = params.kind ?? "text";
  const options = normalizeOptions(params.options);

  if (!QUESTION_KINDS.has(kind)) {
    throw new Error(`invalid question kind: ${kind}`);
  }

  if (kind === "select" && options.length === 0) {
    throw new Error("select questions require at least one option");
  }

  let defaultAnswer =
    params.defaultAnswer === undefined || params.defaultAnswer === null
      ? undefined
      : String(params.defaultAnswer).trim();

  if (defaultAnswer) {
    if (kind === "confirm") {
      const normalized = defaultAnswer.toLocaleLowerCase();
      if (["yes", "y", "true"].includes(normalized)) {
        defaultAnswer = "yes";
      } else if (["no", "n", "false"].includes(normalized)) {
        defaultAnswer = "no";
      } else {
        throw new Error('confirm defaultAnswer must be one of "yes", "no", "true", or "false"');
      }
    }

    if (kind === "select") {
      const option = options.find((candidate) => {
        return candidate.label === defaultAnswer || candidate.value === defaultAnswer;
      });
      if (!option) {
        throw new Error("select defaultAnswer must match an option label or value");
      }
      defaultAnswer = optionAnswer(option);
    }
  }

  let timeoutMs: number | undefined;
  if (params.timeoutSeconds !== undefined) {
    if (!Number.isFinite(params.timeoutSeconds) || params.timeoutSeconds < 0) {
      throw new Error("timeoutSeconds must be a non-negative number");
    }
    timeoutMs = Math.min(params.timeoutSeconds, MAX_TIMEOUT_SECONDS) * 1000;
  }

  return {
    question,
    kind,
    options,
    defaultAnswer: defaultAnswer || undefined,
    timeoutMs,
  };
}

export function optionAnswer(option: QuestionOption): string {
  return option.value ?? option.label;
}

export function makeResult(answer: string | null, source: QuestionResult["source"], timedOut = false): QuestionResult {
  return {
    answer,
    source,
    timedOut,
    cancelled: source === "cancelled",
  };
}

export function formatResult(result: QuestionResult): string {
  if (result.source === "unavailable") {
    return "Question could not be asked because interactive UI is unavailable.";
  }
  if (result.cancelled) return "User cancelled the question.";
  if (result.timedOut) {
    return result.answer === null
      ? "Question timed out without an answer."
      : `Question timed out. Default answer: ${result.answer}`;
  }
  if (result.source === "default") return `Default answer: ${result.answer ?? ""}`;
  return `User answered: ${result.answer ?? ""}`;
}
