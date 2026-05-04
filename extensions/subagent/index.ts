/**
 * Subagent Extension - delegate work to isolated pi subprocesses.
 *
 * Supports:
 * - Single: { agent: "name", task: "..." }
 * - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 * - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { type ExtensionAPI, withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import {
  type AgentConfig,
  type AgentScope,
  discoverAgents,
  formatAgentList,
} from "./agents.js";
import {
  DEFAULT_TIMEOUT_SECONDS,
  MAX_FINAL_OUTPUT_CHARS,
  MAX_STDERR_CHARS,
  getAgentToolAllowlist,
  getChildExtensionArgs,
  getIgnoredTools,
  isValidTimeoutSeconds,
  resolveAgentCwd,
  truncateText,
} from "./utils.js";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const BUNDLED_SANDBOX_EXTENSION = fileURLToPath(new URL("../sandbox/index.ts", import.meta.url));

type Message = {
  role?: string;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: { total?: number };
  };
  content?: Array<{ type: string; text?: string; name?: string; arguments?: Record<string, unknown> }>;
};

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface SingleResult {
  agent: string;
  agentSource: "user" | "project" | "unknown";
  task: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  toolWarnings: string[];
  usage: UsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
}

interface SubagentDetails {
  mode: "single" | "parallel" | "chain";
  agentScope: AgentScope;
  results: SingleResult[];
}

const SubagentParams = {
  type: "object",
  additionalProperties: false,
  properties: {
    agent: {
      type: "string",
      description: "Name of the agent to invoke for single-agent mode.",
    },
    task: {
      type: "string",
      description: "Task to delegate for single-agent mode.",
    },
    tasks: {
      type: "array",
      description: "Parallel mode tasks. Each item is { agent, task, cwd? }.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["agent", "task"],
        properties: {
          agent: { type: "string" },
          task: { type: "string" },
          cwd: { type: "string" },
        },
      },
    },
    chain: {
      type: "array",
      description: "Sequential mode tasks. Use {previous} in later task text to include prior output.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["agent", "task"],
        properties: {
          agent: { type: "string" },
          task: { type: "string" },
          cwd: { type: "string" },
        },
      },
    },
    agentScope: {
      type: "string",
      enum: ["user", "project", "both"],
      description: 'Agent directories to search. Default: "project".',
      default: "project",
    },
    cwd: {
      type: "string",
      description: "Working directory for single-agent mode.",
    },
    confirmProjectAgents: {
      type: "boolean",
      description: "Prompt before running project-local agents in interactive mode. Default: true.",
      default: true,
    },
    timeoutSeconds: {
      type: "number",
      description: "Watchdog timeout per subagent process in seconds. Default: 1800. Use 0 to disable.",
      default: DEFAULT_TIMEOUT_SECONDS,
    },
  },
} as any;

type SubagentParamsType = {
  agent?: string;
  task?: string;
  tasks?: Array<{ agent: string; task: string; cwd?: string }>;
  chain?: Array<{ agent: string; task: string; cwd?: string }>;
  agentScope?: AgentScope;
  cwd?: string;
  confirmProjectAgents?: boolean;
  timeoutSeconds?: number;
};

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

function emptyUsage(): UsageStats {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !msg.content) continue;
    for (const part of msg.content) {
      if (part.type === "text" && part.text) return part.text;
    }
  }
  return "";
}

function summarizeResult(result: SingleResult): string {
  const status = isFailure(result) ? "failed" : "completed";
  const output =
    getFinalOutput(result.messages) ||
    result.errorMessage ||
    result.stderr ||
    result.toolWarnings.join("\n") ||
    "(no output)";
  const preview = output.length > 240 ? `${output.slice(0, 240)}...` : output;
  return `[${result.agent}] ${status}: ${preview}`;
}

function isFailure(result: SingleResult): boolean {
  return (
    result.exitCode !== 0 ||
    result.stopReason === "error" ||
    result.stopReason === "aborted" ||
    result.stopReason === "timeout"
  );
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  if (!/^(node|bun)(\.exe)?$/.test(execName)) {
    return { command: process.execPath, args };
  }

  return { command: "pi", args };
}

function findNearestProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(current, ".pi"))) return current;

    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd);
    current = parent;
  }
}

function killProcessGroup(pid: number | undefined, child: ReturnType<typeof spawn>): void {
  if (!pid) {
    child.kill("SIGKILL");
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }, 5000);
}

async function writePromptToTempFile(agent: AgentConfig): Promise<{ dir: string; filePath: string }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
  const safeName = agent.name.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(dir, `${safeName}.md`);
  await withFileMutationQueue(filePath, async () => {
    await fs.promises.writeFile(filePath, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
  });
  return { dir, filePath };
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const results = new Array<TOut>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runSingleAgent(
  defaultCwd: string,
  projectRoot: string,
  agents: AgentConfig[],
  agentName: string,
  task: string,
  cwd: string | undefined,
  timeoutSeconds: number,
  step: number | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => SubagentDetails,
): Promise<SingleResult> {
  const agent = agents.find((candidate) => candidate.name === agentName);
  if (!agent) {
    return {
      agent: agentName,
      agentSource: "unknown",
      task,
      exitCode: 1,
      messages: [],
      stderr: `Unknown agent "${agentName}". Available agents: ${agents.map((a) => a.name).join(", ") || "none"}.`,
      toolWarnings: [],
      usage: emptyUsage(),
      step,
    };
  }

  const result: SingleResult = {
    agent: agent.name,
    agentSource: agent.source,
    task,
    exitCode: -1,
    messages: [],
    stderr: "",
    toolWarnings: [],
    usage: emptyUsage(),
    model: agent.model,
    step,
  };

  const emitUpdate = () => {
    onUpdate?.({
      content: [{ type: "text", text: getFinalOutput(result.messages) || `${agent.name} running...` }],
      details: makeDetails([result]),
    });
  };

  let tmpPromptDir: string | undefined;
  let tmpPromptPath: string | undefined;

  try {
    const resolvedCwd = resolveAgentCwd(projectRoot, cwd) ?? defaultCwd;
    const args = [
      "--mode",
      "json",
      "-p",
      "--no-session",
      ...getChildExtensionArgs(projectRoot, BUNDLED_SANDBOX_EXTENSION),
    ];
    if (agent.model) args.push("--model", agent.model);
    const ignoredTools = getIgnoredTools(agent);
    if (ignoredTools.length > 0) {
      result.toolWarnings.push(`Ignored non-built-in tools for ${agent.name}: ${ignoredTools.join(", ")}`);
    }
    args.push("--tools", getAgentToolAllowlist(agent).join(","));
    if (agent.systemPrompt) {
      const tmp = await writePromptToTempFile(agent);
      tmpPromptDir = tmp.dir;
      tmpPromptPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPromptPath);
    }
    args.push(`Task: ${task}`);

    let aborted = false;
    let timedOut = false;
    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const child = spawn(invocation.command, invocation.args, {
        cwd: resolvedCwd,
        detached: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let settled = false;
      let timeoutHandle: NodeJS.Timeout | undefined;

      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        resolve(code);
      };

      if (timeoutSeconds > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          killProcessGroup(child.pid, child);
          finish(124);
        }, timeoutSeconds * 1000);
      }

      let buffer = "";
      const processLine = (line: string) => {
        if (!line.trim()) return;

        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "message_end" && event.message) {
          const message = event.message as Message;
          result.messages.push(message);

          if (message.role === "assistant") {
            result.usage.turns++;
            result.model ||= message.model;
            result.stopReason = message.stopReason;
            result.errorMessage = message.errorMessage;
            if (message.usage) {
              result.usage.input += message.usage.input ?? 0;
              result.usage.output += message.usage.output ?? 0;
              result.usage.cacheRead += message.usage.cacheRead ?? 0;
              result.usage.cacheWrite += message.usage.cacheWrite ?? 0;
              result.usage.cost += message.usage.cost?.total ?? 0;
              result.usage.contextTokens = message.usage.totalTokens ?? result.usage.contextTokens;
            }
          }

          emitUpdate();
        }

        if (event.type === "tool_result_end" && event.message) {
          result.messages.push(event.message as Message);
          emitUpdate();
        }
      };

      child.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      });

      child.stderr.on("data", (data) => {
        result.stderr = truncateText(result.stderr + data.toString(), MAX_STDERR_CHARS);
      });

      child.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        finish(code ?? 0);
      });

      child.on("error", (error) => {
        result.stderr += `${error instanceof Error ? error.message : error}`;
        finish(1);
      });

      const abort = () => {
        aborted = true;
        killProcessGroup(child.pid, child);
      };

      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });

    result.exitCode = timedOut ? 124 : aborted ? 130 : exitCode;
    if (aborted) result.stopReason = "aborted";
    if (timedOut) {
      result.stopReason = "timeout";
      result.errorMessage = `Subagent timed out after ${timeoutSeconds} seconds`;
    }
    return result;
  } finally {
    if (tmpPromptPath) {
      try {
        fs.unlinkSync(tmpPromptPath);
      } catch {
        // Ignore cleanup errors.
      }
    }
    if (tmpPromptDir) {
      try {
        fs.rmdirSync(tmpPromptDir);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}

export default function subagentExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Delegate tasks to specialized subagents with isolated context.",
      "Use exactly one mode: single (agent + task), parallel (tasks), or chain.",
      "Project agents live in .pi/agents; user agents live in ~/.pi/agent/agents.",
    ].join(" "),
    promptSnippet: "subagent - delegate isolated work to named agents",
    promptGuidelines: [
      "Use subagent for bounded side work that benefits from isolated context.",
      "Use agentScope project for repo-local agents, user for personal agents, or both when needed.",
      "Do not use subagent recursively unless the user explicitly asks for multi-agent delegation.",
    ],
    parameters: SubagentParams,
    executionMode: "parallel",
    async execute(_toolCallId, params: SubagentParamsType, signal, onUpdate, ctx) {
      const agentScope = params.agentScope ?? "project";
      const timeoutSeconds = params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
      if (!isValidTimeoutSeconds(timeoutSeconds)) {
        return {
          content: [{ type: "text", text: "timeoutSeconds must be a non-negative number." }],
          details: { mode: "single", agentScope, results: [] },
          isError: true,
        };
      }

      const discovery = discoverAgents(ctx.cwd, agentScope);
      const agents = discovery.agents;
      const projectRoot = discovery.projectRoot ?? findNearestProjectRoot(ctx.cwd);
      const hasSingle = Boolean(params.agent && params.task);
      const hasParallel = Boolean(params.tasks?.length);
      const hasChain = Boolean(params.chain?.length);
      const modeCount = Number(hasSingle) + Number(hasParallel) + Number(hasChain);

      const makeDetails =
        (mode: SubagentDetails["mode"]) =>
        (results: SingleResult[]): SubagentDetails => ({
          mode,
          agentScope,
          results,
        });

      if (modeCount !== 1) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid parameters. Provide exactly one mode.\n\nAvailable agents:\n${formatAgentList(agents)}`,
            },
          ],
          details: makeDetails("single")([]),
          isError: true,
        };
      }

      if (agents.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No agents found for scope "${agentScope}". Use /agents to inspect search paths.`,
            },
          ],
          details: makeDetails(hasChain ? "chain" : hasParallel ? "parallel" : "single")([]),
          isError: true,
        };
      }

      const requested = new Set<string>();
      if (params.agent) requested.add(params.agent);
      for (const task of params.tasks ?? []) requested.add(task.agent);
      for (const step of params.chain ?? []) requested.add(step.agent);

      const projectAgentsRequested = Array.from(requested)
        .map((name) => agents.find((agent) => agent.name === name))
        .filter((agent): agent is AgentConfig => agent?.source === "project");

      if (projectAgentsRequested.length > 0 && (params.confirmProjectAgents ?? true) && ctx.hasUI) {
        const ok = await ctx.ui.confirm(
          "Run project-local agents?",
          [
            `Agents: ${projectAgentsRequested.map((agent) => agent.name).join(", ")}`,
            `Source: ${discovery.projectAgentsDir ?? "(unknown)"}`,
            "",
            "Project agents are repo-controlled prompts. Continue only for trusted repositories.",
          ].join("\n"),
        );
        if (!ok) {
          return {
            content: [{ type: "text", text: "Canceled: project-local agents not approved." }],
            details: makeDetails(hasChain ? "chain" : hasParallel ? "parallel" : "single")([]),
          };
        }
      }

      if (projectAgentsRequested.length > 0 && (params.confirmProjectAgents ?? true) && !ctx.hasUI) {
        return {
          content: [
            {
              type: "text",
              text: "Project-local agents require confirmation. In non-interactive mode, set confirmProjectAgents: false only for trusted repositories.",
            },
          ],
          details: makeDetails(hasChain ? "chain" : hasParallel ? "parallel" : "single")([]),
          isError: true,
        };
      }

      if (hasChain && params.chain) {
        const results: SingleResult[] = [];
        let previousOutput = "";

        for (let i = 0; i < params.chain.length; i++) {
          const step = params.chain[i];
          const task = step.task.replace(/\{previous\}/g, previousOutput);
          const update: OnUpdateCallback | undefined = onUpdate
            ? (partial) => {
                const current = partial.details?.results[0];
                if (!current) return;
                onUpdate({
                  content: partial.content,
                  details: makeDetails("chain")([...results, current]),
                });
              }
            : undefined;

          const result = await runSingleAgent(
            ctx.cwd,
            projectRoot,
            agents,
            step.agent,
            task,
            step.cwd,
            timeoutSeconds,
            i + 1,
            signal,
            update,
            makeDetails("chain"),
          );
          results.push(result);

          if (isFailure(result)) {
            return {
              content: [{ type: "text", text: `Chain stopped at step ${i + 1}.\n\n${summarizeResult(result)}` }],
              details: makeDetails("chain")(results),
              isError: true,
            };
          }

          previousOutput = getFinalOutput(result.messages);
        }

        const finalOutput = truncateText(
          getFinalOutput(results[results.length - 1].messages) || "(no output)",
          MAX_FINAL_OUTPUT_CHARS,
        );
        return { content: [{ type: "text", text: finalOutput }], details: makeDetails("chain")(results) };
      }

      if (hasParallel && params.tasks) {
        if (params.tasks.length > MAX_PARALLEL_TASKS) {
          return {
            content: [{ type: "text", text: `Too many parallel tasks. Max is ${MAX_PARALLEL_TASKS}.` }],
            details: makeDetails("parallel")([]),
            isError: true,
          };
        }

        const results = new Array<SingleResult>(params.tasks.length);
        const emitParallelUpdate = () => {
          const known = results.filter(Boolean);
          onUpdate?.({
            content: [{ type: "text", text: `Parallel subagents: ${known.length}/${params.tasks!.length} reported.` }],
            details: makeDetails("parallel")(known),
          });
        };

        await mapWithConcurrencyLimit(params.tasks, MAX_CONCURRENCY, async (task, index) => {
          results[index] = await runSingleAgent(
            ctx.cwd,
            projectRoot,
            agents,
            task.agent,
            task.task,
            task.cwd,
            timeoutSeconds,
            undefined,
            signal,
            (partial) => {
              const current = partial.details?.results[0];
              if (current) results[index] = current;
              emitParallelUpdate();
            },
            makeDetails("parallel"),
          );
          emitParallelUpdate();
          return results[index];
        });

        const failures = results.filter(isFailure);
        return {
          content: [
            {
              type: "text",
              text: truncateText(
                `Parallel subagents: ${results.length - failures.length}/${results.length} succeeded\n\n${results
                  .map(summarizeResult)
                  .join("\n\n")}`,
                MAX_FINAL_OUTPUT_CHARS,
              ),
            },
          ],
          details: makeDetails("parallel")(results),
          isError: failures.length > 0,
        };
      }

      const result = await runSingleAgent(
        ctx.cwd,
        projectRoot,
        agents,
        params.agent!,
        params.task!,
        params.cwd,
        timeoutSeconds,
        undefined,
        signal,
        onUpdate,
        makeDetails("single"),
      );

      if (isFailure(result)) {
        return {
          content: [{ type: "text", text: summarizeResult(result) }],
          details: makeDetails("single")([result]),
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: truncateText(getFinalOutput(result.messages) || "(no output)", MAX_FINAL_OUTPUT_CHARS),
          },
        ],
        details: makeDetails("single")([result]),
      };
    },
    renderCall(args: SubagentParamsType, theme) {
      const scope = args.agentScope ?? "project";
      if (args.chain?.length) {
        return new Text(
          `${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("accent", `chain ${args.chain.length}`)} ${theme.fg("muted", `[${scope}]`)}`,
          0,
          0,
        );
      }
      if (args.tasks?.length) {
        return new Text(
          `${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("accent", `parallel ${args.tasks.length}`)} ${theme.fg("muted", `[${scope}]`)}`,
          0,
          0,
        );
      }
      return new Text(
        `${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("accent", args.agent ?? "...")} ${theme.fg("muted", `[${scope}]`)}`,
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as SubagentDetails | undefined;
      if (!details?.results.length) {
        const first = result.content[0];
        return new Text(first?.type === "text" ? first.text : "(no output)", 0, 0);
      }

      const lines = details.results.map((entry) => {
        const icon = entry.exitCode === -1 ? "..." : isFailure(entry) ? "x" : "ok";
        const usage = entry.usage.turns ? ` ${entry.usage.turns} turns` : "";
        return `${icon} ${entry.agent} (${entry.agentSource})${usage}`;
      });
      if (result.isError) lines.unshift(theme.fg("error", "Subagent error"));
      return new Text(lines.join("\n"), 0, 0);
    },
  });

  pi.registerCommand("agents", {
    description: "List available subagents",
    handler: async (args, ctx) => {
      const scopeArg = args.trim();
      const scope: AgentScope =
        scopeArg === "user" || scopeArg === "project" || scopeArg === "both" ? scopeArg : "project";
      const discovery = discoverAgents(ctx.cwd, scope);
      ctx.ui.notify(
        [
          `Agent scope: ${scope}`,
          `User agents: ${discovery.userAgentsDir}`,
          `Project agents: ${discovery.projectAgentsDir ?? "(none)"}`,
          "",
          formatAgentList(discovery.agents),
        ].join("\n"),
        "info",
      );
    },
  });
}
