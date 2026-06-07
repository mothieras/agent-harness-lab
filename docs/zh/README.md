1|> 本文档由 README.md 翻译，英文版为准。
2|
3|## Agent Harness Lab
4|
5|一个从头构建的、无框架的 TypeScript 编码 Agent 运行时（约 2200 行）—— model↔tools 核心循环逐块搭建，使每个运行时关注点（工具调度、权限门控、子 Agent 委托、上下文压缩、错误恢复）都在代码中可见，而非埋藏在框架内部。
6|
7|始于 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 教程中的 Python 实现，随后大幅重写并扩展为模块化的 TypeScript 运行时——多 Agent 委托、两层上下文压缩、技能加载和权限管道均为独立添加。
8|
9|## 已构建内容
10|
11|- **Agent 循环** —— model ↔ tools 核心循环，包含 max_turns 和截止时间约束
12|- **工具系统** —— 每个文件一个工具，按功能分组（文件操作、任务跟踪、后台任务、异步子 Agent 委托、技能、记忆），通过单个 `loadBuiltinTools` 提供者组合
13|- **系统提示** —— 按稳定性排序的节组装（soul → guidelines → skills → memory）
14|- **权限管道** —— 三道门禁检查（拒绝列表 → 规则匹配 → 用户审批）
15|- **Hook 总线** —— 六个事件点，基于实例的 HookBus（非全局状态）
16|- **子 Agent** —— 通过 `subagent`/`check_subagent` 内置工具进行异步 `agentLoop` 委托；即发即弃，身份隔离，宿主自动唤醒，仅 lead 结果注入（参见 ADR 0006）
17|- **技能加载** —— 两层注入：系统提示中的索引，按需加载完整内容
18|- **上下文压缩** —— 微压缩（>30k tokens）、自动压缩（>50k tokens）、prompt 溢出时反应式压缩
19|- **错误恢复** —— 输出 token 恢复、prompt 溢出时反应式压缩，以及针对速率限制、过载和瞬时网络故障的有界退避
20|- **任务系统** —— JSON 文件持久化任务（`.tasks/`），支持状态转换和依赖
21|- **后台任务** —— 即发即弃的 shell 命令，带通知注入
22|- **记忆** —— 跨会话持久化记忆（`.memory/*.md`），自动提取和整合
23|
24|## 源码布局
25|
26|- `src/main.ts` → `src/cli/index.ts` → `src/app/context.ts` → `src/loop/loop.ts` 是正常的启动路径
27|- `src/loop/` —— 核心循环、恢复决策、选项、截止时间、上下文压缩、响应格式化
28|- `src/prompt/` —— 系统提示节和按稳定性排序的组装
29|- `src/permission/` —— 三道门禁权限管道（拒绝列表、规则、用户审批）
30|- `src/hooks/` —— 类型化 `HookBus`（`hookBus.ts`）、运行时注入（`runtimeHooks.ts`）、标记消息注入
31|- `src/tools/` —— `RegisteredTool` 契约（`types.ts`）、`ToolRegistry`、`ToolRuntime`、允许的工具配置文件、单个 `builtins.ts` 组合，以及按功能分组每个文件一个工具（`file/`、`task/`、`background/`、`subagent/`、`skill/`、`memory/`），附带同目录的状态管理器；`mcp/` 模拟提供者边界
32|- `src/app/` —— DI 容器（`AppContext`）/ 组合根和工具配置文件验证
33|- `src/cli/` —— 交互式 readline shell 和终端呈现
34|
35|## 运行时流程
36|
37|1. `createAppContext()` 构建管理器，然后 `ToolRegistry` → `ToolRuntime` → `SubAgentRunner`，接着加载内置 `RegisteredTool[]`（包括 `subagent`/`check_subagent`）以及任何预加载的提供者结果，并验证允许的工具配置文件。
38|2. `agentLoop()` 接收工具定义，仅负责 model/tool 协议编排。
39|3. 工具执行经过 `ToolRuntime.invokeTool()` → `ToolRegistry.getHandler()`。
40|4. 子 Agent 循环使用集中式允许的工具配置文件；未知的允许工具名称会快速失败，而不是被静默过滤。
41|
42|## 架构文档
43|
- `docs/zh/architecture/runtime-flow.md` —— 启动路径、循环职责和错误边界
- `docs/zh/architecture/tool-system.md` —— `RegisteredTool`、提供者、注册表/运行时、内置工厂和 MCP-0 模拟提供者边界
- `docs/zh/architecture/hook-system.md` —— 效应 Hook、控制 Hook、事件语义和 Hook 不变量
- `docs/zh/architecture/limitations-and-roadmap.md` —— 已知结构性限制和优先后续步骤
- `docs/zh/decisions/` —— 主要架构决策的简短 ADR 风格笔记
49|