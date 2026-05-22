export type HookEvent =
  | "LoopStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "ToolResultsReady"
  | "Stop";

export type HookCallback = (...args: unknown[]) => string | null;

const HOOKS: Record<HookEvent, HookCallback[]> = {
  LoopStart: [],
  UserPromptSubmit: [],
  PreToolUse: [],
  PostToolUse: [],
  ToolResultsReady: [],
  Stop: [],
};

export function registerHook(event: HookEvent, callback: HookCallback): void {
  HOOKS[event].push(callback);
}

export function triggerHooks(event: HookEvent, ...args: unknown[]): string | null {
  for (const cb of HOOKS[event]) {
    const result = cb(...args);
    if (result !== null) return result;
  }
  return null;
}
