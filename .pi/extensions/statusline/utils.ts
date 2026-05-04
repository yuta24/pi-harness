import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface StatuslineConfig {
  enabled?: boolean;
  command?: string;
  args?: string[];
  timeoutMs?: number;
  maxOutputChars?: number;
}

export interface NormalizedStatuslineConfig {
  enabled: boolean;
  command: string;
  args: string[];
  refreshMs: number;
  timeoutMs: number;
  maxOutputChars: number;
}

export interface StatuslineContext {
  provider: string;
  model: string;
  cwd: string;
  gitBranch: string;
  contextPercent: string;
  inputTokens: string;
  outputTokens: string;
  cost: string;
  extensionStatuses: Record<string, string>;
}

export interface ScriptResult {
  text: string;
  ok: boolean;
  timedOut: boolean;
  exitCode: number | null;
}

const MIN_REFRESH_MS = 250;
const FIXED_REFRESH_MS = 1000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 10_000;
const MIN_OUTPUT_CHARS = 1;
const MAX_OUTPUT_CHARS = 2_000;

export function normalizeConfig(config: unknown): NormalizedStatuslineConfig {
  const candidate = (config ?? {}) as StatuslineConfig;

  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new Error("statusline config must be an object");
  }

  const command = String(candidate.command ?? ".pi/statusline.js").trim();
  if (!command) throw new Error("statusline command is required");
  if (command.includes("\0")) throw new Error("statusline command must not contain NUL bytes");

  const args = candidate.args ?? [];
  if (!Array.isArray(args)) throw new Error("statusline args must be an array");
  for (const arg of args) {
    if (typeof arg !== "string") throw new Error("statusline args must be strings");
    if (arg.includes("\0")) throw new Error("statusline args must not contain NUL bytes");
  }

  if ("refreshMs" in candidate) {
    throw new Error("statusline refreshMs is managed by the extension and cannot be configured");
  }

  return {
    enabled: candidate.enabled !== false,
    command,
    args,
    refreshMs: FIXED_REFRESH_MS,
    timeoutMs: clampNumber(candidate.timeoutMs ?? 500, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, "timeoutMs"),
    maxOutputChars: clampNumber(
      candidate.maxOutputChars ?? 240,
      MIN_OUTPUT_CHARS,
      MAX_OUTPUT_CHARS,
      "maxOutputChars",
    ),
  };
}

export function resolveCommand(config: NormalizedStatuslineConfig, projectRoot: string): string {
  const root = realpathSync(resolve(projectRoot));
  const commandPath = isAbsolute(config.command) ? resolve(config.command) : resolve(root, config.command);

  if (!existsSync(commandPath)) throw new Error(`statusline command does not exist: ${config.command}`);

  const realCommandPath = realpathSync(commandPath);
  assertInsideProject(realCommandPath, root);

  const relativePath = relative(root, realCommandPath);
  if (relativePath === ".git" || relativePath.startsWith(`.git${sep}`)) {
    throw new Error("statusline command must not be inside .git");
  }

  const stats = statSync(realCommandPath);
  if (!stats.isFile()) throw new Error(`statusline command is not a file: ${config.command}`);
  if (process.platform !== "win32" && (stats.mode & 0o111) === 0) {
    throw new Error(`statusline command is not executable: ${config.command}`);
  }

  return realCommandPath;
}

export function buildScriptEnv(context: StatuslineContext): Record<string, string> {
  return {
    PI_STATUSLINE: "1",
    PI_PROVIDER: context.provider,
    PI_MODEL: context.model,
    PI_CWD: context.cwd,
    PI_GIT_BRANCH: context.gitBranch,
    PI_CONTEXT_PERCENT: context.contextPercent,
    PI_INPUT_TOKENS: context.inputTokens,
    PI_OUTPUT_TOKENS: context.outputTokens,
    PI_COST: context.cost,
    PI_EXTENSION_STATUSES: JSON.stringify(context.extensionStatuses),
  };
}

export function truncateOutput(output: string, maxChars: number): string {
  const normalized = stripTerminalControl(output).replace(/\r/g, "").trimEnd();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function stripTerminalControl(value: string): string {
  return value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function clampNumber(value: number, min: number, max: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`statusline ${name} must be a finite number`);
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function assertInsideProject(filePath: string, projectRoot: string): void {
  const relativePath = relative(projectRoot, filePath);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("statusline command must stay inside the project root");
  }
}
