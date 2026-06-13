# 0008: Agent 对象模型与 fork 出的子 Agent

> 本文档由 0008-agent-object-model.md 翻译，英文版为准。

## 状态

已接受。取代 [0006](0006-async-subagent-runner.md) 的**身份隔离与子 Agent 构造**机制，以及 [0005](0005-stable-subagent-orchestration.md) 的 `runSubAgent` 构造：独立的 `agentIdentity` 字符串 ALS 和 `runSubAgent` 自由函数被 `Agent` 类、`parent.fork()` 和单一的 `currentAgent` ALS 取代。0006 的异步*执行*模型——`SubAgentRunner`、宿主自动唤醒、永不 reject、仅 lead 排空、并发上限、无嵌套子代理——**保持有效**。改变的只是子 Agent 如何被构造、身份如何被携带。

## 背景

有三样东西各自独立地累积起来：

1. `agentLoop(messages, toolRuntime, options)` 接收松散打包的参数；身份、配置、服务和会话分别穿线传递。
2. 按 Agent 身份存放在它自己的 `agentIdentity: AsyncLocalStorage<string>`（ADR 0006）中，以 `subId` / `"lead"` 为键，仅用于让 hooks 归属到正确的 Agent。
3. 子 Agent 由 `runSubAgent` 构造——一个从父级 `toolRuntime` 构造内联 Agent 配置的自由函数。

这能用，但有两道接缝：身份是一个与其所标识之物脱节的*字符串* ALS，而"子 Agent 是什么"散落在 `runSubAgent` 和 runner 之间。

Hermes（production 参照）把 Agent 建模为一个到处实例化、从不被继承的对象（`AIAgent`）；那里的一次 fork 要手动重绑约 10 个私有字段，因为该 Agent 拥有自己的有状态服务。这种手动重绑正是"拥有服务的 Agent"的代价。

## 决策

引入一个 `Agent` 类（`src/agent.ts`）作为身份 + 配置 + 会话的单元，并让子 Agent 成为它的 fork。

- **`Agent`** 打包 `id`、配置（`system`、预算、`allowedTools`）、共享服务*引用*（`toolRuntime`、`hooks`、`checkPermission`）和会话 `messages`。它不拥有任何有状态服务——进程级基础设施（skill / memory / task / background 管理器）留在 `AppContext` 中，通过 `toolRuntime` 访问。这正是让 fork 廉价且无泄漏的原因——与 Hermes 的手动重绑相反。
- **`agentLoop(agent)`** 从实例读取一切，并在整个运行期间将其绑定到单一的 `currentAgent: AsyncLocalStorage<Agent>`。这是确立身份的**唯一**位置；独立的 `agentIdentity` 字符串 ALS 被删除，`runtimeHooks` 现在以 `currentAgent.getStore()?.id ?? "lead"` 为键存放按 Agent 状态。
- **`parent.fork(overrides)`** 派生一个子 Agent，采用显式的三态切分：
  - **共享**（同一引用）：`toolRuntime`。
  - **继承**（除非被覆盖）：`workspaceRoot`、`checkPermission`（因此子级权限只能 ≤ 父级）。
  - **隔离**（仅取自 overrides，绝不从父级复制）：`id`、`name`、`role`、`system`、`maxTurns`、`timeoutMs`、`allowedTools`、`messages`、`hooks`。
- **`forkSubAgent(parent, id, prompt, options)`** 取代 `runSubAgent`：它把父级 fork 成子 Agent 工具画像，预算更短、会话以 prompt 播种。`id` 是**必填**的，因此子级绝不会静默地别名为 `"lead"`。`allowedTools` 只能**收窄**画像（requested ∩ profile），因此子级的工具访问保持 ⊆ 父级，且够不到 `subagent`。
- **fork 出的子 Agent 是静默的。** `hooks` 不被继承；`HookBus` 是属于 lead 的宿主交互装置。子 Agent 在没有它的情况下运行，除非被显式交予自己的 hooks，因此其工具日志不会污染 lead 的输出。

依赖方向是承重属性：`Agent → ToolRuntime`，但 `ToolRuntime` / `ToolRegistry` / 每个工具**绝不导入 `Agent`**。必须作用于其调用者的工具（如 `subagent`）读取 `currentAgent.getStore()`——一条由 ALS 携带的反向边，而非类型导入，因此不存在 `Agent ↔ ToolRuntime` 循环。

## 考虑过的替代方案

- **把 `AppContext` 服务迁移到 `Agent` 上**（每个 Agent 拥有自己的 memory / task / skill 管理器）。否决：这些是进程级、落盘的基础设施，生命周期长于任何单个 Agent。拥有有状态服务正是迫使 Hermes 在 fork 时逐字段重绑、并在父子间泄漏状态的原因。通过 `toolRuntime` 按引用共享它们能让 fork 保持干净。
- **在 `Agent` 对象之外保留字符串 `agentIdentity` ALS。** 否决：一个概念两个 ALS。一旦 Agent 是对象，对象*就是*身份；再用一个键控它的字符串是冗余的，且可能漂移。
- **用 `depth` 计数器限制递归。** 作为无用防御否决：`SUB_AGENT_ALLOWED_TOOLS` 已经排除了 `subagent`，因此子级无法生成孙级。

## 后果

好处：

- 单一身份：ALS 携带 Agent 本身，而非键控它的字符串。fork 是唯一的派生路径，切分在一个方法里显式呈现。
- 无泄漏的 fork：因为 `Agent` 不拥有任何有状态服务，一次 fork 按引用共享基础设施并自动隔离会话/身份——无需手动重绑 N 个字段。
- 单调的工具范围：子级只能收窄、绝不放宽，且绝不能生成孙级。

权衡：

- `currentAgent` 是*隐式*依赖：fork 其调用者的工具假定自己运行在 `agentLoop` 内。这不在任何签名里，因此这类工具必须兜底（`subagent` 工具在 `currentAgent` 未设置时报错）。
- 子 Agent 运行期间不可观测：没有 hooks，`check_subagent` 只能报告子级的消息数，而非进度（见限制 #6）。

## 不变量

- `agentLoop` 是 `currentAgent` 的唯一绑定者，也是确立按 Agent 身份的唯一位置。
- `ToolRuntime` / `ToolRegistry` / 工具绝不导入 `Agent`；反向访问走 `currentAgent`。
- `Agent` 不得拥有有状态服务；进程级基础设施留在 `AppContext`。
- `fork` 不得继承 `hooks`——子级默认静默。
- fork 出的子 Agent 的 `allowedTools` 必须 ⊆ `SUB_AGENT_ALLOWED_TOOLS`（仅收窄），后者排除了 `subagent`（无嵌套子代理——与 0006 一致）。
- `forkSubAgent` 要求显式 `id`（无静默 `"lead"` 别名）。
