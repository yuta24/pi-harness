import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedDirs = vi.hoisted(() => ({
	userAgentRoot: "",
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		getAgentDir: () => mockedDirs.userAgentRoot,
	};
});

import { discoverAgents, formatAgentList } from "./agents.ts";

let tempDir: string;

function writeAgent(dir: string, fileName: string, frontmatter: Record<string, string>, body: string): string {
	fs.mkdirSync(dir, { recursive: true });
	const filePath = path.join(dir, fileName);
	const yaml = Object.entries(frontmatter)
		.map(([key, value]) => `${key}: ${value}`)
		.join("\n");
	fs.writeFileSync(filePath, `---\n${yaml}\n---\n\n${body}\n`, "utf-8");
	return filePath;
}

function makeProjectAgentsDir(): { projectRoot: string; nestedCwd: string; agentsDir: string } {
	const projectRoot = path.join(tempDir, "project");
	const nestedCwd = path.join(projectRoot, "src", "feature");
	const agentsDir = path.join(projectRoot, ".pi", "agents");
	fs.mkdirSync(nestedCwd, { recursive: true });
	return { projectRoot, nestedCwd, agentsDir };
}

describe("discoverAgents", () => {
	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-agents-test-"));
		mockedDirs.userAgentRoot = path.join(tempDir, "user-agent-root");
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("loads project agents from the nearest .pi/agents directory", () => {
		const { nestedCwd, agentsDir } = makeProjectAgentsDir();
		const filePath = writeAgent(
			agentsDir,
			"scout.md",
			{
				name: "scout",
				description: "Finds relevant files",
				tools: "read, grep, find",
				model: "claude-haiku-4-5",
			},
			"Scout system prompt.",
		);

		const result = discoverAgents(nestedCwd, "project");

		expect(result.projectAgentsDir).toBe(agentsDir);
		expect(result.agents).toEqual([
			{
				name: "scout",
				description: "Finds relevant files",
				tools: ["read", "grep", "find"],
				model: "claude-haiku-4-5",
				systemPrompt: "Scout system prompt.",
				source: "project",
				filePath,
			},
		]);
	});

	it("ignores markdown files without required frontmatter", () => {
		const { nestedCwd, agentsDir } = makeProjectAgentsDir();
		writeAgent(agentsDir, "missing-name.md", { description: "No name" }, "Prompt.");
		writeAgent(agentsDir, "missing-description.md", { name: "worker" }, "Prompt.");
		fs.writeFileSync(path.join(agentsDir, "notes.txt"), "not an agent", "utf-8");

		const result = discoverAgents(nestedCwd, "project");

		expect(result.agents).toEqual([]);
	});

	it("loads only user agents for user scope", () => {
		const { nestedCwd, agentsDir } = makeProjectAgentsDir();
		const userAgentsDir = path.join(mockedDirs.userAgentRoot, "agents");
		writeAgent(userAgentsDir, "reviewer.md", { name: "reviewer", description: "User reviewer" }, "User prompt.");
		writeAgent(agentsDir, "worker.md", { name: "worker", description: "Project worker" }, "Project prompt.");

		const result = discoverAgents(nestedCwd, "user");

		expect(result.projectAgentsDir).toBe(agentsDir);
		expect(result.agents.map((agent) => `${agent.name}:${agent.source}`)).toEqual(["reviewer:user"]);
	});

	it("lets project agents override user agents with the same name for both scope", () => {
		const { nestedCwd, agentsDir } = makeProjectAgentsDir();
		const userAgentsDir = path.join(mockedDirs.userAgentRoot, "agents");
		writeAgent(userAgentsDir, "shared.md", { name: "shared", description: "User version" }, "User prompt.");
		writeAgent(userAgentsDir, "user-only.md", { name: "user-only", description: "User only" }, "User-only prompt.");
		writeAgent(agentsDir, "shared.md", { name: "shared", description: "Project version" }, "Project prompt.");
		writeAgent(
			agentsDir,
			"project-only.md",
			{ name: "project-only", description: "Project only" },
			"Project-only prompt.",
		);

		const result = discoverAgents(nestedCwd, "both");

		expect(result.agents.map((agent) => `${agent.name}:${agent.source}:${agent.description}`)).toEqual([
			"shared:project:Project version",
			"user-only:user:User only",
			"project-only:project:Project only",
		]);
	});

	it("returns no project agents when no .pi/agents directory exists", () => {
		const cwd = path.join(tempDir, "standalone", "src");
		fs.mkdirSync(cwd, { recursive: true });

		const result = discoverAgents(cwd, "project");

		expect(result).toEqual({ agents: [], projectAgentsDir: null });
	});
});

describe("formatAgentList", () => {
	it("formats a bounded list and reports the remaining count", () => {
		const result = formatAgentList(
			[
				{
					name: "scout",
					description: "Finds files",
					source: "project",
					filePath: "/repo/.pi/agents/scout.md",
					systemPrompt: "Prompt",
				},
				{
					name: "worker",
					description: "Makes changes",
					source: "user",
					filePath: "/home/alice/.pi/agent/agents/worker.md",
					systemPrompt: "Prompt",
				},
			],
			1,
		);

		expect(result).toEqual({
			text: "scout (project): Finds files",
			remaining: 1,
		});
	});

	it("formats an empty list as none", () => {
		expect(formatAgentList([], 5)).toEqual({ text: "none", remaining: 0 });
	});
});
