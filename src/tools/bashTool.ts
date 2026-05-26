import { exec } from "node:child_process";

type ExecErrorWithOutput = Error & {
  code?: number | string;
  stdout?: string;
  stderr?: string;
};

function execAsync(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as unknown as ExecErrorWithOutput;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

const DANGEROUS = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"];

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS.some((pattern) => command.includes(pattern));
}

export async function runBash(
  command: string,
  workspaceRoot: string,
): Promise<string> {
  if (isDangerousCommand(command)) {
    return "Error: Dangerous command blocked";
  }

  try {
    const r = await execAsync(command, workspaceRoot, 120_000);
    const out = (r.stdout + r.stderr).trim();
    return out ? out.slice(-50000) : "(no output)";
  } catch (e) {
    const err = e as ExecErrorWithOutput;
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    if (out) return out.slice(-50000);
    if (err.code === "ETIMEDOUT") return "Error: Timeout (120s)";
    return `Error: ${err.message}`;
  }
}
