import { describe, expect, it } from "vitest";
import {
	decideGate,
	getPathCandidates,
	getTargetCandidates,
	globToRegExp,
	matchesAny,
	mergeConfig,
} from "./utils.ts";

describe("glob matching", () => {
	it("matches simple glob patterns case-insensitively", () => {
		expect(matchesAny("sudo reboot", ["sudo *"])).toBe(true);
		expect(matchesAny("SUDO reboot", ["sudo *"])).toBe(true);
		expect(matchesAny("chmod 777 file", ["chmod ??? *"])).toBe(true);
		expect(matchesAny("chmod 755 file", ["chmod ??? *"])).toBe(true);
		expect(matchesAny("chmod 75 file", ["chmod ??? *"])).toBe(false);
	});

	it("escapes regex metacharacters except glob wildcards", () => {
		const regexp = globToRegExp(".env.*");
		expect(regexp.test(".env.local")).toBe(true);
		expect(regexp.test("xenv.local")).toBe(false);
	});
});

describe("path candidates", () => {
	const cwd = "/Users/alice/project";
	const home = "/Users/alice";

	it("includes original, absolute, relative, ./relative, and home-relative paths", () => {
		expect(getPathCandidates("src/index.ts", cwd, home)).toEqual([
			"src/index.ts",
			"/Users/alice/project/src/index.ts",
			"./src/index.ts",
			"~/project/src/index.ts",
			"project/src/index.ts",
		]);
	});

	it("expands home-relative input", () => {
		expect(getPathCandidates("~/.ssh/config", cwd, home)).toEqual([
			"~/.ssh/config",
			"/Users/alice/.ssh/config",
			"../.ssh/config",
			"./../.ssh/config",
			".ssh/config",
		]);
	});

	it("normalizes duplicate current-directory candidates", () => {
		expect(getPathCandidates(".", cwd, home)).toEqual([".", "/Users/alice/project", "./.", "~/project", "project"]);
	});
});

describe("target candidates", () => {
	it("uses command text for bash", () => {
		expect(getTargetCandidates("bash", { command: "rm -rf dist" }, "/repo")).toEqual(["rm -rf dist"]);
	});

	it("uses path candidates for file tools", () => {
		expect(getTargetCandidates("read", { path: ".env" }, "/repo")).toContain("/repo/.env");
		expect(getTargetCandidates("edit", { path: ".env" }, "/repo")).toContain("./.env");
		expect(getTargetCandidates("write", { path: ".env" }, "/repo")).toContain(".env");
	});

	it("returns no targets when expected input is missing", () => {
		expect(getTargetCandidates("bash", {}, "/repo")).toEqual([]);
		expect(getTargetCandidates("read", {}, "/repo")).toEqual([]);
		expect(getTargetCandidates("todo", { path: ".env" }, "/repo")).toEqual([]);
	});
});

describe("config merge", () => {
	it("lets project tool actions replace global tool actions independently", () => {
		expect(
			mergeConfig(
				{
					bash: { ask: ["sudo *"], deny: ["curl * | sh"] },
					read: { deny: [".env*"] },
				},
				{
					bash: { ask: ["rm -rf *"] },
				},
			),
		).toEqual({
			bash: { allow: undefined, ask: ["rm -rf *"], deny: ["curl * | sh"] },
			read: { allow: undefined, ask: undefined, deny: [".env*"] },
			edit: { allow: undefined, ask: undefined, deny: undefined },
			write: { allow: undefined, ask: undefined, deny: undefined },
		});
	});
});

describe("gate decisions", () => {
	it("allows when no config or no target is available", () => {
		expect(decideGate(undefined, ["rm -rf dist"])).toBe("allow");
		expect(decideGate({ deny: ["*"] }, [])).toBe("allow");
	});

	it("uses deny over allow over ask precedence", () => {
		const config = {
			deny: ["*.pem"],
			allow: ["secret.pem"],
			ask: ["*"],
		};

		expect(decideGate(config, ["secret.pem"])).toBe("deny");
		expect(decideGate({ allow: ["*.md"], ask: ["*"] }, ["README.md"])).toBe("allow");
		expect(decideGate({ ask: ["sudo *"] }, ["sudo reboot"])).toBe("ask");
	});

	it("allows unmatched targets", () => {
		expect(decideGate({ ask: ["sudo *"], deny: [".env*"] }, ["ls -la"])).toBe("allow");
	});
});
