1|# 0005: 稳定的 Subagent 编排
2|
3|> 本文档由 0005-stable-subagent-orchestration.md 翻译，英文版为准。
4|
5|## 状态
6|
7|已接受，随后在 subagent 执行模型（同步 → 异步）方面被 [0006](0006-async-subagent-runner.md) 取代。下方的 role/name 元数据、teammate 推迟以及 CLI readline 生命周期决策仍然有效。
8|
9|## 背景
10|
11|手动 CLI 测试表明，基本的 file、task、background、skill、subagent、registry、runtime、builtin 工厂、hook 和 mock MCP 边界大多可以工作。不稳定的行为集中在编排和 CLI 生命周期上。
12|
13|失败的路径将 `teammate` 用于 reviewer 风格的任务：
14|
15|```text
16|Create a teammate named reviewer, ask it to review docs/architecture/tool-system.md,
17|then read the message it sends back.
18|```
19|
20|lead agent 创建了 teammate，反复读取空的 inbox，看到 teammate 保持 `working` 状态，试图再次向其发送消息，最终遇到 readline 生命周期崩溃：
21|
22|```text
23|Error [ERR_USE_AFTER_CLOSE]: readline was closed
24|```
25|
26|根本问题是架构性的：`teammate` 是一个异步 actor，而此请求期望的是阻塞式委托。lead agent 只收到一个 "spawned" 工具结果，因此 lead 的回合可能在 teammate 完成之前就结束了。结果后续依赖于用户的提示、inbox 排空以及 teammate 的自我报告。
27|
28|Claude Code / Codex 风格的任务委托更适合建模为阻塞式工具调用：
29|
30|```text
31|lead 调用 subagent/delegate
32|runtime 等待子 agent 完成
33|子结果作为工具结果返回
34|lead 在同一回合中恢复并向用户报告
35|```
36|
37|## 决策
38|
39|使用 `subagent` 作为委托工作的默认编排路径。
40|
41|从 lead agent 的角度来看，默认行为是同步的：
42|
43|- lead 调用 `subagent` 工具。
44|- subagent 运行一个隔离的 `agentLoop`。
45|- lead 等待 subagent 循环完成、超时或失败。
46|- subagent 的最终响应作为 `tool_result` 返回。
47|- lead 在同一回合中继续处理该结果。
48|
49|为 `subagent` 扩展显式的 role 元数据：
50|
51|- `prompt`：必需的任务提示。
52|- `role`：可选的角色描述，例如 `code reviewer`。
53|- `name`：可选的显示标识，例如 `reviewer`。
54|- `max_turns`：可选的正整数。
55|- `timeout_ms`：可选的正整数。
56|
57|role 和 name 仅应影响 subagent 的系统提示和可观察的日志。它们不得引入持久的 teammate 状态。
58|
59|暂时将 `teammate` 从默认编排入口点中隐藏。
60|
61|这意味着：
62|
63|- 默认不注册 `teammate` 编排工具。
64|- 将现有的 teammate manager 和 team builtin 工具保留在源代码中，以供未来的异步 actor 工作使用。
65|- 不要在此变更中删除 teammate 代码。
66|- 不要将普通的 reviewer、tester 或 analyzer 任务路由到 teammate。
67|
68|修复 CLI readline 关闭处理，因为这不是 teammate 特有的问题。一旦 readline 接口已关闭，CLI 不得再次调用 `rl.question()`。
69|
70|## 非目标
71|
72|此变更不重新设计 Provider、Registry、Runtime、builtin 工厂、HookBus 或 MCP。
73|
74|此变更不实现完整的异步 teammate 运行时。以下内容仍然推迟：
75|
76|- `wait_teammate`。
77|- teammate 取消。
78|- teammate 超时策略。
79|- 异步 teammate 工作完成时的 lead 自动唤醒。
80|- inbox 注入与手动 `read_inbox` 语义的对比。
81|- 跨 lead 和后台 teammate 的并发权限提示。
82|
83|## 后果
84|
85|优点：
86|
87|- Reviewer 风格的任务使用更简单且符合预期的阻塞式委托路径。
88|- lead 在委托工作返回之前不会停止。
89|- subagent 结果不依赖于 inbox 交付。
90|- CLI 对 readline 关闭事件更加健壮。
91|- 主要运行时边界保持薄层：编排仍是在应用组装时注册的普通工具。
92|
93|权衡：
94|
95|- Teammate 不再作为默认可见的工具。
96|- 异步协作被推迟。
97|- 现有的 teammate 测试可能需要转向 manager 级别的覆盖范围，而非默认编排行为。
98|
99|## 实现范围
100|
101|### Subagent
102|
103|- 在 `subagent` 工具 schema 中添加 `role` 和 `name` 字段。
104|- 将 `role` 和 `name` 传入 `runSubAgent()`。
105|- 从 workspace、可选的 name 和可选的 role 构建 subagent 系统提示。
106|- 保留 `max_turns` 和 `timeout_ms` 的当前默认值。
107|- 保持允许的工具集受 `SUB_AGENT_ALLOWED_TOOLS` 控制。
108|
109|### 编排工具注册
110|
111|- 默认注册 `subagent`。
112|- 停止在默认 CLI/app 编排路径中注册 `teammate`。
113|- 保留 teammate 实现文件。
114|- 保留 `TEAMMATE_ALLOWED_TOOLS` 供未来的异步 teammate 工作使用，除非它在 TypeScript 中变为未使用。
115|
116|### CLI 生命周期
117|
118|- 使用关闭标志保护 readline 的使用。
119|- 将 `rl.question()` 引发的 `ERR_USE_AFTER_CLOSE` 视为正常退出路径。
120|- 避免在 readline 已关闭后再次调用 `rl.close()`。
121|- 对权限提示应用相同的受保护问题路径。
122|
123|## 测试
124|
125|添加或更新以下测试：
126|
127|- `subagent` 工具 schema 接受可选的 `role` 和 `name`。
128|- `runSubAgent()` 在子系统提示中包含 role/name。
129|- `subagent` 保持阻塞并将子最终响应作为工具输出返回。
130|- `subagent` 保持 max-turn 和超时覆盖行为。
131|- 默认编排注册暴露 `subagent` 但不暴露 `teammate`。
132|- readline 关闭处理不会抛出 `ERR_USE_AFTER_CLOSE`。
133|
134|暂时将 teammate 测试限制在现有 manager 行为的范围内：
135|
136|- 正在运行的同名 spawn 返回错误。
137|- 已解决的循环变为 `idle`。
138|- 被拒绝的循环变为 `failed`。
139|
140|在此阶段不要添加需要 teammate inbox 交付作为默认编排路径一部分的测试。
141|
142|## 不变量
143|
144|- `agentLoop` 必须对工具是 builtin、编排还是 MCP 保持无感知。
145|- `ToolRuntime` 必须继续通过 `ToolRegistry` 进行调度。
146|- Subagent 委托必须通过正常的工具结果流返回。
147|- Teammate 异步 actor 行为不得成为委托 review 或 analysis 任务的默认路径。
148|