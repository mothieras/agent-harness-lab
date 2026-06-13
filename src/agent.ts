import { AsyncLocalStorage } from "node:async_hooks";
import type Anthropic from "@anthropic-ai/sdk";
import type { HookBus } from "./hooks/hookBus.js";
import { DEFAULT_MAIN_AGENT_MAX_TURNS } from "./loop/options.js";
import type { CheckPermissionFn } from "./permission/types.js";
import type { ToolRuntime } from "./tools/runtime.js";

export interface AgentConfig {
  /** Stable identity, used as the per-agent key for hook/reminder state. Omitted → treated as "lead". */
  id?: string | undefined;
  /** Display identity for the agent (optional). */
  name?: string | undefined;
  /** Role description injected into the system prompt (optional). */
  role?: string | undefined;
  /** Maximum turns for the agent loop. Defaults to 200. */
  maxTurns?: number | undefined;
  /** Maximum runtime in milliseconds (optional). */
  timeoutMs?: number | undefined;
  /** System prompt (optional — a bare default is used when omitted). */
  system?: string | undefined;
  /** Workspace root directory. Defaults to cwd. */
  workspaceRoot?: string | undefined;
  /** Tool allowlist. When omitted all registered tools are available. */
  allowedTools?: readonly string[] | undefined;
  /** The tool runtime this agent dispatches tool calls through. */
  toolRuntime: ToolRuntime;
  /** Hook bus for lifecycle hooks (optional). */
  hooks?: HookBus | undefined;
  /** Permission check function (optional). */
  checkPermission?: CheckPermissionFn | undefined;
  /** Initial conversation messages (optional — defaults to empty). */
  messages?: Anthropic.Messages.MessageParam[] | undefined;
}

/**
 * Overrides accepted by {@link Agent.fork}. Everything is optional except
 * `toolRuntime`, which is always shared with the parent and therefore omitted.
 */
export type AgentForkOptions = Omit<AgentConfig, "toolRuntime">;

/**
 * A stateful agent instance that bundles identity, config, services, and
 * conversation history into a single object.
 *
 * Usage:
 *   const agent = new Agent({ toolRuntime, system: "...", ... });
 *   const result = await agentLoop(agent);
 *
 * Sub-agents are derived via `parent.fork({ ... })` — same class, child-specific config.
 */
export class Agent {
  /** Stable identity, used as the per-agent key for hook/reminder state. */
  readonly id?: string | undefined;
  /** Display identity (optional). */
  readonly name?: string | undefined;
  /** Role description (optional). */
  readonly role?: string | undefined;
  /** Maximum turns for the agent loop. */
  readonly maxTurns: number = DEFAULT_MAIN_AGENT_MAX_TURNS;
  /** Maximum runtime in milliseconds (optional). */
  readonly timeoutMs?: number | undefined;
  /** System prompt. */
  readonly system: string;
  /** Workspace root directory. */
  readonly workspaceRoot: string;
  /** Tool allowlist. When undefined all registered tools are available. */
  readonly allowedTools?: readonly string[] | undefined;
  /** The tool runtime this agent dispatches tool calls through. */
  readonly toolRuntime: ToolRuntime;
  /** Hook bus for lifecycle hooks (optional). */
  readonly hooks?: HookBus | undefined;
  /** Permission check function (optional). */
  readonly checkPermission?: CheckPermissionFn | undefined;

  /** Conversation history (mutated by the loop). */
  readonly messages: Anthropic.Messages.MessageParam[];

  constructor(opts: AgentConfig) {
    this.id = opts.id;
    this.name = opts.name;
    this.role = opts.role;
    if (opts.maxTurns !== undefined) this.maxTurns = opts.maxTurns;
    this.timeoutMs = opts.timeoutMs;
    this.system =
      opts.system ??
      `You are a coding agent at ${
        opts.workspaceRoot ?? process.cwd()
      }. Use tools to solve tasks.`;
    this.workspaceRoot = opts.workspaceRoot ?? process.cwd();
    this.allowedTools = opts.allowedTools;
    this.toolRuntime = opts.toolRuntime;
    this.hooks = opts.hooks;
    this.checkPermission = opts.checkPermission;
    this.messages = opts.messages ?? [];
  }

  /** Resolve tool definitions for this agent, optionally filtered by allowedTools. */
  getToolDefinitions(): Anthropic.Messages.Tool[] {
    return this.toolRuntime.getToolDefinitions(this.allowedTools);
  }

  /**
   * Derive a child agent from this one. The split is explicit:
   *  - shared (same reference): `toolRuntime`
   *  - inherited from the parent unless overridden: `workspaceRoot`, `checkPermission`
   *  - isolated (taken only from `overrides`, never copied from the parent):
   *    `id`, `name`, `role`, `system`, `maxTurns`, `timeoutMs`, `allowedTools`, `messages`, `hooks`
   *    — a child starts a fresh, silent conversation (no `hooks` unless one is
   *      explicitly passed) with its own budget and tool scope. The HookBus is a
   *      host-interaction device that belongs to the lead agent, not a sub-agent.
   */
  fork(overrides: AgentForkOptions = {}): Agent {
    return new Agent({
      toolRuntime: this.toolRuntime,
      workspaceRoot: overrides.workspaceRoot ?? this.workspaceRoot,
      hooks: overrides.hooks,
      checkPermission: overrides.checkPermission ?? this.checkPermission,
      id: overrides.id,
      name: overrides.name,
      role: overrides.role,
      system: overrides.system,
      maxTurns: overrides.maxTurns,
      timeoutMs: overrides.timeoutMs,
      allowedTools: overrides.allowedTools,
      messages: overrides.messages,
    });
  }
}

/**
 * The agent currently executing in the active async context. `agentLoop()`
 * binds it for the duration of a run, so tools (e.g. `subagent`) can fork the
 * agent that invoked them without threading a parent reference, and per-agent
 * hook/reminder state keys off `agent.id`. Reads outside any agent loop see
 * `undefined` (callers fall back to "lead").
 */
export const currentAgent = new AsyncLocalStorage<Agent>();
