> 本文档由 runtime-flow.md 翻译，英文版为准。

# 运行时流程

本项目是一个精简的编码 Agent 运行时。核心设计目标是将模型循环、工具加载、工具调度、Hook 和有状态服务保持可见并可独立理解。

## 启动路径

正常启动流程经过：

```text
src/main.ts
-> src/cli/index.ts
-> src/app/context.ts
-> src/loop/loop.ts
```

`createAppContext()` 是组合根。它构建长生命周期服务、从提供者加载工具、注册它们、验证工具配置文件并构造 `ToolRuntime`。

Agent 循环不加载提供者。它接收工具定义，并在模型请求工具时调用 `ToolRuntime.invokeTool()`。

## 应用组合

`src/app/context.ts` 负责启动组装，按依赖顺序：

- 构建 `SkillLoader`、`MemoryManager`、`TaskManager`、`BackgroundManager`。
- 创建 `ToolRegistry`，然后在其上创建 `ToolRuntime`，再在运行时上创建 `SubAgentRunner`。
- 通过 `loadBuiltinTools()` 加载内置工具，只向每个工具传递其所需的服务（包括 `SubAgentRunner` 和可选的 `checkPermission`）。
- 在注册表中注册返回的 `RegisteredTool[]`。
- 注册传入 `createAppContext()` 的任何预加载提供者结果，并记录提供者诊断信息。
- 验证集中式工具配置文件。

注册表最后填充，因此在构建工具时运行时和子 Agent 运行器已经存在——无需惰性 getter 和组装后注册。`subagent` 和 `check_subagent` 是普通的内置工具（`src/tools/subagent/`），而非循环内部的特殊分支。

## Agent 循环

`src/loop/loop.ts` 负责协议编排：

1. 发出生命周期 Hook。
2. 向模型发送消息、系统提示和工具定义。
3. 通过 `src/loop/recovery.ts` 对模型/API 错误执行恢复决策。
4. 如果模型返回 `tool_use`，通过 `ToolRuntime` 调用工具。
5. 将 `tool_result` 块作为用户消息推送回去。
6. 如果模型停止，运行 `Stop` 控制 Hook 并返回，除非请求继续。

循环不应知道工具是内置的还是 MCP 的。它只看到名称、工具定义和运行时调用。

## 错误边界

错误按层有意分离：

- `errorRecovery.ts` 决定如何响应模型/API 调用失败。
- `agentLoop` 执行恢复动作，因为它拥有循环状态和消息流。
- `ToolRuntime` 将未知、不可用和抛出的工具错误转换为工具结果字符串。
- `ToolRegistry` 存储提供者诊断信息，用于解释不可用的工具命名空间。
- Hook 允许抛出异常；循环不会静默吞掉 Hook 失败。

不要将所有错误处理移入一个全局工具。不同的错误属于不同的生命周期阶段。

## 不变量

- `agentLoop` 不得导入提供者或 MCP 模块。
- `ToolRuntime` 必须通过 `ToolRegistry` 调度，而非自己的处理器映射。
- `ToolRegistry` 是已注册定义、处理器和诊断的运行时唯一真实来源。
- 提供者结果在应用组装时注册，而非在每次工具调用时。
- 子 Agent 工具是普通注册的内置工具，而非硬编码的循环分支。

