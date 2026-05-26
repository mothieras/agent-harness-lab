export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export type CheckPermissionFn = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<PermissionResult>;

export type AskUserFn = (
  toolName: string,
  input: Record<string, unknown>,
  reason: string,
) => Promise<boolean>;
