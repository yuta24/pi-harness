/**
 * Permission Gate Extension
 *
 * Configurable allow/ask/deny gate for tool calls.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

type GateAction = "allow" | "ask" | "deny";
type ToolGateConfig = Partial<Record<GateAction, string[]>>;

interface PermissionGateConfig {
	bash?: ToolGateConfig;
	read?: ToolGateConfig;
	edit?: ToolGateConfig;
	write?: ToolGateConfig;
}

const EMPTY_CONFIG: PermissionGateConfig = {};

function readConfig(path: string): PermissionGateConfig {
	if (!existsSync(path)) return EMPTY_CONFIG;

	try {
		return JSON.parse(readFileSync(path, "utf-8")) as PermissionGateConfig;
	} catch (error) {
		console.error(`Warning: Could not parse ${path}: ${error}`);
		return EMPTY_CONFIG;
	}
}

function mergeToolConfig(base: ToolGateConfig = {}, overrides: ToolGateConfig = {}): ToolGateConfig {
	return {
		allow: overrides.allow ?? base.allow,
		ask: overrides.ask ?? base.ask,
		deny: overrides.deny ?? base.deny,
	};
}

function loadConfig(cwd: string): PermissionGateConfig {
	const globalConfig = readConfig(join(getAgentDir(), "extensions", "permission-gate.json"));
	const projectConfig = readConfig(join(cwd, ".pi", "permission-gate.json"));

	return {
		bash: mergeToolConfig(globalConfig.bash, projectConfig.bash),
		read: mergeToolConfig(globalConfig.read, projectConfig.read),
		edit: mergeToolConfig(globalConfig.edit, projectConfig.edit),
		write: mergeToolConfig(globalConfig.write, projectConfig.write),
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(glob: string): RegExp {
	const source = glob
		.split("*")
		.map(escapeRegExp)
		.join(".*")
		.replace(/\\\?/g, ".");

	return new RegExp(`^${source}$`, "i");
}

function matchesAny(value: string, patterns: string[] | undefined): boolean {
	return patterns?.some((pattern) => globToRegExp(pattern).test(value)) ?? false;
}

function expandHome(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return path;
}

function normalizeSlashes(path: string): string {
	return path.replace(/\\/g, "/");
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function getPathCandidates(rawPath: string, cwd: string): string[] {
	const expandedPath = expandHome(rawPath);
	const absolutePath = isAbsolute(expandedPath) ? resolve(expandedPath) : resolve(cwd, expandedPath);
	const relativePath = relative(cwd, absolutePath) || ".";
	const homePath = homedir();
	const relativeToHome = relative(homePath, absolutePath);
	const isUnderHome = relativeToHome === "" || (!relativeToHome.startsWith("..") && !isAbsolute(relativeToHome));
	const homeRelativePath = isUnderHome ? `~/${relativeToHome}` : undefined;

	return unique(
		[
			rawPath,
			expandedPath,
			absolutePath,
			relativePath,
			`./${relativePath}`,
			homeRelativePath,
			homeRelativePath ? homeRelativePath.replace(/^~\//, "") : undefined,
		]
			.filter((value): value is string => typeof value === "string")
			.map(normalizeSlashes),
	);
}

function matchesAnyCandidate(values: string[], patterns: string[] | undefined): boolean {
	return values.some((value) => matchesAny(value, patterns));
}

function getTargetCandidates(toolName: string, input: Record<string, unknown>, cwd: string): string[] {
	if (toolName === "bash") {
		return typeof input.command === "string" ? [input.command] : [];
	}
	if (toolName === "read" || toolName === "edit" || toolName === "write") {
		return typeof input.path === "string" ? getPathCandidates(input.path, cwd) : [];
	}
	return [];
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash" && event.toolName !== "read" && event.toolName !== "edit" && event.toolName !== "write") {
			return undefined;
		}

		const config = loadConfig(ctx.cwd);
		const toolConfig = config[event.toolName];
		const targets = getTargetCandidates(event.toolName, event.input, ctx.cwd);
		const displayTarget = targets[0];
		if (!toolConfig || !displayTarget) return undefined;

		if (matchesAnyCandidate(targets, toolConfig.deny)) {
			return { block: true, reason: `Permission denied by permission-gate: ${displayTarget}` };
		}

		if (matchesAnyCandidate(targets, toolConfig.allow)) return undefined;

		if (!matchesAnyCandidate(targets, toolConfig.ask)) return undefined;

		if (!ctx.hasUI) {
			return { block: true, reason: "Permission confirmation required, but no UI is available" };
		}

		const choice = await ctx.ui.select(`Permission required:\n\n  ${event.toolName}: ${displayTarget}\n\nAllow?`, [
			"Yes",
			"No",
		]);
		if (choice !== "Yes") {
			return { block: true, reason: "Blocked by user" };
		}

		return undefined;
	});
}
