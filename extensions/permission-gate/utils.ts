import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

export type GateAction = "allow" | "ask" | "deny";
export type ToolGateConfig = Partial<Record<GateAction, string[]>>;

export interface PermissionGateConfig {
	bash?: ToolGateConfig;
	read?: ToolGateConfig;
	edit?: ToolGateConfig;
	write?: ToolGateConfig;
}

export type GateDecision = "allow" | "ask" | "deny";

function mergeLists(base?: string[], overrides?: string[]): string[] | undefined {
	const merged = [...(base ?? []), ...(overrides ?? [])];
	const unique = Array.from(new Set(merged));
	return unique.length > 0 ? unique : undefined;
}

export function mergeToolConfig(base: ToolGateConfig = {}, overrides: ToolGateConfig = {}): ToolGateConfig {
	return {
		allow: mergeLists(base.allow, overrides.allow),
		ask: mergeLists(base.ask, overrides.ask),
		deny: mergeLists(base.deny, overrides.deny),
	};
}

export function mergeConfig(globalConfig: PermissionGateConfig, projectConfig: PermissionGateConfig): PermissionGateConfig {
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

export function globToRegExp(glob: string): RegExp {
	const source = glob
		.split("*")
		.map(escapeRegExp)
		.join(".*")
		.replace(/\\\?/g, ".");

	return new RegExp(`^${source}$`, "i");
}

export function matchesAny(value: string, patterns: string[] | undefined): boolean {
	return patterns?.some((pattern) => globToRegExp(pattern).test(value)) ?? false;
}

function expandHome(path: string, homeDir: string): string {
	if (path === "~") return homeDir;
	if (path.startsWith("~/")) return join(homeDir, path.slice(2));
	return path;
}

function normalizeSlashes(path: string): string {
	return path.replace(/\\/g, "/");
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

export function getPathCandidates(rawPath: string, cwd: string, homeDir = homedir()): string[] {
	const expandedPath = expandHome(rawPath, homeDir);
	const absolutePath = isAbsolute(expandedPath) ? resolve(expandedPath) : resolve(cwd, expandedPath);
	const relativePath = relative(cwd, absolutePath) || ".";
	const relativeToHome = relative(homeDir, absolutePath);
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

export function matchesAnyCandidate(values: string[], patterns: string[] | undefined): boolean {
	return values.some((value) => matchesAny(value, patterns));
}

export function getTargetCandidates(toolName: string, input: Record<string, unknown>, cwd: string): string[] {
	if (toolName === "bash") {
		return typeof input.command === "string" ? [input.command] : [];
	}
	if (toolName === "read" || toolName === "edit" || toolName === "write") {
		return typeof input.path === "string" ? getPathCandidates(input.path, cwd) : [];
	}
	return [];
}

export function decideGate(toolConfig: ToolGateConfig | undefined, targets: string[]): GateDecision {
	if (!toolConfig || targets.length === 0) return "allow";
	if (matchesAnyCandidate(targets, toolConfig.deny)) return "deny";
	if (matchesAnyCandidate(targets, toolConfig.allow)) return "allow";
	if (matchesAnyCandidate(targets, toolConfig.ask)) return "ask";
	return "allow";
}
