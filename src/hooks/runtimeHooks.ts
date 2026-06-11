import type Anthropic from "@anthropic-ai/sdk";
import type { AppContext } from "../app/context.js";
import { pushTaggedUserMessage } from "./messageInjection.js";
import { agentIdentity } from "../tools/identity.js";
import type { ToolResultReadyBlock } from "./hookBus.js";

type TaskLoopState = {
	roundsSinceTaskUpdate: number;
	sawTaskTool: boolean;
	sawTaskToolThisTurn: boolean;
	showTaskStatus: boolean;
};

function newTaskLoopState(): TaskLoopState {
	return {
		roundsSinceTaskUpdate: 0,
		sawTaskTool: false,
		sawTaskToolThisTurn: false,
		showTaskStatus: true,
	};
}

function agentName(): string {
	return agentIdentity.getStore() ?? "lead";
}

export function registerRuntimeHooks(app: AppContext): void {
	const taskStates = new Map<string, TaskLoopState>();
	const taskState = () => getTaskState(taskStates, agentName());

	app.hooks.register("LoopStart", () => {
		taskStates.set(agentName(), newTaskLoopState());
	});

	app.hooks.register("PreLLMCall", (messages) => {
		injectTaskStatus(app, taskState(), messages);
		injectBackgroundResults(app, messages);
		injectSubagentResults(app, messages);
	});

	app.hooks.register("PostToolUse", (block) => {
		markTaskToolUse(taskState(), block);
	});

	app.hooks.register("ToolResultsReady", (results) => {
		appendTaskReminder(app, taskState(), results);
	});
}

function getTaskState(
	states: Map<string, TaskLoopState>,
	name: string,
): TaskLoopState {
	let state = states.get(name);
	if (!state) {
		state = newTaskLoopState();
		states.set(name, state);
	}
	return state;
}

function injectTaskStatus(
	app: AppContext,
	state: TaskLoopState,
	messages: Anthropic.Messages.MessageParam[],
): void {
	if (!state.showTaskStatus) return;
	const taskSummary = app.toolRuntime.taskSummary();
	if (taskSummary) {
		pushTaggedUserMessage(messages, "task-status", taskSummary);
	}
	state.showTaskStatus = false;
}

function injectBackgroundResults(
	app: AppContext,
	messages: Anthropic.Messages.MessageParam[],
): void {
	if (agentName() !== "lead") return;
	const backgroundResults = app.toolRuntime.drainBackgroundNotifications();
	if (!backgroundResults) return;
	pushTaggedUserMessage(messages, "background-results", backgroundResults);
}

function injectSubagentResults(
	app: AppContext,
	messages: Anthropic.Messages.MessageParam[],
): void {
	if (agentName() !== "lead") return;
	const notifs = app.subAgentRunner.drainNotifications();
	if (notifs.length === 0) return;
	const text = notifs
		.map((n) => {
			const task = n.taskId ? ` (task ${n.taskId})` : "";
			return `[sub:${n.subId}]${task} ${n.status}: ${n.result}`;
		})
		.join("\n\n");
	pushTaggedUserMessage(messages, "subagent-results", text);
}

function markTaskToolUse(
	state: TaskLoopState,
	block: Anthropic.Messages.ToolUseBlock,
): void {
	if (block.name !== "task_create" && block.name !== "task_update") return;
	state.sawTaskTool = true;
	state.sawTaskToolThisTurn = true;
	state.showTaskStatus = true;
}

function appendTaskReminder(
	app: AppContext,
	state: TaskLoopState,
	results: ToolResultReadyBlock[],
): void {
	if (!shouldRemindTaskUpdate(app, state)) return;
	results.push({
		type: "text",
		text: "<reminder>Update your tasks with task_update or task_list.</reminder>",
	});
}

function shouldRemindTaskUpdate(app: AppContext, state: TaskLoopState): boolean {
	if (!state.sawTaskTool) return false;
	if (state.sawTaskToolThisTurn) {
		state.roundsSinceTaskUpdate = 0;
		state.sawTaskToolThisTurn = false;
		return false;
	}

	state.roundsSinceTaskUpdate += 1;
	if (state.roundsSinceTaskUpdate < 3) return false;
	state.roundsSinceTaskUpdate = 0;
	state.sawTaskTool = app.toolRuntime.hasActiveTasks();
	return state.sawTaskTool;
}
