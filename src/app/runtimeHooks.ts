import type Anthropic from "@anthropic-ai/sdk";
import type { AppContext } from "./context.js";
import { agentIdentity } from "../tools/toolRuntime.js";

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

  function taskState(): TaskLoopState {
    const name = agentName();
    let state = taskStates.get(name);
    if (!state) {
      state = newTaskLoopState();
      taskStates.set(name, state);
    }
    return state;
  }

  app.hooks.register("LoopStart", () => {
    taskStates.set(agentName(), newTaskLoopState());
    return null;
  });

  app.hooks.register("UserPromptSubmit", (rawMessages) => {
    const messages = rawMessages as Anthropic.Messages.MessageParam[];
    const state = taskState();

    if (state.showTaskStatus) {
      const taskSummary = app.toolRuntime.taskSummary();
      if (taskSummary) {
        messages.push({
          role: "user",
          content: `<task-status>\n${taskSummary}\n</task-status>`,
        });
      }
      state.showTaskStatus = false;
    }

    const bgNotif = app.toolRuntime.drainBackgroundNotifications();
    if (bgNotif) {
      messages.push({
        role: "user",
        content: `<background-results>\n${bgNotif}\n</background-results>`,
      });
    }

    const name = agentName();
    const inboxMessages = app.teammateManager.drainInbox(name);
    for (const msg of inboxMessages) {
      messages.push({
        role: "user",
        content: `<inbox>${JSON.stringify(msg)}</inbox>`,
      });
    }

    if (name === "lead") {
      const teammateNotif = app.teammateManager.drainNotifications();
      if (teammateNotif) {
        messages.push({
          role: "user",
          content: `<teammate-updates>\n${teammateNotif}\n</teammate-updates>`,
        });
      }
    }

    return null;
  });

  app.hooks.register("PostToolUse", (block, output) => {
    const b = block as { name: string; input: Record<string, unknown> };

    if (b.name === "task_create" || b.name === "task_update") {
      const state = taskState();
      state.sawTaskTool = true;
      state.sawTaskToolThisTurn = true;
      state.showTaskStatus = true;
    }

    return null;
  });

  app.hooks.register("ToolResultsReady", (rawResults) => {
    const state = taskState();
    if (!state.sawTaskTool) return null;

    if (state.sawTaskToolThisTurn) {
      state.roundsSinceTaskUpdate = 0;
      state.sawTaskToolThisTurn = false;
      return null;
    }

    state.roundsSinceTaskUpdate += 1;
    if (state.roundsSinceTaskUpdate < 3) return null;

    state.roundsSinceTaskUpdate = 0;
    if (!app.toolRuntime.hasActiveTasks()) {
      state.sawTaskTool = false;
      return null;
    }

    const results = rawResults as ToolResultBlock[];
    results.push({
      type: "text",
      text: "<reminder>Update your tasks with task_update or task_list.</reminder>",
    });
    return null;
  });
}
