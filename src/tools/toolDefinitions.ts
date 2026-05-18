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
    name: "task",
    description:
      "Run a subtask in a clean subagent context and return a concise summary. Defaults to 90 turns and 30 minutes.",
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
];
