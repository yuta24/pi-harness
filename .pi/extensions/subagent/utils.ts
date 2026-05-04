import * as fs from "node:fs";
import * as path from "node:path";

export interface ToolConfig {
  tools?: string[];
}

export const DEFAULT_TIMEOUT_SECONDS = 1800;
export const MAX_STDERR_CHARS = 64 * 1024;
export const MAX_FINAL_OUTPUT_CHARS = 20000;
export const BUILTIN_TOOL_ALLOWLIST = ["read", "bash", "edit", "write", "grep", "find", "ls"];

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n\n[truncated ${omitted} chars]`;
}

export function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveAgentCwd(projectRoot: string, cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;

  const resolved = path.resolve(projectRoot, cwd);
  if (!isPathInside(projectRoot, resolved)) {
    throw new Error(`Subagent cwd must stay inside project root: ${cwd}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Subagent cwd does not exist or is not a directory: ${cwd}`);
  }

  return resolved;
}

export function getChildExtensionArgs(projectRoot: string): string[] {
  const args = ["--no-extensions"];
  const sandboxExtension = path.join(projectRoot, ".pi", "extensions", "sandbox", "index.ts");
  if (fs.existsSync(sandboxExtension)) {
    args.push("-e", sandboxExtension);
  }
  return args;
}

export function getAgentToolAllowlist(agent: ToolConfig): string[] {
  if (!agent.tools?.length) return BUILTIN_TOOL_ALLOWLIST;
  return agent.tools.filter((tool) => BUILTIN_TOOL_ALLOWLIST.includes(tool));
}

export function getIgnoredTools(agent: ToolConfig): string[] {
  if (!agent.tools?.length) return [];
  return agent.tools.filter((tool) => !BUILTIN_TOOL_ALLOWLIST.includes(tool));
}

export function isValidTimeoutSeconds(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
