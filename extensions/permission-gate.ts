/**
 * Permission Gate Extension
 *
 * Configurable allow/ask/deny gate for tool calls.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

type GateAction = "allow" | "ask" | "deny";
type ToolGateConfig = Partial<Record<GateAction, string[]>>;

interface PermissionGateConfig {
	bash?: ToolGateConfig;
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

function getTarget(toolName: string, input: Record<string, unknown>): string | undefined {
	if (toolName === "bash") return typeof input.command === "string" ? input.command : undefined;
	if (toolName === "edit" || toolName === "write") return typeof input.path === "string" ? input.path : undefined;
	return undefined;
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash" && event.toolName !== "edit" && event.toolName !== "write") {
			return undefined;
		}

		const config = loadConfig(ctx.cwd);
		const toolConfig = config[event.toolName];
		const target = getTarget(event.toolName, event.input);
		if (!toolConfig || !target) return undefined;

		if (matchesAny(target, toolConfig.deny)) {
			return { block: true, reason: `Permission denied by permission-gate: ${target}` };
		}

		if (matchesAny(target, toolConfig.allow)) return undefined;

		if (!matchesAny(target, toolConfig.ask)) return undefined;

		if (!ctx.hasUI) {
			return { block: true, reason: "Permission confirmation required, but no UI is available" };
		}

		const choice = await ctx.ui.select(`Permission required:\n\n  ${event.toolName}: ${target}\n\nAllow?`, ["Yes", "No"]);
		if (choice !== "Yes") {
			return { block: true, reason: "Blocked by user" };
		}

		return undefined;
	});
}
