export function formatError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return `Error: ${message}`;
}
