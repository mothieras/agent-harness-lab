import type {
  ProviderDiagnostic,
  RegisteredTool,
  ToolDefinition,
} from "./types.js";
import type { ToolHandler } from "./input.js";
import { selectAllowedToolDefinitions } from "./profiles.js";

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly diagnostics: ProviderDiagnostic[] = [];

  register(tool: RegisteredTool): void {
    if (tool.name !== tool.definition.name) {
      throw new Error(
        `RegisteredTool name '${tool.name}' must match definition name '${tool.definition.name}'.`,
      );
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: RegisteredTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  recordDiagnostic(diagnostic: ProviderDiagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  recordDiagnostics(diagnostics: ProviderDiagnostic[]): void {
    for (const diagnostic of diagnostics) {
      this.recordDiagnostic(diagnostic);
    }
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getDefinitions(allowedTools?: readonly string[]): ToolDefinition[] {
    const definitions = Array.from(this.tools.values(), (tool) => tool.definition);
    return selectAllowedToolDefinitions(definitions, allowedTools);
  }

  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  explainUnavailable(name: string): ProviderDiagnostic | undefined {
    return this.diagnostics.find(
      (diagnostic) =>
        diagnostic.status === "unavailable" &&
        diagnostic.namespacePrefix !== undefined &&
        name.startsWith(diagnostic.namespacePrefix),
    );
  }
}
