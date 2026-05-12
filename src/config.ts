import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

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
When a task has multiple steps, use the todo tool to track progress incrementally.
Do not complete multiple todo items in a single todo update.
Do not skip pending -> in_progress -> completed transitions.`;
