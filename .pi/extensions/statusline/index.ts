/**
 * Statusline Extension
 *
 * Claude Code / Codex style user-customizable statusline. A project-local
 * executable is run periodically without a shell, and its stdout is rendered as
 * the footer.
 */
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import {
  type NormalizedStatuslineConfig,
  type ScriptResult,
  type StatuslineContext,
  buildScriptEnv,
  normalizeConfig,
  resolveCommand,
  truncateOutput,
} from "./utils.js";

const CONFIG_PATH = ".pi/statusline.json";

export default function statuslineExtension(pi: ExtensionAPI): void {
  let config: NormalizedStatuslineConfig | undefined;
  let commandPath: string | undefined;
  let enabled = true;

  function loadConfig(ctx: ExtensionContext): void {
    const path = join(ctx.cwd, CONFIG_PATH);
    const raw = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};
    config = normalizeConfig(raw);
    commandPath = resolveCommand(config, ctx.cwd);
    enabled = config.enabled;
  }

  function installFooter(ctx: ExtensionContext): void {
    if (!enabled || !config || !commandPath) {
      ctx.ui.setFooter(undefined);
      return;
    }

    const activeConfig = config;
    const activeCommand = commandPath;

    ctx.ui.setFooter((tui, theme, footerData) => {
      let cachedText = theme.fg("dim", "statusline: starting");
      let running = false;
      let disposed = false;
      const runningChildren = new Set<ChildProcessWithoutNullStreams>();

      const requestRender = () => {
        if (!disposed) tui.requestRender();
      };

      const unsubBranch = footerData.onBranchChange(requestRender);

      const run = async () => {
        if (running || disposed) return;
        running = true;

        const context = buildContext(ctx, footerData.getGitBranch(), footerData.getExtensionStatuses());
        const result = await runStatuslineScript(activeCommand, activeConfig, context, runningChildren);

        if (result.ok) {
          cachedText = result.text || "";
        } else if (result.timedOut) {
          cachedText = theme.fg("warning", "statusline: timeout");
        } else {
          cachedText = theme.fg("warning", `statusline: failed${result.exitCode === null ? "" : ` (${result.exitCode})`}`);
        }

        running = false;
        requestRender();
      };

      const interval = setInterval(run, activeConfig.refreshMs);
      void run();

      return {
        dispose() {
          disposed = true;
          clearInterval(interval);
          unsubBranch();
          for (const child of runningChildren) {
            child.kill("SIGKILL");
          }
          runningChildren.clear();
        },
        invalidate() {},
        render(width: number): string[] {
          return [truncateToWidth(cachedText, width)];
        },
      };
    });
  }

  pi.registerCommand("statusline", {
    description: "Manage custom statusline",
    handler: async (args, ctx) => {
      const action = args?.trim() || "show";

      if (action === "off") {
        enabled = false;
        ctx.ui.setFooter(undefined);
        ctx.ui.notify("Statusline disabled.", "info");
        return;
      }

      if (action === "on") {
        enabled = true;
        installFooter(ctx);
        ctx.ui.notify("Statusline enabled.", "info");
        return;
      }

      if (action === "reload") {
        try {
          loadConfig(ctx);
          installFooter(ctx);
          ctx.ui.notify("Statusline config reloaded.", "info");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.setFooter(undefined);
          ctx.ui.notify(`Statusline disabled: ${message}`, "error");
        }
        return;
      }

      ctx.ui.notify(
        [
          `Enabled: ${enabled ? "yes" : "no"}`,
          `Command: ${commandPath ?? "(not loaded)"}`,
          `Refresh: ${config?.refreshMs ?? "?"}ms`,
          `Timeout: ${config?.timeoutMs ?? "?"}ms`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      loadConfig(ctx);
      installFooter(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.setFooter(undefined);
      ctx.ui.notify(`Statusline disabled: ${message}`, "error");
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setFooter(undefined);
  });
}

async function runStatuslineScript(
  command: string,
  config: NormalizedStatuslineConfig,
  context: StatuslineContext,
  runningChildren?: Set<ChildProcessWithoutNullStreams>,
): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const child = spawn(command, config.args, {
      cwd: context.cwd,
      shell: false,
      env: {
        PATH: process.env.PATH ?? "",
        ...buildScriptEnv(context),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    runningChildren?.add(child);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: ScriptResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      runningChildren?.delete(child);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ text: "", ok: false, timedOut: true, exitCode: null });
    }, config.timeoutMs);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdout = truncateOutput(stdout + chunk, config.maxOutputChars);
    });
    child.stderr.on("data", (chunk) => {
      stderr = truncateOutput(stderr + chunk, config.maxOutputChars);
    });
    child.stdin.on("error", () => {
      // The script may exit before reading stdin. Keep statusline rendering alive.
    });

    child.on("error", (error) => {
      finish({ text: error.message, ok: false, timedOut: false, exitCode: null });
    });

    child.on("close", (code) => {
      const ok = code === 0;
      finish({
        text: truncateOutput(ok ? stdout : stderr || stdout, config.maxOutputChars),
        ok,
        timedOut: false,
        exitCode: code,
      });
    });

    child.stdin.end(JSON.stringify(context));
  });
}

function buildContext(
  ctx: ExtensionContext,
  gitBranch: string | null,
  statuses: ReadonlyMap<string, string>,
): StatuslineContext {
  let input = 0;
  let output = 0;
  let cost = 0;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      const message = entry.message as AssistantMessage;
      input += message.usage?.input ?? 0;
      output += message.usage?.output ?? 0;
      cost += message.usage?.cost?.total ?? 0;
    }
  }

  const contextUsage = ctx.getContextUsage();
  const extensionStatuses: Record<string, string> = {};
  for (const [key, value] of statuses.entries()) {
    extensionStatuses[key] = stripAnsi(value);
  }

  return {
    provider: ctx.model?.provider ?? "",
    model: ctx.model?.id ?? "",
    cwd: ctx.cwd,
    gitBranch: gitBranch ?? "",
    contextPercent: contextUsage?.percent === null || contextUsage?.percent === undefined ? "" : String(contextUsage.percent),
    inputTokens: String(input),
    outputTokens: String(output),
    cost: cost.toFixed(6),
    extensionStatuses,
  };
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}
