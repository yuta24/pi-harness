/**
 * Permission Gate Extension
 *
 * Configurable allow/ask/deny gate for tool calls.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { decideGate, getTargetCandidates, mergeConfig, type PermissionGateConfig } from "./permission-gate/utils.ts";

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

function loadConfig(cwd: string): PermissionGateConfig {
	const globalConfig = readConfig(join(getAgentDir(), "extensions", "permission-gate.json"));
	const projectConfig = readConfig(join(cwd, ".pi", "permission-gate.json"));

	return mergeConfig(globalConfig, projectConfig);
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

		const decision = decideGate(toolConfig, targets);
		if (decision === "deny") {
			return { block: true, reason: `Permission denied by permission-gate: ${displayTarget}` };
		}

		if (decision === "allow") return undefined;

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
