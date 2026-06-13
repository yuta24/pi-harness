/**
 * Ask Mode Extension
 *
 * Read-only Q&A mode for analysis without implementation.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { isSafeCommand } from "../plan-mode/utils.ts";

const ASK_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "question", "questionnaire"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];
const FOLLOW_UP_DELIVERY = { deliverAs: "followUp", streamingBehavior: "followUp" } as const;

export default function askModeExtension(pi: ExtensionAPI): void {
	let askModeEnabled = false;

	pi.registerFlag("ask", {
		description: "Start in ask mode (read-only Q&A)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		if (askModeEnabled) {
			ctx.ui.setStatus("ask-mode", ctx.ui.theme.fg("warning", "ask: read-only"));
		} else {
			ctx.ui.setStatus("ask-mode", undefined);
		}
	}

	function persistState(): void {
		pi.appendEntry("ask-mode", { enabled: askModeEnabled });
	}

	function setAskMode(enabled: boolean, ctx: ExtensionContext): void {
		askModeEnabled = enabled;

		if (askModeEnabled) {
			pi.setActiveTools(ASK_MODE_TOOLS);
			ctx.ui.notify(`Ask mode enabled. Tools: ${ASK_MODE_TOOLS.join(", ")}`, "info");
		} else {
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			ctx.ui.notify("Ask mode disabled. Full access restored.", "info");
		}

		updateStatus(ctx);
		persistState();
	}

	pi.registerCommand("ask", {
		description: "Toggle ask mode, or ask a read-only question",
		handler: async (args, ctx) => {
			const question = args?.trim();
			if (question) {
				if (!askModeEnabled) {
					setAskMode(true, ctx);
				}
				pi.sendUserMessage(question, FOLLOW_UP_DELIVERY);
				return;
			}

			setAskMode(!askModeEnabled, ctx);
		},
	});

	pi.registerShortcut(Key.ctrlAlt("a"), {
		description: "Toggle ask mode",
		handler: async (ctx) => setAskMode(!askModeEnabled, ctx),
	});

	pi.on("tool_call", async (event) => {
		if (!askModeEnabled) return;

		if (event.toolName === "edit" || event.toolName === "write") {
			return {
				block: true,
				reason: "Ask mode is read-only. Use /ask to disable ask mode before modifying files.",
			};
		}

		if (event.toolName === "bash") {
			const command = event.input.command as string;
			if (!isSafeCommand(command)) {
				return {
					block: true,
					reason: `Ask mode: command blocked (not allowlisted). Use /ask to disable ask mode first.\nCommand: ${command}`,
				};
			}
		}
	});

	pi.on("context", async (event) => {
		if (askModeEnabled) return;

		return {
			messages: event.messages.filter((message) => {
				const msg = message as AgentMessage & { customType?: string };
				if (msg.customType === "ask-mode-context") return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[ASK MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(part) => part.type === "text" && (part as TextContent).text?.includes("[ASK MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});

	pi.on("before_agent_start", async () => {
		if (!askModeEnabled) return;

		return {
			message: {
				customType: "ask-mode-context",
				content: `[ASK MODE ACTIVE]
You are in ask mode - a read-only Q&A mode for analysis and explanation.

Restrictions:
- You can only use: read, bash, grep, find, ls, question, questionnaire
- You CANNOT use: edit, write
- Bash is restricted to an allowlist of read-only commands

Behavior:
- Answer the user's question directly.
- Inspect files only when needed to answer accurately.
- Ask concise clarifying questions when the request is ambiguous.
- Do not implement changes, create files, modify files, run formatters, install packages, or commit.
- If the user asks you to make changes, explain that ask mode is active and they should disable it first.`,
				display: false,
			},
		};
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (!askModeEnabled || !ctx.hasUI) return;

		const followUp = await ctx.ui.editor("Ask follow-up (empty/Esc = exit ask mode):", "");
		const question = followUp?.trim();
		if (question) {
			pi.sendUserMessage(question, FOLLOW_UP_DELIVERY);
		} else {
			setAskMode(false, ctx);
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		const askModeEntry = entries
			.filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "ask-mode")
			.pop() as { data?: { enabled?: boolean } } | undefined;

		askModeEnabled = askModeEntry?.data?.enabled ?? pi.getFlag("ask") === true;

		if (askModeEnabled) {
			pi.setActiveTools(ASK_MODE_TOOLS);
		}
		updateStatus(ctx);
	});
}
