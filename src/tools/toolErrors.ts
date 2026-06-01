import type { ProviderDiagnostic } from "./toolTypes.js";

export function formatUnsupportedTool(name: string): string {
  return `Error: Unsupported tool '${name}'.`;
}

export function formatUnavailableTool(
  name: string,
  diagnostic: ProviderDiagnostic,
): string {
  return `Error: Tool '${name}' is unavailable from provider '${diagnostic.providerName}': ${diagnostic.reason}.`;
}

export function formatToolExecutionError(error: unknown): string {
  if (error instanceof Error) return `Error: ${error.message}`;
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: unknown; message?: unknown };
    const code = typeof e.code === "string" ? `${e.code}: ` : "";
    const message =
      typeof e.message === "string" ? e.message : JSON.stringify(error);
    return `Error: ${code}${message}`;
  }
  return `Error: ${String(error)}`;
}
