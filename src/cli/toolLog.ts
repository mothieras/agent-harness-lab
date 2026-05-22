/**
 * Terminal presentation for tool results. The CLI registers this through
 * the hook bus; app and agent runtime layers should not depend on it.
 */

function tryParseJson(output: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(output);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "\x1b[32m✓\x1b[0m";
    case "in_progress":
      return "\x1b[33m…\x1b[0m";
    default:
      return "\x1b[2m○\x1b[0m";
  }
}

function compactTaskCreate(output: string): string | null {
  const t = tryParseJson(output);
  if (!t || typeof t.id !== "number") return null;
  const subject = String(t.subject ?? "").slice(0, 60);
  return `task: #${t.id} "${subject}" created`;
}

function compactTaskUpdate(output: string): string | null {
  const t = tryParseJson(output);
  if (!t || typeof t.id !== "number") return null;
  const subject = String(t.subject ?? "").slice(0, 50);
  const status = String(t.status ?? "");
  return `task: #${t.id} ${statusIcon(status)} ${status} — ${subject}`;
}

function compactTaskGet(output: string): string | null {
  const t = tryParseJson(output);
  if (!t || typeof t.id !== "number") return null;
  const subject = String(t.subject ?? "").slice(0, 60);
  const status = String(t.status ?? "");
  return `task: #${t.id} ${statusIcon(status)} ${status} — ${subject}`;
}

function compactTaskList(output: string): string | null {
  // Already text-based, just trim to first line + summary
  const lines = output.split("\n");
  if (lines.length <= 5) return output; // short enough, show as-is
  const summary = lines[lines.length - 1] ?? "";
  return `${lines.slice(0, 4).join("\n")}\n  ... ${summary}`;
}

export function logToolResult(
  name: string,
  input: Record<string, unknown>,
  output: string,
): void {
  if (name === "check_background") {
    const firstLine = output.split("\n")[0] ?? output;
    console.log(`\x1b[2mbg:\x1b[0m ${firstLine}`);
    return;
  }

  if (name === "read_file") {
    const path = String(input.path ?? "?");
    console.log(
      `\x1b[33mread:\x1b[0m ${path} \x1b[2m(${output.length}B)\x1b[0m`,
    );
    return;
  }

  if (name === "task_create") {
    const line = compactTaskCreate(output);
    if (line) {
      console.log(line);
      return;
    }
  }

  if (name === "task_update") {
    const line = compactTaskUpdate(output);
    if (line) {
      console.log(line);
      return;
    }
  }

  if (name === "task_get") {
    const line = compactTaskGet(output);
    if (line) {
      console.log(line);
      return;
    }
  }

  if (name === "task_list") {
    const line = compactTaskList(output);
    if (line) {
      console.log(line);
      return;
    }
  }

  console.log(`\x1b[33mtool: ${name}\x1b[0m`);
  console.log(output.slice(0, 200));
}
