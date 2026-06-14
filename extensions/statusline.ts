/**
 * Status Line Extension
 *
 * Displays a compact Claude/Codex-style status segment in Pi's footer.
 * Keeps cross-cutting session/model/context/git information in one place.
 */

import { execFile } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "harness-statusline";
const BRANCH_TTL_MS = 30_000;

function compactModel(provider?: string, modelId?: string): string {
	if (!provider && !modelId) return "model ?";
	if (!modelId) return provider ?? "model ?";

	const shortId = modelId
		.replace(/^claude-/, "")
		.replace(/^gpt-/, "")
		.replace(/^gemini-/, "")
		.replace(/-\d{8}$/, "")
		.replace(/-\d{4}-\d{2}-\d{2}$/, "");
	return provider ? `${provider}/${shortId}` : shortId;
}

function compactSession(name?: string): string | undefined {
	const trimmed = name?.trim();
	if (!trimmed) return undefined;
	return trimmed.length > 24 ? `${trimmed.slice(0, 21)}...` : trimmed;
}

function contextText(usage: ReturnType<ExtensionContext["getContextUsage"]>): string | undefined {
	if (!usage) return undefined;
	if (typeof usage.percent === "number") return `ctx ${Math.round(usage.percent)}%`;
	if (typeof usage.tokens === "number" && typeof usage.contextWindow === "number" && usage.contextWindow > 0) {
		return `ctx ${Math.round((usage.tokens / usage.contextWindow) * 100)}%`;
	}
	if (typeof usage.tokens === "number") {
		if (usage.tokens >= 1000) return `ctx ${(usage.tokens / 1000).toFixed(1)}k`;
		return `ctx ${usage.tokens}`;
	}
	return undefined;
}

function readGitBranch(cwd: string): Promise<string | undefined> {
	return new Promise((resolve) => {
		execFile("git", ["branch", "--show-current"], { cwd, timeout: 1000 }, (error, stdout) => {
			if (error) {
				resolve(undefined);
				return;
			}
			const branch = stdout.trim();
			resolve(branch || undefined);
		});
	});
}

export default function (pi: ExtensionAPI) {
	let turnCount = 0;
	let agentRunning = false;
	let gitBranch: string | undefined;
	let gitBranchCheckedAt = 0;

	async function refreshGitBranch(cwd: string): Promise<void> {
		const now = Date.now();
		if (now - gitBranchCheckedAt < BRANCH_TTL_MS) return;
		gitBranchCheckedAt = now;
		gitBranch = await readGitBranch(cwd);
	}

	async function render(ctx: ExtensionContext): Promise<void> {
		await refreshGitBranch(ctx.cwd);

		const theme = ctx.ui.theme;
		const usage = ctx.getContextUsage();
		const session = compactSession(pi.getSessionName());
		const model = compactModel(ctx.model?.provider, ctx.model?.id);
		const context = contextText(usage);
		const state = agentRunning ? theme.fg("accent", "● running") : theme.fg("success", "✓ ready");
		const turn = turnCount > 0 ? `turn ${turnCount}` : undefined;

		const dimParts = [gitBranch, session, model, context, turn]
			.filter((part): part is string => typeof part === "string")
			.map((part) => theme.fg("dim", part));
		ctx.ui.setStatus(STATUS_KEY, [...dimParts, state].join(theme.fg("dim", " · ")));
	}

	pi.on("session_start", async (_event, ctx) => {
		await render(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		turnCount++;
		await render(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		await render(ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		agentRunning = true;
		await render(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		agentRunning = false;
		await render(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		await render(ctx);
	});
}
