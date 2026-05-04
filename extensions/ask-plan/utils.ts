export type AskPlanMode = "off" | "ask" | "plan" | "execute";

export interface PlanStep {
  step: number;
  text: string;
  completed: boolean;
}

const DESTRUCTIVE_PATTERNS = [
  /\$\(/,
  /`/,
  /[<>]\(/,
  /<</,
  /\bsystem\s*\(/i,
  /\binput_filename\b/i,
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /\bshred\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
  /\byarn\s+(add|remove|install|publish)/i,
  /\bpnpm\s+(add|remove|install|publish)/i,
  /\bpip\s+(install|uninstall)/i,
  /\bcurl\b.*\s(?:-o|-O|-D|--output|--remote-name|--remote-header-name|--config|--dump-header|--cookie-jar)\b/i,
  /\bwget\b(?!\s+-O\s*-)(?:.*\s(?:-O|--output-document|--directory-prefix|--config|--input-file)\b|.*\s[^-]\S*)/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
  /\bsudo\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_PATTERNS = [
  /^\s*cat\b/,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*less\b/,
  /^\s*more\b/,
  /^\s*grep\b/,
  /^\s*find\b/,
  /^\s*ls\b/,
  /^\s*pwd\b/,
  /^\s*echo\b/,
  /^\s*printf\b/,
  /^\s*wc\b/,
  /^\s*sort\b/,
  /^\s*uniq\b/,
  /^\s*diff\b/,
  /^\s*file\b/,
  /^\s*stat\b/,
  /^\s*du\b/,
  /^\s*df\b/,
  /^\s*which\b/,
  /^\s*type\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
  /^\s*uname\b/,
  /^\s*whoami\b/,
  /^\s*id\b/,
  /^\s*date\b/,
  /^\s*ps\b/,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-files|grep)/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
  /^\s*yarn\s+(list|info|why|audit)/i,
  /^\s*node\s+--version/i,
  /^\s*python\s+--version/i,
  /^\s*curl\s+(?:-[fsSLI]+\s+)*(?:--fail\s+|--silent\s+|--show-error\s+|--location\s+|--head\s+|--include\s+|--request\s+HEAD\s+|--url\s+\S+\s*)*\S+/i,
  /^\s*wget\s+-O\s*-\s+/i,
  /^\s*jq\b/,
  /^\s*sed\s+-n/i,
  /^\s*awk\b/,
  /^\s*rg\b/,
  /^\s*fd\b/,
];

export function isSafeReadOnlyCommand(command: string): boolean {
  const segments = command.split(/\s*(?:&&|\|\||;|\|)\s*/).filter(Boolean);
  if (segments.length === 0) return false;

  return segments.every((segment) => {
    const isDestructive = DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(segment));
    const isSafe = SAFE_PATTERNS.some((pattern) => pattern.test(segment));
    return !isDestructive && isSafe;
  });
}

export function cleanStepText(text: string): string {
  let cleaned = text
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  if (cleaned.length > 90) {
    cleaned = `${cleaned.slice(0, 87)}...`;
  }
  return cleaned;
}

export function extractPlanSteps(message: string): PlanStep[] {
  const headerMatch = message.match(
    /^\s*(?:#{1,6}\s*)?(?:Plan|Implementation Plan|Proposed Plan|計画|実装計画)\s*:?\s*$/im,
  );
  if (!headerMatch || headerMatch.index === undefined) return [];

  const body = message.slice(headerMatch.index + headerMatch[0].length);
  const steps: PlanStep[] = [];
  const pattern = /^\s*(?:[-*]\s*)?(?:[0-9０-９]+)[.)．]\s*(.+)$/gm;

  for (const match of body.matchAll(pattern)) {
    const text = cleanStepText(match[1]);
    if (text.length > 3) {
      steps.push({ step: steps.length + 1, text, completed: false });
    }
  }

  return steps;
}

export function extractDoneSteps(message: string): number[] {
  const steps: number[] = [];
  for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
    const step = Number(match[1]);
    if (Number.isInteger(step) && step > 0) steps.push(step);
  }
  return steps;
}

export function markCompletedSteps(message: string, steps: PlanStep[]): number {
  let changed = 0;
  for (const step of extractDoneSteps(message)) {
    const item = steps.find((candidate) => candidate.step === step);
    if (item && !item.completed) {
      item.completed = true;
      changed++;
    }
  }
  return changed;
}

export function formatPlanSteps(steps: PlanStep[]): string {
  if (steps.length === 0) return "No plan steps.";
  return steps
    .map((step) => `${step.step}. ${step.completed ? "[x]" : "[ ]"} ${step.text}`)
    .join("\n");
}
