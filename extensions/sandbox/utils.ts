import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

export interface SandboxConfig extends SandboxRuntimeConfig {
	enabled?: boolean;
}

function mergeLists(base?: string[], overrides?: string[]): string[] {
	const merged = [...(base ?? []), ...(overrides ?? [])];
	return Array.from(new Set(merged));
}

export function deepMerge(base: SandboxConfig, overrides: Partial<SandboxConfig>): SandboxConfig {
	const result: SandboxConfig = { ...base };

	if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
	if (overrides.network) {
		result.network = {
			...base.network,
			...overrides.network,
			allowedDomains: mergeLists(base.network?.allowedDomains, overrides.network.allowedDomains),
			deniedDomains: mergeLists(base.network?.deniedDomains, overrides.network.deniedDomains),
		};
	}
	if (overrides.filesystem) {
		result.filesystem = {
			...base.filesystem,
			...overrides.filesystem,
			denyRead: mergeLists(base.filesystem?.denyRead, overrides.filesystem.denyRead),
			allowWrite: mergeLists(base.filesystem?.allowWrite, overrides.filesystem.allowWrite),
			denyWrite: mergeLists(base.filesystem?.denyWrite, overrides.filesystem.denyWrite),
		};
	}

	const extOverrides = overrides as {
		ignoreViolations?: Record<string, string[]>;
		enableWeakerNestedSandbox?: boolean;
	};
	const extResult = result as { ignoreViolations?: Record<string, string[]>; enableWeakerNestedSandbox?: boolean };

	if (extOverrides.ignoreViolations) {
		extResult.ignoreViolations = extOverrides.ignoreViolations;
	}
	if (extOverrides.enableWeakerNestedSandbox !== undefined) {
		extResult.enableWeakerNestedSandbox = extOverrides.enableWeakerNestedSandbox;
	}

	return result;
}
