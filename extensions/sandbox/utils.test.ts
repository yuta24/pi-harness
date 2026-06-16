import { describe, expect, it } from "vitest";
import { deepMerge, type SandboxConfig } from "./utils.ts";

describe("sandbox config merge", () => {
	it("combines global and project filesystem lists", () => {
		const base: SandboxConfig = {
			enabled: true,
			network: {
				allowedDomains: [],
				deniedDomains: [],
			},
			filesystem: {
				denyRead: ["~/.ssh"],
				allowWrite: [".", "/tmp", "/private/tmp"],
				denyWrite: [".env"],
			},
		};
		const overrides: Partial<SandboxConfig> = {
			filesystem: {
				denyRead: ["~/.aws"],
				allowWrite: [".", "/var/folders/example/T"],
				denyWrite: ["*.pem"],
			},
		};

		expect(deepMerge(base, overrides).filesystem).toEqual({
			denyRead: ["~/.ssh", "~/.aws"],
			allowWrite: [".", "/tmp", "/private/tmp", "/var/folders/example/T"],
			denyWrite: [".env", "*.pem"],
		});
	});

	it("combines network domain lists without duplicates", () => {
		const base: SandboxConfig = {
			network: {
				allowedDomains: ["github.com", "registry.npmjs.org"],
				deniedDomains: ["example.com"],
			},
			filesystem: {
				denyRead: [],
				allowWrite: [],
				denyWrite: [],
			},
		};
		const overrides: Partial<SandboxConfig> = {
			network: {
				allowedDomains: ["github.com", "crates.io"],
				deniedDomains: ["bad.example"],
			},
		};

		expect(deepMerge(base, overrides).network).toEqual({
			allowedDomains: ["github.com", "registry.npmjs.org", "crates.io"],
			deniedDomains: ["example.com", "bad.example"],
		});
	});

	it("lets scalar and extension options override the base config", () => {
		const merged = deepMerge(
			{
				enabled: true,
				network: { allowedDomains: ["github.com"] },
				filesystem: { allowWrite: ["."] },
			} as SandboxConfig,
			{
				enabled: false,
				enableWeakerNestedSandbox: true,
				ignoreViolations: { filesystem: ["node_modules/**"] },
			} as Partial<SandboxConfig>,
		);

		expect(merged.enabled).toBe(false);
		expect((merged as { enableWeakerNestedSandbox?: boolean }).enableWeakerNestedSandbox).toBe(true);
		expect((merged as { ignoreViolations?: Record<string, string[]> }).ignoreViolations).toEqual({
			filesystem: ["node_modules/**"],
		});
	});
});
