export type TeamMemberStatus = "working" | "idle" | "failed" | "shutdown";

export interface TeamMember {
  name: string;
  role: string;
  status: TeamMemberStatus;
  lastError?: string;
}

export const VALID_MSG_TYPES = [
  "message",
  "broadcast",
  "shutdown_request",
  "shutdown_response",
  "plan_approval_response",
] as const;

export type TeamMessageType = (typeof VALID_MSG_TYPES)[number];

export interface TeamMessage {
  type: TeamMessageType;
  from: string;
  content: string;
  timestamp: number;
}
