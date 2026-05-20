import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import type { SkillLoader } from "./skills/skillLoader.js";

export const MODEL = process.env.MODEL_ID ?? process.env.ANTHROPIC_MODEL;
if (!MODEL) throw new Error("MODEL_ID (or ANTHROPIC_MODEL) is required");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

const baseURL = process.env.ANTHROPIC_BASE_URL;

export const client = new Anthropic({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});

export function buildSystem(skillLoader: SkillLoader): string {
  return `You are a coding agent at ${process.cwd()}. Use tools to solve tasks. Act, don't explain.
When a task has multiple steps, use task_create + task_update to track progress.
Your current task list is injected as <task-status> messages when you enter a conversation or after changes — use it instead of calling task_list. Only call task_list if you need a forced refresh.
Tasks persist as JSON files in .tasks/ — they survive context compression.
Never skip pending -> in_progress -> completed transitions (task_update one step at a time).
Use blockedBy to express dependencies between tasks.
Use load_skill to access specialized knowledge before tackling unfamiliar topics.
For long-running commands (builds, tests, installs), use background_run instead of bash.
Do NOT poll background tasks with check_background — results arrive automatically as <background-results> messages and the agent loop will resume on its own. Only use check_background if the user explicitly asks for task status.

You have a team of persistent named agents (teammates). Use spawn_teammate to create them — they run their own agent loops in the background.
Each teammate has a role, an inbox, and can communicate via send_message / read_inbox.
When a teammate finishes, you'll see <teammate-updates> messages.
Use list_teammates to view the team roster. Use broadcast to send a message to everyone at once.
Teammates are persistent — they go idle after finishing and can be re-activated with new tasks.

Skills available:
${skillLoader.getDescriptions()}
Remember: act, don't explain. Track multi-step work via tasks.`;
}
