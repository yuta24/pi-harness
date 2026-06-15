import type { Message } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
	formatTokens,
	formatToolCall,
	formatUsageStats,
	getDisplayItems,
	getFinalOutput,
	getResultOutput,
	isFailedResult,
	mapWithConcurrencyLimit,
	PER_TASK_OUTPUT_CAP,
	truncateParallelOutput,
	type SingleResult,
} from "./utils.ts";

function assistantMessage(content: Message["content"], overrides: Partial<Message> = {}): Message {
	return {
		role: "assistant",
		content,
		...overrides,
	} as unknown as Message;
}

function baseResult(overrides: Partial<SingleResult> = {}): SingleResult {
	return {
		agent: "scout",
		agentSource: "project",
		task: "Find files",
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		...overrides,
	};
}

describe("formatting helpers", () => {
	it("formats token counts with compact units", () => {
		expect(formatTokens(999)).toBe("999");
		expect(formatTokens(1200)).toBe("1.2k");
		expect(formatTokens(12000)).toBe("12k");
		expect(formatTokens(1_250_000)).toBe("1.3M");
	});

	it("formats usage stats in display order", () => {
		expect(
			formatUsageStats(
				{
					turns: 2,
					input: 1200,
					output: 345,
					cacheRead: 5600,
					cacheWrite: 0,
					cost: 0.01234,
					contextTokens: 9876,
				},
				"claude-sonnet-4-5",
			),
		).toBe("2 turns ↑1.2k ↓345 R5.6k $0.0123 ctx:9.9k claude-sonnet-4-5");
	});

	it("formats common tool calls", () => {
		const fg = (_color: string, text: string) => text;

		expect(formatToolCall("bash", { command: "git status --short" }, fg)).toBe("$ git status --short");
		expect(formatToolCall("read", { path: "/tmp/example.ts", offset: 3, limit: 4 }, fg)).toBe(
			"read /tmp/example.ts:3-6",
		);
		expect(formatToolCall("grep", { pattern: "TODO", path: "src" }, fg)).toBe("grep /TODO/ in src");
	});
});

describe("subagent result helpers", () => {
	it("returns the latest assistant text output", () => {
		const messages = [
			assistantMessage([{ type: "text", text: "first" }]),
			assistantMessage([{ type: "toolCall", id: "tool_1", name: "read", arguments: { path: "a.ts" } }]),
			assistantMessage([{ type: "text", text: "final" }]),
		];

		expect(getFinalOutput(messages)).toBe("final");
	});

	it("detects failed, errored, and aborted results", () => {
		expect(isFailedResult(baseResult())).toBe(false);
		expect(isFailedResult(baseResult({ exitCode: 1 }))).toBe(true);
		expect(isFailedResult(baseResult({ stopReason: "error" }))).toBe(true);
		expect(isFailedResult(baseResult({ stopReason: "aborted" }))).toBe(true);
	});

	it("uses failure output precedence before falling back to assistant output", () => {
		const messages = [assistantMessage([{ type: "text", text: "assistant fallback" }])];

		expect(getResultOutput(baseResult({ exitCode: 1, errorMessage: "model error", stderr: "stderr", messages }))).toBe(
			"model error",
		);
		expect(getResultOutput(baseResult({ exitCode: 1, stderr: "stderr", messages }))).toBe("stderr");
		expect(getResultOutput(baseResult({ exitCode: 1, messages }))).toBe("assistant fallback");
		expect(getResultOutput(baseResult({ exitCode: 1 }))).toBe("(no output)");
	});

	it("returns assistant output for successful results", () => {
		expect(getResultOutput(baseResult({ messages: [assistantMessage([{ type: "text", text: "done" }])] }))).toBe(
			"done",
		);
		expect(getResultOutput(baseResult())).toBe("(no output)");
	});

	it("extracts display text and tool calls from assistant messages only", () => {
		const messages = [
			{ role: "user", content: [{ type: "text", text: "ignored" }] },
			assistantMessage([
				{ type: "text", text: "visible" },
				{ type: "toolCall", id: "tool_1", name: "grep", arguments: { pattern: "TODO" } },
			]),
		] as Message[];

		expect(getDisplayItems(messages)).toEqual([
			{ type: "text", text: "visible" },
			{ type: "toolCall", name: "grep", args: { pattern: "TODO" } },
		]);
	});

	it("truncates parallel output to a UTF-8 byte cap and reports omitted bytes", () => {
		const output = "あ".repeat(PER_TASK_OUTPUT_CAP);
		const result = truncateParallelOutput(output);
		const [truncated, marker] = result.split("\n\n");

		expect(Buffer.byteLength(truncated, "utf8")).toBeLessThanOrEqual(PER_TASK_OUTPUT_CAP);
		expect(marker).toContain("Output truncated:");
		expect(marker).toContain("Full output preserved in tool details.");
	});
});

describe("mapWithConcurrencyLimit", () => {
	it("preserves result order while limiting concurrency", async () => {
		let running = 0;
		let maxRunning = 0;

		const results = await mapWithConcurrencyLimit([30, 10, 20, 5], 2, async (delayMs, index) => {
			running++;
			maxRunning = Math.max(maxRunning, running);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			running--;
			return `item-${index}`;
		});

		expect(results).toEqual(["item-0", "item-1", "item-2", "item-3"]);
		expect(maxRunning).toBeLessThanOrEqual(2);
	});

	it("handles empty input without invoking the mapper", async () => {
		const results = await mapWithConcurrencyLimit([], 2, async () => "unused");

		expect(results).toEqual([]);
	});
});
