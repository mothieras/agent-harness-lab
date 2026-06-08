# 0005: 稳定的 Subagent 编排

> 本文档由 0005-stable-subagent-orchestration.md 翻译，英文版为准。

## 状态

已接受，随后在 subagent 执行模型（同步 → 异步）方面被 [0006](0006-async-subagent-runner.md) 取代。下方的 role/name 元数据、teammate 推迟以及 CLI readline 生命周期决策仍然有效。

## 背景

手动 CLI 测试表明，基本的 file、task、background、skill、subagent、registry、runtime、builtin 工厂、hook 和 mock MCP 边界大多可以工作。不稳定的行为集中在编排和 CLI 生命周期上。

失败的路径将 `teammate` 用于 reviewer 风格的任务：

```text
Create a teammate named reviewer, ask it to review docs/architecture/tool-system.md,
then read the message it sends back.
```

lead agent 创建了 teammate，反复读取空的 inbox，看到 teammate 保持 `working` 状态，试图再次向其发送消息，最终遇到 readline 生命周期崩溃：

```text
Error [ERR_USE_AFTER_CLOSE]: readline was closed
```

根本问题是架构性的：`teammate` 是一个异步 actor，而此请求期望的是阻塞式委托。lead agent 只收到一个 "spawned" 工具结果，因此 lead 的回合可能在 teammate 完成之前就结束了。结果后续依赖于用户的提示、inbox 排空以及 teammate 的自我报告。

Claude Code / Codex 风格的任务委托更适合建模为阻塞式工具调用：

```text
lead 调用 subagent/delegate
runtime 等待子 agent 完成
子结果作为工具结果返回
lead 在同一回合中恢复并向用户报告
```

## 决策

使用 `subagent` 作为委托工作的默认编排路径。

从 lead agent 的角度来看，默认行为是同步的：

- lead 调用 `subagent` 工具。
- subagent 运行一个隔离的 `agentLoop`。
- lead 等待 subagent 循环完成、超时或失败。
- subagent 的最终响应作为 `tool_result` 返回。
- lead 在同一回合中继续处理该结果。

为 `subagent` 扩展显式的 role 元数据：

- `prompt`：必需的任务提示。
- `role`：可选的角色描述，例如 `code reviewer`。
- `name`：可选的显示标识，例如 `reviewer`。
- `max_turns`：可选的正整数。
- `timeout_ms`：可选的正整数。

role 和 name 仅应影响 subagent 的系统提示和可观察的日志。它们不得引入持久的 teammate 状态。

暂时将 `teammate` 从默认编排入口点中隐藏。

这意味着：

- 默认不注册 `teammate` 编排工具。
- 将现有的 teammate manager 和 team builtin 工具保留在源代码中，以供未来的异步 actor 工作使用。
- 不要在此变更中删除 teammate 代码。
- 不要将普通的 reviewer、tester 或 analyzer 任务路由到 teammate。

修复 CLI readline 关闭处理，因为这不是 teammate 特有的问题。一旦 readline 接口已关闭，CLI 不得再次调用 `rl.question()`。

## 非目标

此变更不重新设计 Provider、Registry、Runtime、builtin 工厂、HookBus 或 MCP。

此变更不实现完整的异步 teammate 运行时。以下内容仍然推迟：

- `wait_teammate`。
- teammate 取消。
- teammate 超时策略。
- 异步 teammate 工作完成时的 lead 自动唤醒。
- inbox 注入与手动 `read_inbox` 语义的对比。
- 跨 lead 和后台 teammate 的并发权限提示。

## 后果

优点：

- Reviewer 风格的任务使用更简单且符合预期的阻塞式委托路径。
- lead 在委托工作返回之前不会停止。
- subagent 结果不依赖于 inbox 交付。
- CLI 对 readline 关闭事件更加健壮。
- 主要运行时边界保持薄层：编排仍是在应用组装时注册的普通工具。

权衡：

- Teammate 不再作为默认可见的工具。
- 异步协作被推迟。
- 现有的 teammate 测试可能需要转向 manager 级别的覆盖范围，而非默认编排行为。

## 实现范围

### Subagent

- 在 `subagent` 工具 schema 中添加 `role` 和 `name` 字段。
- 将 `role` 和 `name` 传入 `runSubAgent()`。
- 从 workspace、可选的 name 和可选的 role 构建 subagent 系统提示。
- 保留 `max_turns` 和 `timeout_ms` 的当前默认值。
- 保持允许的工具集受 `SUB_AGENT_ALLOWED_TOOLS` 控制。

### 编排工具注册

- 默认注册 `subagent`。
- 停止在默认 CLI/app 编排路径中注册 `teammate`。
- 保留 teammate 实现文件。
- 保留 `TEAMMATE_ALLOWED_TOOLS` 供未来的异步 teammate 工作使用，除非它在 TypeScript 中变为未使用。

### CLI 生命周期

- 使用关闭标志保护 readline 的使用。
- 将 `rl.question()` 引发的 `ERR_USE_AFTER_CLOSE` 视为正常退出路径。
- 避免在 readline 已关闭后再次调用 `rl.close()`。
- 对权限提示应用相同的受保护问题路径。

## 测试

添加或更新以下测试：

- `subagent` 工具 schema 接受可选的 `role` 和 `name`。
- `runSubAgent()` 在子系统提示中包含 role/name。
- `subagent` 保持阻塞并将子最终响应作为工具输出返回。
- `subagent` 保持 max-turn 和超时覆盖行为。
- 默认编排注册暴露 `subagent` 但不暴露 `teammate`。
- readline 关闭处理不会抛出 `ERR_USE_AFTER_CLOSE`。

暂时将 teammate 测试限制在现有 manager 行为的范围内：

- 正在运行的同名 spawn 返回错误。
- 已解决的循环变为 `idle`。
- 被拒绝的循环变为 `failed`。

在此阶段不要添加需要 teammate inbox 交付作为默认编排路径一部分的测试。

## 不变量

- `agentLoop` 必须对工具是 builtin、编排还是 MCP 保持无感知。
- `ToolRuntime` 必须继续通过 `ToolRegistry` 进行调度。
- Subagent 委托必须通过正常的工具结果流返回。
- Teammate 异步 actor 行为不得成为委托 review 或 analysis 任务的默认路径。

