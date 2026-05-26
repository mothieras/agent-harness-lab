import type { MemoryManager } from "../memory/memoryManager.js";
import type { MemoryType } from "../memory/types.js";
import type { SkillLoader } from "../skills/skillLoader.js";
import type { TeammateManager } from "../team/teammateManager.js";
import { agentIdentity } from "./agentIdentity.js";
import type { BackgroundManager } from "./backgroundManager.js";
import { runBash } from "./bashTool.js";
import { runEditFile } from "./editFileTool.js";
import { formatError } from "./formatError.js";
import {
	optionalArrayOfIntegers,
	optionalInteger,
	requireInteger,
	requireNonEmptyString,
	requireString,
	type ToolHandler,
	type ToolInput,
} from "./input.js";
import { runReadFile } from "./readFileTool.js";
import type { TaskManager } from "./taskManager.js";
import { runWriteFile } from "./writeFileTool.js";

type HandlerDeps = {
	workspaceRoot: string;
	skillLoader: SkillLoader;
	memoryManager: MemoryManager;
	taskManager: TaskManager;
	backgroundManager: BackgroundManager;
	getTeammateManager: () => TeammateManager | null;
};

export function createBuiltinToolHandlers(deps: HandlerDeps): Record<string, ToolHandler> {
	return {
		...fileHandlers(deps),
		...skillHandlers(deps),
		...taskHandlers(deps),
		...backgroundHandlers(deps),
		...teamHandlers(deps),
		...memoryHandlers(deps),
	};
}

function fileHandlers(deps: HandlerDeps): Record<string, ToolHandler> {
	return {
		bash: (input) => {
			const command = requireNonEmptyString(input, "command", "bash tool");
			if ("error" in command) return command.error;
			return runBash(command.value, deps.workspaceRoot);
		},
		read_file: (input) => {
			const filepath = requireString(input, "path");
			if (filepath === null) return "Error: Missing required 'path' for read_file tool.";
			return runReadFile(filepath, deps.workspaceRoot, optionalInteger(input, "limit"));
		},
		write_file: (input) => {
			const filepath = requireString(input, "path");
			if (filepath === null) return "Error: Missing required 'path' for write_file tool.";
			const content = requireString(input, "content");
			if (content === null) return "Error: Missing required 'content' for write_file tool.";
			return runWriteFile(filepath, content, deps.workspaceRoot);
		},
		edit_file: (input) => {
			const filepath = requireString(input, "path");
			if (filepath === null) return "Error: Missing required 'path' for edit_file tool.";
			const oldText = requireString(input, "old_text");
			if (oldText === null) return "Error: Missing required 'old_text' for edit_file tool.";
			const newText = requireString(input, "new_text");
			if (newText === null) return "Error: Missing required 'new_text' for edit_file tool.";
			return runEditFile(filepath, oldText, newText, deps.workspaceRoot);
		},
	};
}

function skillHandlers(deps: HandlerDeps): Record<string, ToolHandler> {
	return {
		load_skill: (input) => {
			const name = requireNonEmptyString(input, "name", "load_skill tool");
			if ("error" in name) return name.error;
			return `<skill name="${name.value}">\n${deps.skillLoader.getContent(name.value)}\n</skill>`;
		},
	};
}

function taskHandlers(deps: HandlerDeps): Record<string, ToolHandler> {
	return {
		task_create: (input) => runTaskCreate(input, deps.taskManager),
		task_get: (input) => runTaskGet(input, deps.taskManager),
		task_update: (input) => runTaskUpdate(input, deps.taskManager),
		task_list: () => deps.taskManager.listAll(),
	};
}

function runTaskCreate(input: ToolInput, taskManager: TaskManager): string {
	const subject = requireNonEmptyString(input, "subject", "task_create");
	if ("error" in subject) return subject.error;
	try {
		return taskManager.create(subject.value, requireString(input, "description") ?? "");
	} catch (error) {
		return formatError(error);
	}
}

function runTaskGet(input: ToolInput, taskManager: TaskManager): string {
	const taskId = requireInteger(input, "task_id");
	if (taskId === null) return "Error: Missing required 'task_id' for task_get.";
	try {
		return taskManager.get(taskId);
	} catch (error) {
		return formatError(error);
	}
}

function runTaskUpdate(input: ToolInput, taskManager: TaskManager): string {
	const taskId = requireInteger(input, "task_id");
	if (taskId === null) return "Error: Missing required 'task_id' for task_update.";
	try {
		return taskManager.update(
			taskId,
			requireString(input, "status") ?? undefined,
			optionalArrayOfIntegers(input, "addBlockedBy"),
			optionalArrayOfIntegers(input, "removeBlockedBy"),
		);
	} catch (error) {
		return formatError(error);
	}
}

function backgroundHandlers(deps: HandlerDeps): Record<string, ToolHandler> {
	return {
		background_run: (input) => {
			const command = requireNonEmptyString(input, "command", "background_run");
			if ("error" in command) return command.error;
			return deps.backgroundManager.run(command.value);
		},
		check_background: (input) => {
			return deps.backgroundManager.check(requireString(input, "task_id") ?? undefined);
		},
	};
}

function teamHandlers(deps: HandlerDeps): Record<string, ToolHandler> {
	return {
		list_teammates: () => withTeam(deps, (team) => team.listAll()),
		send_message: (input) => withTeam(deps, (team) => sendMessage(team, input)),
		read_inbox: () => withTeam(deps, (team) => readInbox(team)),
		broadcast: (input) => withTeam(deps, (team) => broadcast(team, input)),
	};
}

function withTeam(
	deps: HandlerDeps,
	callback: (team: TeammateManager) => string,
): string {
	const team = deps.getTeammateManager();
	if (!team) return "Error: Team not available.";
	return callback(team);
}

function sendMessage(team: TeammateManager, input: ToolInput): string {
	const to = requireNonEmptyString(input, "to", "send_message");
	if ("error" in to) return to.error;
	const content = requireString(input, "content");
	if (content === null) return "Error: Missing required 'content' for send_message.";
	const from = agentIdentity.getStore() ?? "lead";
	return team.send(from, to.value, content, requireString(input, "msg_type") ?? "message");
}

function readInbox(team: TeammateManager): string {
	const name = agentIdentity.getStore() ?? "lead";
	const messages = team.drainInbox(name);
	if (messages.length === 0) return "Inbox empty.";
	return JSON.stringify(messages, null, 2);
}

function broadcast(team: TeammateManager, input: ToolInput): string {
	const content = requireNonEmptyString(input, "content", "broadcast");
	if ("error" in content) return content.error;
	const from = agentIdentity.getStore() ?? "lead";
	return team.broadcast(from, content.value);
}

function memoryHandlers(deps: HandlerDeps): Record<string, ToolHandler> {
	return {
		update_memory: (input) => updateMemory(input, deps.memoryManager),
	};
}

function updateMemory(input: ToolInput, memoryManager: MemoryManager): string {
	const name = requireNonEmptyString(input, "name", "update_memory");
	if ("error" in name) return name.error;
	const type = requireString(input, "type") ?? "user";
	if (!["user", "feedback", "project", "reference"].includes(type)) {
		return `Error: Invalid type '${type}'. Must be user, feedback, project, or reference.`;
	}
	const description = requireNonEmptyString(input, "description", "update_memory");
	if ("error" in description) return description.error;
	const body = requireNonEmptyString(input, "body", "update_memory");
	if ("error" in body) return body.error;
	const filename = memoryManager.write(
		name.value,
		type as MemoryType,
		description.value,
		body.value,
	);
	return `Memory saved: ${filename}`;
}
