import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { skillLoader } from "./runtime.js";

export const MODEL = process.env.MODEL_ID ?? process.env.ANTHROPIC_MODEL;
if (!MODEL) throw new Error("MODEL_ID (or ANTHROPIC_MODEL) is required");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

const baseURL = process.env.ANTHROPIC_BASE_URL;

export const client = new Anthropic({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});

export const SYSTEM = `You are a coding agent at ${process.cwd()}. Use tools to solve tasks. Act, don't explain.
When a task has multiple steps, use task_create + task_update to track progress.
Tasks persist as JSON files in .tasks/ — they survive context compression.
Use task_list to see current state, task_get for details.
Never skip pending -> in_progress -> completed transitions (task_update one step at a time).
Use blockedBy to express dependencies between tasks.
Use load_skill to access specialized knowledge before tackling unfamiliar topics.

Skills available:
${skillLoader.getDescriptions()}
Remember: act, don't explain. Track multi-step work via tasks.`;
