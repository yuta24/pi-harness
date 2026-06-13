/**
 * Ask Mode Extension
 *
 * Read-only Q&A mode. The assistant may inspect but must not modify.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const ASK_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "question", "questionnaire"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];

const DESTRUCTIVE_PATTERNS = [
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
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bkill\b/i,
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
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*ps\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
];

function isSafeReadOnlyCommand(command: string): boolean {
	const isDestructive = DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
	const isSafe = SAFE_PATTERNS.some((pattern) => pattern.test(command));
	return !isDestructive && isSafe;
}

export default function askExtension(pi: ExtensionAPI): void {
	let askModeEnabled = false;
	let previousTools: string[] | undefined;

	pi.registerFlag("ask", {
		description: "Start in ask mode (read-only Q&A)",
		type: "boolean",
		default: false,
	});

	function persistState(): void {
		pi.appendEntry("ask-mode", {
			enabled: askModeEnabled,
			previousTools,
		});
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (askModeEnabled) {
			ctx.ui.setStatus("ask-mode", ctx.ui.theme.fg("warning", "ask"));
		} else {
			ctx.ui.setStatus("ask-mode", undefined);
		}
	}

	function enterAskMode(ctx: ExtensionContext): void {
		if (!askModeEnabled) {
			previousTools = pi.getActiveTools();
		}
		askModeEnabled = true;
		pi.setActiveTools(ASK_MODE_TOOLS);
		ctx.ui.notify(`Ask mode enabled. Tools: ${ASK_MODE_TOOLS.join(", ")}`, "info");
		updateStatus(ctx);
		persistState();
	}

	function exitAskMode(ctx: ExtensionContext): void {
		askModeEnabled = false;
		pi.setActiveTools(previousTools ?? NORMAL_MODE_TOOLS);
		previousTools = undefined;
		ctx.ui.notify("Ask mode disabled. Full access restored.", "info");
		updateStatus(ctx);
		persistState();
	}

	pi.registerCommand("ask", {
		description: "Toggle ask mode (read-only Q&A)",
		handler: async (_args, ctx) => {
			if (askModeEnabled) {
				exitAskMode(ctx);
			} else {
				enterAskMode(ctx);
			}
		},
	});

	pi.registerCommand("normal", {
		description: "Exit ask mode and return to normal mode",
		handler: async (_args, ctx) => {
			if (!askModeEnabled) {
				ctx.ui.notify("Already in normal mode.", "info");
				return;
			}
			exitAskMode(ctx);
		},
	});

	pi.on("tool_call", async (event) => {
		if (!askModeEnabled) return;

		if (event.toolName === "edit" || event.toolName === "write") {
			return {
				block: true,
				reason: "Ask mode is read-only. Use /normal to leave ask mode before modifying files.",
			};
		}

		if (isToolCallEventType("bash", event) && !isSafeReadOnlyCommand(event.input.command)) {
			return {
				block: true,
				reason: `Ask mode blocks non-read-only bash commands.\nUse /normal to leave ask mode.\nCommand: ${event.input.command}`,
			};
		}
	});

	pi.on("before_agent_start", async () => {
		if (!askModeEnabled) return;

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
	});

	pi.on("session_start", async (_event, ctx) => {
		const entry = ctx.sessionManager
			.getEntries()
			.filter((candidate: { type: string; customType?: string }) => {
				return candidate.type === "custom" && candidate.customType === "ask-mode";
			})
			.pop() as { data?: { enabled?: boolean; previousTools?: string[] } } | undefined;

		askModeEnabled = Boolean(entry?.data?.enabled ?? pi.getFlag("ask"));
		previousTools = entry?.data?.previousTools;

		if (askModeEnabled) {
			pi.setActiveTools(ASK_MODE_TOOLS);
		}
		updateStatus(ctx);
	});
}
