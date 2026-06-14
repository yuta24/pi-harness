import { describe, expect, it } from "vitest";
import { extractDoneSteps, extractTodoItems, isSafeCommand, markCompletedSteps, type TodoItem } from "./utils.ts";

describe("isSafeCommand", () => {
	it.each([
		"ls -la",
		"pwd",
		"rg setActiveTools extensions",
		"sed -n '1,80p' package.json",
		"git status --short",
		"git diff -- extensions/plan-mode/utils.ts",
		"npm list --depth=0",
		"curl https://example.com",
	])("allows read-only command: %s", (command) => {
		expect(isSafeCommand(command)).toBe(true);
	});

	it.each([
		"rm -rf dist",
		"echo test > output.txt",
		"cat package.json >> output.txt",
		"git checkout main",
		"git commit -m test",
		"npm install",
		"pnpm add vitest",
		"sudo ls",
		"cat package.json | tee copy.json",
	])("blocks mutating command: %s", (command) => {
		expect(isSafeCommand(command)).toBe(false);
	});

	it("blocks commands that are not explicitly allowlisted", () => {
		expect(isSafeCommand("node script.js")).toBe(false);
		expect(isSafeCommand("python script.py")).toBe(false);
	});
});

describe("extractTodoItems", () => {
	it("extracts numbered items from a Plan section", () => {
		const items = extractTodoItems(`
Intro text.

Plan:
1. Update the \`package.json\` scripts
2. **Run tests**
3) Verify the README
`);

		expect(items).toEqual([
			{ step: 1, text: "Package.json scripts", completed: false },
			{ step: 2, text: "Tests", completed: false },
			{ step: 3, text: "README", completed: false },
		]);
	});

	it("supports bold Plan headers and ignores non-plan messages", () => {
		expect(extractTodoItems("**Plan:**\n1. Check the config")).toEqual([
			{ step: 1, text: "Config", completed: false },
		]);
		expect(extractTodoItems("1. This is just a list")).toEqual([]);
	});

	it("skips command-like and too-short plan items", () => {
		const items = extractTodoItems(`
Plan:
1. /plan
2. ok
3. Read the source files
`);

		expect(items).toEqual([{ step: 1, text: "Source files", completed: false }]);
	});

	it("truncates long plan item labels for widget display", () => {
		const [item] = extractTodoItems(`
Plan:
1. Check the extremely long and detailed implementation note that should not overflow compact widgets
`);

		expect(item.text).toBe("Extremely long and detailed implementation note...");
		expect(item.text.length).toBeLessThanOrEqual(50);
	});
});

describe("DONE markers", () => {
	it("extracts done markers case-insensitively", () => {
		expect(extractDoneSteps("Finished [DONE:1], then [done:3].")).toEqual([1, 3]);
	});

	it("marks matching todo items as completed", () => {
		const items: TodoItem[] = [
			{ step: 1, text: "First", completed: false },
			{ step: 2, text: "Second", completed: false },
		];

		expect(markCompletedSteps("Completed [DONE:2]", items)).toBe(1);
		expect(items).toEqual([
			{ step: 1, text: "First", completed: false },
			{ step: 2, text: "Second", completed: true },
		]);
	});
});
