export interface Todo {
	id: number;
	text: string;
	done: boolean;
}

export interface TodoState {
	todos: Todo[];
	nextId: number;
}

export interface TodoDetails {
	action: "list" | "add" | "toggle" | "clear";
	todos: Todo[];
	nextId: number;
	error?: string;
}

export interface TodoActionParams {
	action: string;
	text?: string;
	id?: number;
}

export interface TodoActionResult {
	contentText: string;
	details: TodoDetails;
	state: TodoState;
}

export function createInitialTodoState(): TodoState {
	return { todos: [], nextId: 1 };
}

function snapshot(state: TodoState): TodoState {
	return {
		todos: state.todos.map((todo) => ({ ...todo })),
		nextId: state.nextId,
	};
}

function toDetails(action: TodoDetails["action"], state: TodoState, error?: string): TodoDetails {
	const current = snapshot(state);
	return {
		action,
		todos: current.todos,
		nextId: current.nextId,
		...(error ? { error } : {}),
	};
}

export function applyTodoAction(state: TodoState, params: TodoActionParams): TodoActionResult {
	const current = snapshot(state);

	switch (params.action) {
		case "list":
			return {
				contentText: current.todos.length
					? current.todos.map((todo) => `[${todo.done ? "x" : " "}] #${todo.id}: ${todo.text}`).join("\n")
					: "No todos",
				details: toDetails("list", current),
				state: current,
			};

		case "add": {
			if (!params.text) {
				return {
					contentText: "Error: text required for add",
					details: toDetails("add", current, "text required"),
					state: current,
				};
			}

			const newTodo: Todo = { id: current.nextId, text: params.text, done: false };
			const nextState = {
				todos: [...current.todos, newTodo],
				nextId: current.nextId + 1,
			};

			return {
				contentText: `Added todo #${newTodo.id}: ${newTodo.text}`,
				details: toDetails("add", nextState),
				state: nextState,
			};
		}

		case "toggle": {
			if (params.id === undefined) {
				return {
					contentText: "Error: id required for toggle",
					details: toDetails("toggle", current, "id required"),
					state: current,
				};
			}

			const todo = current.todos.find((item) => item.id === params.id);
			if (!todo) {
				return {
					contentText: `Todo #${params.id} not found`,
					details: toDetails("toggle", current, `#${params.id} not found`),
					state: current,
				};
			}

			const nextState = {
				todos: current.todos.map((item) => (item.id === params.id ? { ...item, done: !item.done } : item)),
				nextId: current.nextId,
			};
			const updated = nextState.todos.find((item) => item.id === params.id)!;

			return {
				contentText: `Todo #${updated.id} ${updated.done ? "completed" : "uncompleted"}`,
				details: toDetails("toggle", nextState),
				state: nextState,
			};
		}

		case "clear": {
			return {
				contentText: `Cleared ${current.todos.length} todos`,
				details: toDetails("clear", createInitialTodoState()),
				state: createInitialTodoState(),
			};
		}

		default:
			return {
				contentText: `Unknown action: ${params.action}`,
				details: toDetails("list", current, `unknown action: ${params.action}`),
				state: current,
			};
	}
}
