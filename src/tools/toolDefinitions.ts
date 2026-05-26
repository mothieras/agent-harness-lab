export const TOOLS = [
  {
    name: "bash",
    description: "Run a shell command.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read file contents.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace exact text in file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
  {
    name: "task_create",
    description: "Create a new persistent task. Tasks survive context compression as JSON files.",
    input_schema: {
      type: "object" as const,
      properties: {
        subject: { type: "string", description: "A brief, actionable title in imperative form." },
        description: { type: "string", description: "What needs to be done." },
      },
      required: ["subject"],
    },
  },
  {
    name: "task_get",
    description: "Get full details of a task by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "integer", description: "The ID of the task to retrieve." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "task_update",
    description: "Update a task's status or dependencies. Completing a task auto-removes it from others' blockedBy.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "integer", description: "The ID of the task to update." },
        status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        addBlockedBy: {
          type: "array",
          items: { type: "integer" },
          description: "Task IDs that this task depends on.",
        },
        removeBlockedBy: {
          type: "array",
          items: { type: "integer" },
          description: "Dependency IDs to remove.",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "task_list",
    description: "List all tasks with status summary and dependency info.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "load_skill",
    description:
      "Load specialized knowledge by name. Call before tackling unfamiliar topics listed under 'Skills available' in the system prompt.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Skill name to load (must match one listed in the system prompt).",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "background_run",
    description:
      "Run a shell command in the background. Returns task_id immediately — use check_background to poll for results.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "The shell command to run." },
      },
      required: ["command"],
    },
  },
  {
    name: "check_background",
    description:
      "Check background task status. Omit task_id to list all active tasks.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Optional task ID to check." },
      },
    },
  },
  {
    name: "subagent",
    description:
      "Run a task in an isolated subagent context and return a concise summary. Defaults to 90 turns and 30 minutes.",

    input_schema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "The task for the subagent to complete.",
        },
        max_turns: {
          type: "integer",
          minimum: 1,
          description:
            "Optional maximum number of agent-loop turns for this subagent. Defaults to 90.",
        },
        timeout_ms: {
          type: "integer",
          minimum: 1,
          description:
            "Optional maximum runtime for this subagent in milliseconds. Defaults to 1800000.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "teammate",
    description:
      "Create a persistent teammate with its own agent loop, inbox, and async communication.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Unique name for the teammate." },
        role: { type: "string", description: "Role description (e.g. coder, tester)." },
        prompt: { type: "string", description: "Initial task prompt for the teammate." },
      },
      required: ["name", "role", "prompt"],
    },
  },
  {
    name: "list_teammates",
    description: "List all teammates with their name, role, and status.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "send_message",
    description:
      "Send a message to a teammate's inbox. They will see it on their next turn.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient teammate name (or 'lead')." },
        content: { type: "string", description: "Message content." },
        msg_type: {
          type: "string",
          enum: ["message", "broadcast", "shutdown_request", "shutdown_response", "plan_approval_response"],
          description: "Message type. Defaults to 'message'.",
        },
      },
      required: ["to", "content"],
    },
  },
  {
    name: "read_inbox",
    description: "Read and drain your inbox. Returns messages sent to you since last read.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "broadcast",
    description: "Send a message to all teammates at once.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "Message to broadcast." },
      },
      required: ["content"],
    },
  },
  {
    name: "update_memory",
    description:
      "Create or update a memory in persistent storage. Memories survive context compaction and session restarts. Use when the user expresses a preference, gives feedback, shares project context, or mentions a useful reference.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Short kebab-case identifier (e.g. 'user-preference-tabs')." },
        type: { type: "string", enum: ["user", "feedback", "project", "reference"], description: "Memory type: user (user preference), feedback (guidance), project (project fact), reference (external pointer)." },
        description: { type: "string", description: "One-line summary for index lookup." },
        body: { type: "string", description: "Full detail in markdown. Include Why and How to apply sections." },
      },
      required: ["name", "type", "description", "body"],
    },
  },
];
