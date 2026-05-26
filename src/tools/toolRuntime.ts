import path from "node:path";
import type { MemoryManager } from "../memory/memoryManager.js";
import type { SkillLoader } from "../skills/skillLoader.js";
import type { TeammateManager } from "../team/teammateManager.js";
import { BackgroundManager } from "./backgroundManager.js";
import { TaskManager } from "./taskManager.js";
import { createBuiltinToolHandlers } from "./toolHandlers.js";
import type { ToolHandler, ToolInput } from "./input.js";

export { agentIdentity } from "./agentIdentity.js";
export type { ToolHandler, ToolInput } from "./input.js";

export class ToolRuntime {
  private readonly taskManager: TaskManager;
  private readonly bg: BackgroundManager;
  private readonly handlers: Record<string, ToolHandler>;
  private teammateManager: TeammateManager | null = null;

  constructor(
    skillLoader: SkillLoader,
    memoryManager: MemoryManager,
    workspaceRoot: string,
  ) {
    this.taskManager = new TaskManager(path.join(workspaceRoot, ".tasks"));
    this.bg = new BackgroundManager(workspaceRoot);
    this.handlers = createBuiltinToolHandlers({
      workspaceRoot,
      skillLoader,
      memoryManager,
      taskManager: this.taskManager,
      backgroundManager: this.bg,
      getTeammateManager: () => this.teammateManager,
    });
  }

  setTeammateManager(tm: TeammateManager): void {
    this.teammateManager = tm;
  }

  registerTool(name: string, handler: ToolHandler): void {
    this.handlers[name] = handler;
  }

  clearTasksIfAllDone(): boolean {
    return this.taskManager.clearIfAllCompleted();
  }

  hasActiveTasks(): boolean {
    return this.taskManager.hasActive();
  }

  taskSummary(): string | null {
    // For LLM injection — includes descriptions and dependency info.
    // LLM can call task_get for full detail on a specific task.
    return this.taskManager.listAll();
  }

  taskStatusForUser(): string | null {
    // Compact list with [ ] markers for terminal display
    const list = this.taskManager.listAll();
    if (list === "No tasks.") return null;
    return list;
  }

  hasRunningBackgroundTasks(): boolean {
    return this.bg.hasRunning();
  }

  drainBackgroundNotifications(): string | null {
    const notifs = this.bg.drainNotifications();
    if (notifs.length === 0) return null;
    return notifs
      .map(
        (n) =>
          `[bg:${n.taskId}] ${n.status}: ${n.result}`,
      )
      .join("\n");
  }

  async invokeTool(name: string, input: unknown): Promise<string> {
    const handler = this.handlers[name];
    if (!handler) {
      return `Error: Unsupported tool '${name}'.`;
    }

    const normalizedInput =
      typeof input === "object" && input !== null ? (input as ToolInput) : {};

    return handler(normalizedInput);
  }
}
