# 0006: 异步 Subagent Runner

> 本文档由 0006-async-subagent-runner.md 翻译，英文版为准。

## 状态

已接受。在 subagent 执行模型（同步 → 异步）方面取代 [0005](0005-stable-subagent-orchestration.md)。0005 中的 role/name 元数据、teammate 推迟以及 CLI readline 生命周期决策仍然有效。注：下文中的 `src/agent/` 路径后来被 [0007](0007-tool-structure-and-layout-overhaul.md) 迁移到了 `src/tools/subagent/`，设计本身不变。

## 背景

0005 将 `subagent` 变成了一个**阻塞式**工具：lead 调用它，runtime 内联运行子 `agentLoop`，子的最终响应在同一回合中作为 `tool_result` 返回。这稳定了 reviewer 风格的委托，并消除了 teammate inbox 失败模式。

暴露了两个限制：

- Task 系统产生依赖图，但阻塞式 subagent 无法利用它。即使图中显示两个独立的任务，lead 也只能逐个运行它们——每个 `subagent` 调用都会阻塞循环直到子完成。DAG 是描述性的，但不能并行执行。
- 0005 明确推迟了"异步工作完成时的 lead 自动唤醒"。这个推迟正是并行委托所缺失的原语。

此运行时是单线程的。这里的"并发"指的是在一个事件循环上的协作交错：agent 循环是 I/O 绑定的（每个回合等待 LLM 调用），因此当 lead 等待自身的模型调用时，挂起的子所等待的模型调用可以推进。这为 I/O 绑定的 LLM 工作带来了真正的吞吐量提升——而非 CPU 并行。

代码库中已经有一个经过验证的异步原语：`BackgroundManager`（fire-and-forget shell 命令），具有 `run → id`、`check`、`hasRunning`、`drainNotifications`，以及 CLI 中的宿主端自动唤醒。注意：目前没有 `Stop` 控制 hook 来控制 lead——"当有待处理工作时继续"的行为已经存在于 CLI 循环中，而不是在 agent 中。

## 决策

将阻塞式 `subagent` 工具替换为一个异步的 `SubAgentRunner`（`src/agent/subAgentRunner.ts`），镜像 `BackgroundManager`。

`SubAgentRunner` 是一个**与任务无关的执行原语**：

- `run(prompt, options) → sub_id` — 立即返回；fire-and-forget 式创建子进程。
- `check(subId?)`、`hasRunning()`、`drainNotifications()` — 与 `BackgroundManager` 相同的形态。
- 它包装现有的 `runSubAgent`，且不得导入 `TaskManager`。

**分层。** runner 是底层原语；Task-DAG 驱动的调度是其之上的**可选策略层**，由 LLM 驱动。`task_id` 是仅作关联标签的不透明随附元数据（在通知中回显）；runner 从不读取或修改任务状态。这使得裸的临时委托（无任务）成为默认能力，而 DAG 调度则是可添加的。

**Lead 生命周期使用宿主自动唤醒（选项 A），而非 Stop hook（选项 B）。**

- lead 自由结束其回合。CLI 循环执行 `while (hasPendingAsyncWork(app))`——后台任务或 `subAgentRunner.hasRunning()`——并通过 `waitForAsyncWork`（带 SIGINT 退出的 500ms 轮询）重新调用 lead。
- 结果通过 lead 专属的 `injectSubagentResults` 在 `PreLLMCall` 上到达 lead，以 `<subagent-results>` 消息的形式交付。

**设计了三个隔离属性**，因为与 `BackgroundManager`（独立 OS 进程，零共享状态）不同，subagent 在进程内运行，共享 `toolRuntime`：

- **身份隔离** — 每个子进程在 `agentIdentity.run(subId, …)` 内执行，因此其 hook 归属于 `subId`，而非 lead。没有它，子进程会破坏 lead 的任务状态并排空 lead 的 inbox。
- **永不拒绝** — 分离的 promise `.catch` 进入 `error` 状态；未处理的拒绝会导致 Node 进程崩溃（`BackgroundManager` 通过 `exec` 的回调免费获得了这一点）。
- **仅 lead 排空** — `injectSubagentResults` 和 `injectBackgroundResults` 在 `agentName() === "lead"` 为 false 时提前返回，因此子进程无法排空 lead 的共享结果队列。

**与 `BackgroundManager` 的有意差异：**

- 结果以**不截断**的方式注入——subagent 的产出就是其全部价值；shell 尾部则不是。（`BackgroundManager` 将结果截断为 500 个字符。）
- **并发上限**（`DEFAULT_MAX_CONCURRENT = 3`）在超出限制时以错误字符串拒绝新的运行。Subagent 消耗 token 且共享一个 API key（有 429 风险）；shell 命令则没有。

**交付不变量。** `settle()` 在运行计数下降**之前**同步推送通知，中间没有 `await`。因此当宿主观察到 `hasRunning() === false` 时，每个结果都已在队列中，随后的 `runLeadTurn` 会将其排空。没有完成的结果会在回合之间丢失。

## 考虑过的替代方案

- **选项 B — `Stop` 控制 hook**，强制 lead 在子进程挂起时继续。被拒绝：它将生命周期关注点放入了推理循环内部，并退化为消耗 token 的忙等待（每次"你完成了吗？"都是另一次 LLM 调用）。宿主自动唤醒以零 LLM 调用轮询，并复用了现有的后台模式。
- **并发工具调度（对 `tool_use` 块使用 `Promise.all`）。** 被拒绝作为主要模型：它会在最慢的子进程上阻塞回合，不能与进一步的 lead 推理交错，也不能对早期结果做出反应。异步 runner 严格更灵活；批量调度在之上保持兼容。
- **确定性 harness DAG 调度器**（运行时自动调度就绪任务）。推迟：它将项目变成了工作流引擎，并将 LLM 降级为任务定义者。选项 A 将调度权保留在宿主层，保留了此可能性。

## 非目标

- 无嵌套 subagent — `SUB_AGENT_ALLOWED_TOOLS` 排除 `subagent`/`check_subagent`（防止 fork 炸弹并保持通知路由扁平）。
- Runner 不自动修改任务状态 — LLM 在调度前将任务标记为 `in_progress`（系统提示中的指导），这也防止了重新唤醒时的重复调度。
- 无 teammate 重新设计；teammate 代码如 0005 中一样保持推迟。
- 无 `subagent` 取消；SIGINT 跳过等待但不中止正在运行的子进程（与后台任务相同的语义）。

## 后果

优点：

- Task DAG 变为可并行执行：lead 为独立任务创建子进程，并在结果到达时收集。
- 异步机制被复用而非重新发明——与后台任务共享一个心智模型。
- 裸的临时委托（无任务）是默认能力；DAG 调度是可添加的。
- 修复了一个预先存在的潜在 bug：`injectBackgroundResults` 现在是仅 lead 的，因此子进程不能再排空 lead 的后台队列。

权衡：

- lead 不再将 subagent 结果作为创建调用的 `tool_result` 接收；结果作为注入的 `<subagent-results>` 在后续回合到达（"创建一个，然后等待"的情况多一个回合）。
- DAG 并行是尽力而为的（由 LLM 指导），不保证最优。
- 并发的子进程并行消耗 token；上限限制了但不能消除这一点。

## 不变量

- `SubAgentRunner` 不得导入 `TaskManager`；`task_id` 保持不透明。
- 每个子进程必须在 `agentIdentity.run(subId, …)` 内执行。
- 来自 `run()` 的分离 promise 不得拒绝。
- `injectSubagentResults` / `injectBackgroundResults` 必须仅在 lead 身份中排空。
- `hasRunningSubagents` 不得存在于 `ToolRuntime` 上（会产生 `toolRuntime → subAgentRunner → toolRuntime` 的循环）；CLI 直接读取 `app.subAgentRunner`。
- `agentLoop` 对 subagent 编排保持无感知；`subagent`/`check_subagent` 是普通注册的工具。

## 测试

- Runner：返回 `sub_id` 并注册为运行中；完成时报告不截断的结果，然后排空一次；每个子进程在其自身身份（非 `lead`）下运行；拒绝的子进程以 `error` 状态结束而不崩溃；上限拒绝超出限制的运行；无 id 的 `check()` 列出全部。
- 装配：`createAppContext` 暴露一个空闲的 runner。
- 工具：默认编排暴露 `subagent` 和 `check_subagent`；schema 携带可选的 `task_id`；工具立即返回 `sub_id`。
- Hooks：subagent 结果仅在 lead 上下文中注入，不在子上下文中。
- CLI：`hasPendingAsyncWork` 反映运行中的 subagent。
- 提示：指南描述异步调度、`check_subagent` 以及在调度前将任务标记为 `in_progress`。

