import type Anthropic from "@anthropic-ai/sdk";
import type { ToolHandler } from "./input.js";

export type ToolDefinition = Anthropic.Messages.Tool;

export type ToolSource =
  | { type: "builtin" }
  | { type: "mcp"; serverName: string; originalName: string };

export type RegisteredTool = {
  name: string;
  definition: ToolDefinition;
  handler: ToolHandler;
  source: ToolSource;
};

export type ProviderDiagnostic = {
  providerName: string;
  sourceType: "builtin" | "mcp";
  namespacePrefix?: string;
  status: "warning" | "unavailable";
  reason: string;
};

export type ToolProviderLoadResult = {
  tools: RegisteredTool[];
  diagnostics: ProviderDiagnostic[];
};

export function builtinTool(
  definition: ToolDefinition,
  handler: ToolHandler,
): RegisteredTool {
  return {
    name: definition.name,
    definition,
    handler,
    source: { type: "builtin" },
  };
}
