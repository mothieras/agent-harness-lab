import type Anthropic from "@anthropic-ai/sdk";
import type { AppContext } from "./context.js";
import { pushTaggedUserMessage } from "./messageInjection.js";
import { agentIdentity } from "../tools/agentIdentity.js";

type ToolResultBlock =
  | { type: "tool_result"; tool_use_id: string; content: string }
  | { type: "text"; text: string };

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
		return null;
	});

	app.hooks.register("UserPromptSubmit", (rawMessages) => {
		const messages = rawMessages as Anthropic.Messages.MessageParam[];
		injectTaskStatus(app, taskState(), messages);
		injectBackgroundResults(app, messages);
		injectInboxMessages(app, messages);
		injectLeadTeammateUpdates(app, messages);
		return null;
	});

	app.hooks.register("PostToolUse", (block) => {
		markTaskToolUse(taskState(), block);
		return null;
	});

	app.hooks.register("ToolResultsReady", (rawResults) => {
		appendTaskReminder(app, taskState(), rawResults as ToolResultBlock[]);
		return null;
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
	const backgroundResults = app.toolRuntime.drainBackgroundNotifications();
	if (!backgroundResults) return;
	pushTaggedUserMessage(messages, "background-results", backgroundResults);
}

function injectInboxMessages(
	app: AppContext,
	messages: Anthropic.Messages.MessageParam[],
): void {
	for (const msg of app.teammateManager.drainInbox(agentName())) {
		pushTaggedUserMessage(messages, "inbox", JSON.stringify(msg), "inline");
	}
}

function injectLeadTeammateUpdates(
	app: AppContext,
	messages: Anthropic.Messages.MessageParam[],
): void {
	if (agentName() !== "lead") return;
	const teammateUpdates = app.teammateManager.drainNotifications();
	if (!teammateUpdates) return;
	pushTaggedUserMessage(messages, "teammate-updates", teammateUpdates);
}

function markTaskToolUse(state: TaskLoopState, block: unknown): void {
	const toolUse = block as { name: string };
	if (toolUse.name !== "task_create" && toolUse.name !== "task_update") return;
	state.sawTaskTool = true;
	state.sawTaskToolThisTurn = true;
	state.showTaskStatus = true;
}

function appendTaskReminder(
	app: AppContext,
	state: TaskLoopState,
	results: ToolResultBlock[],
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
