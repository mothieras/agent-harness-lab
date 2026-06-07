> 本文档由 tool-system.md 翻译，英文版为准。

# 工具系统

工具系统围绕一个事实单元构建：

```ts
type RegisteredTool = {
  name: string;
  definition: ToolDefinition;
  handler: ToolHandler;
  source: ToolSource;
};
```

重要规则是：工具面向模型的定义和可执行处理器一起传递。

## 职责

### 工具工厂

工具工厂拥有一个工具的定义和处理器，并声明该工具所需的确切依赖。

内置工具位于 `src/tools/<group>/` 下，每个文件一个工具：

```text
src/tools/file/read.ts
src/tools/task/create.ts
src/tools/subagent/subagentTool.ts
```

每个文件导出一个 `createXTool(deps): RegisteredTool` 函数。`deps` 是一个小的内联对象，仅包含该工具使用的服务——没有共享的"依赖袋"。`src/tools/types.ts` 中的 `builtinTool(definition, handler)` 辅助函数会标记 `source: { type: "builtin" }` 元数据，因此工厂只需指定其定义和处理器。

### 分组索引

分组索引聚合相关工具：

```text
src/tools/file/index.ts
src/tools/task/index.ts
src/tools/subagent/index.ts
```

它们回答：该组中有哪些内置工具、按什么顺序、以及该组需要哪些服务。它们不包含工具业务逻辑。

### 内置组合

`src/tools/builtins.ts` 是内置工具的唯一组合根。`loadBuiltinTools(services)` 接受一个 `BuiltinServices` 对象（所有长生命周期服务），仅向每个组传递其所需的服务，并返回 `ToolProviderLoadResult`：

```ts
type ToolProviderLoadResult = {
  tools: RegisteredTool[];
  diagnostics: ProviderDiagnostic[];
};
```

它使用静态导入，不扫描文件系统。工具顺序在此显式指定：**file → task → background → subagent → skill → memory**。（`builtins.ts` 替代了旧的 `builtin/index.ts` + `builtin/provider.ts` 双文件拆分。）

### 同目录状态

支持工具组的有状态服务位于该组旁边：

```text
src/tools/task/taskManager.ts
src/tools/background/backgroundManager.ts
```

### MCP 提供者

`src/tools/mcp/provider.ts` 实现了 MCP-0 提供者边界，无真实传输。

它依赖一个最小的 `McpClient` 接口：

```ts
interface McpClient {
  listTools(): Promise<McpToolSchema[]>;
  callTool(name: string, input: unknown): Promise<McpToolResult>;
}
```

提供者调用 `listTools()`，将每个 MCP schema 转换为带命名空间的 `RegisteredTool`，并在处理器中闭包捕获客户端。

如果 `listTools()` 失败，提供者不返回工具，并为服务器命名空间记录不可用诊断。

`MockMcpClient` 实现了相同的接口，用于测试和本地架构验证。实际的 stdio/http 传输应在后续实现 `McpClient`，而非更改注册表/运行时。

### 工具注册表

`ToolRegistry`（`src/tools/registry.ts`）存储成功注册的工具和提供者诊断。

其职责包括：

- 确保 `RegisteredTool.name === RegisteredTool.definition.name`。
- 拒绝重复的工具名称。
- 为模型调用返回工具定义。
- 为运行时调度返回处理器。
- 解释不可用的提供者命名空间。

它不负责发现提供者。

### 工具运行时

`ToolRuntime`（`src/tools/runtime.ts`）通过注册表调用工具：

```text
ToolRuntime.invokeTool(name, input)
-> ToolRegistry.getHandler(name)
-> handler(input)
```

如果不存在处理器，运行时在返回不支持的工具错误之前先检查诊断信息。

## 添加内置工具

1. 创建一个专注的工厂文件：

```text
src/tools/<group>/<name>.ts
```

2. 导出一个仅接收所需依赖的工厂：

```ts
export function createXTool(deps: { taskManager: TaskManager }): RegisteredTool {
  return builtinTool(definition, handler);
}
```

3. 将其添加到组 `index.ts`。

4. 如果工具需要尚未接入的服务，将其添加到 `BuiltinServices` 并从 `src/tools/builtins.ts` 中的 `loadBuiltinTools()` 传递。

5. 如果受限的 Agent 角色（`subagent` 配置文件）应看到它，更新 `src/tools/profiles.ts`。

Lead agent 的可见性通常来自所有已注册的工具，因此大多数新内置工具不需要配置文件更改。

## MCP-0 边界

模拟 MCP 工具遵循相同的最终形态：

```ts
{
  name: "mcp__github__search_issues",
  definition: convertedSchema,
  source: {
    type: "mcp",
    serverName: "github",
    originalName: "search_issues",
  },
  handler: createMcpHandler(client, source),
}
```

提供者来源不同，但注册表和运行时路径保持不变。

当前实现不是真正的 MCP 传输。它有意止步于：

- 通过 `McpClient.listTools()` 进行 MCP 风格的 schema 发现。
- `mcp__server__tool` 全局命名。
- 包含服务器和原始工具名称的 `source` 元数据。
- 通过 `McpClient.callTool(originalName, input)` 调用处理器。
- 文本/json/资源/图片结果标准化为字符串。
- 列表失败的提供者诊断。

真正的 MCP 传输应在 `McpClient` 之后接入。

## 不变量

- 不要重新创建全局 `toolDefinitions.ts` 列表。
- 不要重新创建中央 `toolHandlers.ts` 文件。
- 不要让 `ToolRuntime` 保留自己的处理器映射。
- 不要重新引入共享依赖袋；每个工具只声明其使用的依赖。
- 不要将密钥放入 `source`；凭证属于客户端/配置/传输层。
- 通过 `builtins.ts` 保持工具顺序显式且稳定。
- 真正的 MCP 客户端必须调用原始 MCP 工具名称，而非全局注册表名称。
