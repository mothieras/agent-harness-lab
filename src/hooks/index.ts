export type HookEvent =
  | "LoopStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "ToolResultsReady"
  | "Stop";

export type HookCallback = (...args: unknown[]) => string | null;

function emptyHooks(): Record<HookEvent, HookCallback[]> {
  return {
    LoopStart: [],
    UserPromptSubmit: [],
    PreToolUse: [],
    PostToolUse: [],
    ToolResultsReady: [],
    Stop: [],
  };
}

export class HookBus {
  private readonly hooks = emptyHooks();

  register(event: HookEvent, callback: HookCallback): void {
    this.hooks[event].push(callback);
  }

  trigger(event: HookEvent, ...args: unknown[]): string | null {
    for (const cb of this.hooks[event]) {
      const result = cb(...args);
      if (result !== null) return result;
    }
    return null;
  }
}
