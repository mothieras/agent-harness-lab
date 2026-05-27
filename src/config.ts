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

export function getFallbackModel(): string | undefined {
  const fallback = process.env.FALLBACK_MODEL_ID?.trim();
  return fallback ? fallback : undefined;
}
