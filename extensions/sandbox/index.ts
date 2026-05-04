/**
 * Sandbox Extension - OS-level sandboxing for bash commands.
 *
 * Uses @anthropic-ai/sandbox-runtime to enforce filesystem and network
 * restrictions on bash commands at the OS level (sandbox-exec on macOS,
 * bubblewrap on Linux).
 *
 * Config files are merged in this order:
 * - ~/.pi/agent/extensions/sandbox.json
 * - <cwd>/.pi/sandbox.json
 *
 * Applies only to assistant `bash` tool calls. User shell commands entered with
 * `!` or `!!` are not sandboxed.
 *
 * Use `pi --no-sandbox` to disable this extension for a run.
 * Use `/sandbox` inside pi to inspect the active configuration.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SandboxManager, type SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import { type ExtensionAPI, getAgentDir, isToolCallEventType } from "@mariozechner/pi-coding-agent";

interface SandboxConfig extends SandboxRuntimeConfig {
  enabled?: boolean;
}

type SandboxConfigKey = keyof SandboxConfig;

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  network: {
    allowedDomains: [
      "npmjs.org",
      "*.npmjs.org",
      "registry.npmjs.org",
      "registry.yarnpkg.com",
      "pypi.org",
      "*.pypi.org",
      "github.com",
      "*.github.com",
      "api.github.com",
      "raw.githubusercontent.com",
    ],
    deniedDomains: [],
  },
  filesystem: {
    denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
    allowWrite: [".", "/tmp"],
    denyWrite: [".env", ".env.*", "*.pem", "*.key"],
  },
};

function loadJsonConfig(path: string): Partial<SandboxConfig> {
  if (!existsSync(path)) return {};

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return validateConfig(path, parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid sandbox config ${path}: ${message}`);
  }
}

function loadConfig(cwd: string): SandboxConfig {
  const globalConfigPath = join(getAgentDir(), "extensions", "sandbox.json");
  const projectConfigPath = join(cwd, ".pi", "sandbox.json");

  return deepMerge(
    deepMerge(DEFAULT_CONFIG, loadJsonConfig(globalConfigPath)),
    loadJsonConfig(projectConfigPath),
  );
}

function deepMerge(base: SandboxConfig, overrides: Partial<SandboxConfig>): SandboxConfig {
  const result: SandboxConfig = { ...base };

  if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
  if (overrides.network) result.network = { ...base.network, ...overrides.network };
  if (overrides.filesystem) result.filesystem = { ...base.filesystem, ...overrides.filesystem };

  const optionalOverrides = overrides as {
    ignoreViolations?: Record<string, string[]>;
    enableWeakerNestedSandbox?: boolean;
  };
  const optionalResult = result as {
    ignoreViolations?: Record<string, string[]>;
    enableWeakerNestedSandbox?: boolean;
  };

  if (optionalOverrides.ignoreViolations) {
    optionalResult.ignoreViolations = optionalOverrides.ignoreViolations;
  }
  if (optionalOverrides.enableWeakerNestedSandbox !== undefined) {
    optionalResult.enableWeakerNestedSandbox = optionalOverrides.enableWeakerNestedSandbox;
  }

  return result;
}

function validateConfig(path: string, value: unknown): Partial<SandboxConfig> {
  if (!isRecord(value)) {
    throw new Error("config must be a JSON object");
  }

  const allowedKeys: SandboxConfigKey[] = ["enabled", "network", "filesystem"];
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key as SandboxConfigKey) && !isOptionalRuntimeKey(key)) {
      throw new Error(`unknown top-level key "${key}"`);
    }
  }

  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    throw new Error("enabled must be a boolean");
  }

  if (value.network !== undefined) {
    validateNetworkConfig(value.network);
  }

  if (value.filesystem !== undefined) {
    validateFilesystemConfig(value.filesystem);
  }

  const optionalValue = value as {
    ignoreViolations?: unknown;
    enableWeakerNestedSandbox?: unknown;
  };

  if (
    optionalValue.ignoreViolations !== undefined &&
    !isRecordOfStringArrays(optionalValue.ignoreViolations)
  ) {
    throw new Error("ignoreViolations must be an object of string arrays");
  }

  if (
    optionalValue.enableWeakerNestedSandbox !== undefined &&
    typeof optionalValue.enableWeakerNestedSandbox !== "boolean"
  ) {
    throw new Error("enableWeakerNestedSandbox must be a boolean");
  }

  return value as Partial<SandboxConfig>;
}

function validateNetworkConfig(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error("network must be an object");
  }

  assertKnownKeys("network", value, ["allowedDomains", "deniedDomains"]);
  assertOptionalStringArray("network.allowedDomains", value.allowedDomains);
  assertOptionalStringArray("network.deniedDomains", value.deniedDomains);
}

function validateFilesystemConfig(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error("filesystem must be an object");
  }

  assertKnownKeys("filesystem", value, ["denyRead", "allowWrite", "denyWrite"]);
  assertOptionalStringArray("filesystem.denyRead", value.denyRead);
  assertOptionalStringArray("filesystem.allowWrite", value.allowWrite);
  assertOptionalStringArray("filesystem.denyWrite", value.denyWrite);
}

function assertKnownKeys(scope: string, value: Record<string, unknown>, allowedKeys: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`unknown ${scope} key "${key}"`);
    }
  }
}

function assertOptionalStringArray(name: string, value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${name} must be an array of strings`);
  }
}

function isOptionalRuntimeKey(key: string): boolean {
  return key === "ignoreViolations" || key === "enableWeakerNestedSandbox";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordOfStringArrays(value: unknown): value is Record<string, string[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (entry) => Array.isArray(entry) && entry.every((item) => typeof item === "string"),
  );
}

export default function sandboxExtension(pi: ExtensionAPI) {
  pi.registerFlag("no-sandbox", {
    description: "Disable OS-level sandboxing for bash commands",
    type: "boolean",
    default: false,
  });

  let sandboxEnabled = false;
  let sandboxInitialized = false;
  let sandboxFailure: string | undefined;

  pi.on("tool_call", async (event) => {
    if (!isToolCallEventType("bash", event)) return;
    if (!sandboxEnabled) return;

    if (!sandboxInitialized) {
      return {
        block: true,
        reason: sandboxFailure
          ? `Sandbox initialization failed: ${sandboxFailure}`
          : "Sandbox is enabled but not initialized",
      };
    }

    try {
      event.input.command = await SandboxManager.wrapWithSandbox(event.input.command);
    } catch (error) {
      return {
        block: true,
        reason: `Sandbox command wrapping failed: ${error instanceof Error ? error.message : error}`,
      };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    if (pi.getFlag("no-sandbox") as boolean) {
      sandboxEnabled = false;
      sandboxInitialized = false;
      sandboxFailure = undefined;
      ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
      return;
    }

    let config: SandboxConfig;
    try {
      config = loadConfig(ctx.cwd);
    } catch (error) {
      sandboxEnabled = true;
      sandboxInitialized = false;
      sandboxFailure = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(sandboxFailure, "error");
      return;
    }

    if (!config.enabled) {
      sandboxEnabled = false;
      sandboxInitialized = false;
      sandboxFailure = undefined;
      ctx.ui.notify("Sandbox disabled via config", "info");
      return;
    }

    sandboxEnabled = true;

    if (process.platform !== "darwin" && process.platform !== "linux") {
      sandboxInitialized = false;
      sandboxFailure = `Sandbox not supported on ${process.platform}`;
      ctx.ui.notify(sandboxFailure, "error");
      return;
    }

    try {
      const configExtensions = config as unknown as {
        ignoreViolations?: Record<string, string[]>;
        enableWeakerNestedSandbox?: boolean;
      };

      await SandboxManager.initialize({
        network: config.network,
        filesystem: config.filesystem,
        ignoreViolations: configExtensions.ignoreViolations,
        enableWeakerNestedSandbox: configExtensions.enableWeakerNestedSandbox,
      });

      sandboxInitialized = true;
      sandboxFailure = undefined;

      const networkCount = config.network?.allowedDomains?.length ?? 0;
      const writeCount = config.filesystem?.allowWrite?.length ?? 0;
      ctx.ui.setStatus(
        "sandbox",
        ctx.ui.theme.fg("accent", `Sandbox: ${networkCount} domains, ${writeCount} write paths`),
      );
      ctx.ui.notify("Sandbox initialized", "info");
    } catch (error) {
      sandboxInitialized = false;
      sandboxFailure = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(
        `Sandbox initialization failed: ${sandboxFailure}`,
        "error",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    try {
      if (sandboxInitialized) {
        await SandboxManager.reset();
      }
    } catch {
      // Ignore cleanup errors.
    }

    sandboxInitialized = false;
    sandboxEnabled = false;
    sandboxFailure = undefined;
  });

  pi.registerCommand("sandbox", {
    description: "Show sandbox configuration",
    handler: async (_args, ctx) => {
      let config: SandboxConfig;
      try {
        config = loadConfig(ctx.cwd);
      } catch (error) {
        ctx.ui.notify(
          `Invalid sandbox config: ${error instanceof Error ? error.message : error}`,
          "error",
        );
        return;
      }

      const lines = [
        `Sandbox: ${sandboxEnabled ? "enabled" : "disabled"}`,
        `Initialized: ${sandboxInitialized ? "yes" : "no"}`,
        `Scope: assistant bash tool calls only; ! and !! user commands are not sandboxed`,
        ...(sandboxFailure ? [`Failure: ${sandboxFailure}`] : []),
        "",
        "Network:",
        `  Allowed: ${config.network?.allowedDomains?.join(", ") || "(none)"}`,
        `  Denied: ${config.network?.deniedDomains?.join(", ") || "(none)"}`,
        "",
        "Filesystem:",
        `  Deny Read: ${config.filesystem?.denyRead?.join(", ") || "(none)"}`,
        `  Allow Write: ${config.filesystem?.allowWrite?.join(", ") || "(none)"}`,
        `  Deny Write: ${config.filesystem?.denyWrite?.join(", ") || "(none)"}`,
      ];

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
