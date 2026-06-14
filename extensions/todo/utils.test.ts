import { describe, expect, it } from "vitest";
import { applyTodoAction, createInitialTodoState, type TodoState } from "./utils.ts";

describe("todo actions", () => {
	it("lists an empty todo state", () => {
		const result = applyTodoAction(createInitialTodoState(), { action: "list" });

		expect(result.contentText).toBe("No todos");
		expect(result.details).toEqual({
			action: "list",
			todos: [],
			nextId: 1,
		});
		expect(result.state).toEqual({ todos: [], nextId: 1 });
	});

	it("adds todos with incrementing IDs", () => {
		const first = applyTodoAction(createInitialTodoState(), { action: "add", text: "Write tests" });
		const second = applyTodoAction(first.state, { action: "add", text: "Run checks" });

		expect(first.contentText).toBe("Added todo #1: Write tests");
		expect(second.contentText).toBe("Added todo #2: Run checks");
		expect(second.state).toEqual({
			todos: [
				{ id: 1, text: "Write tests", done: false },
				{ id: 2, text: "Run checks", done: false },
			],
			nextId: 3,
		});
		expect(second.details.todos).toEqual(second.state.todos);
	});

	it("formats non-empty lists with checked and unchecked items", () => {
		const state: TodoState = {
			todos: [
				{ id: 1, text: "Done item", done: true },
				{ id: 2, text: "Open item", done: false },
			],
			nextId: 3,
		};

		const result = applyTodoAction(state, { action: "list" });

		expect(result.contentText).toBe("[x] #1: Done item\n[ ] #2: Open item");
		expect(result.details).toEqual({
			action: "list",
			todos: state.todos,
			nextId: 3,
		});
	});

	it("toggles a todo back and forth", () => {
		const state: TodoState = {
			todos: [{ id: 7, text: "Ship it", done: false }],
			nextId: 8,
		};

		const completed = applyTodoAction(state, { action: "toggle", id: 7 });
		const reopened = applyTodoAction(completed.state, { action: "toggle", id: 7 });

		expect(completed.contentText).toBe("Todo #7 completed");
		expect(completed.state.todos[0]).toEqual({ id: 7, text: "Ship it", done: true });
		expect(reopened.contentText).toBe("Todo #7 uncompleted");
		expect(reopened.state.todos[0]).toEqual({ id: 7, text: "Ship it", done: false });
	});

	it("clears todos and resets the next ID", () => {
		const state: TodoState = {
			todos: [
				{ id: 1, text: "One", done: false },
				{ id: 2, text: "Two", done: true },
			],
			nextId: 3,
		};

		const result = applyTodoAction(state, { action: "clear" });

		expect(result.contentText).toBe("Cleared 2 todos");
		expect(result.details).toEqual({
			action: "clear",
			todos: [],
			nextId: 1,
		});
		expect(result.state).toEqual({ todos: [], nextId: 1 });
	});

	it("keeps state unchanged when required add text is missing", () => {
		const state: TodoState = {
			todos: [{ id: 1, text: "Existing", done: false }],
			nextId: 2,
		};

		const result = applyTodoAction(state, { action: "add" });

		expect(result.contentText).toBe("Error: text required for add");
		expect(result.details.error).toBe("text required");
		expect(result.state).toEqual(state);
	});

	it("keeps state unchanged when toggle has no matching todo", () => {
		const state: TodoState = {
			todos: [{ id: 1, text: "Existing", done: false }],
			nextId: 2,
		};

		const result = applyTodoAction(state, { action: "toggle", id: 9 });

		expect(result.contentText).toBe("Todo #9 not found");
		expect(result.details.error).toBe("#9 not found");
		expect(result.state).toEqual(state);
	});

	it("returns a list-shaped error for unknown actions", () => {
		const state: TodoState = {
			todos: [{ id: 1, text: "Existing", done: false }],
			nextId: 2,
		};

		const result = applyTodoAction(state, { action: "archive" });

		expect(result.contentText).toBe("Unknown action: archive");
		expect(result.details).toEqual({
			action: "list",
			todos: state.todos,
			nextId: 2,
			error: "unknown action: archive",
		});
		expect(result.state).toEqual(state);
	});

	it("returns snapshots that cannot be changed by later state mutations", () => {
		const state = createInitialTodoState();
		const added = applyTodoAction(state, { action: "add", text: "Stable details" });

		added.state.todos[0].text = "Mutated later";

		expect(added.details.todos[0]).toEqual({ id: 1, text: "Stable details", done: false });
	});
});
