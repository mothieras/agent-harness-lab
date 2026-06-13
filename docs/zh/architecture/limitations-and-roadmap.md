> 本文档由 limitations-and-roadmap.md 翻译，英文版为准。

# 限制与路线图

诚实记录哪些部分*还不干净*以及下一步方向。这是一个刻意做薄的用于学习研究的 harness，因此若干"限制"是其有意的非目标——这些在末尾单独列出，以免被误认为是待办事项。

在有用之处，条目会引用一个成熟的 production agent（Hermes，约 100 万行代码）如何处理相同关注点，作为方向上的正确性验证。

## 已知限制

### 1. `ToolRuntime` 是个杂物袋（最高优先级）

`src/tools/runtime.ts` 混合了两种职责：通用工具调度（`invokeTool` → registry → handler）和任务/后台便利方法（`taskSummary`、`hasActiveTasks`、`drainBackgroundNotifications` 等）。调度器不应该了解特定工具族。

- **为什么重要：** 这是重构后留下的唯一比其余部分更不干净的地方。通用循环调度路径耦合到了两个特定子系统。
- **方向：** 拆分为一个纯调度器（registry 查找 + 错误规范化）和单独的任务/后台状态访问器，由 hooks/CLI 直接读取。Hermes 将这些保持分离为 `agent/tool_executor.py` 和 `agent/tool_guardrails.py`，与循环和状态都不同。
- **在 ADR 0007 中明确排除**；这是自然的下一个切分点。

### 2. 集中式组合无法扩展到少量工具之外

`src/tools/builtins.ts` 在一个文件中列出了每个工具、其顺序及其依赖。对于一个薄的"一切可见"的 harness 来说这很好，但添加工具意味着编辑这个集中式列表。

- **方向（仅当工具数量增长时）：** 转向去中心化的自注册与发现——每个工具文件自行注册；一个发现流程导入自注册模块。Hermes 正是这样做的（`tools/registry.py`：在模块级别 `registry.register(...)` + `discover_builtin_tools()`），这也是它无需集中式清单就能承载约 90 个工具的原因。在清单本身成为摩擦之前，保留显式清单。

### 3. 单一模型提供者接缝

`src/config.ts` 针对 Anthropic SDK（通过 `ANTHROPIC_BASE_URL` 支持 Anthropic 兼容提供者）。对于真正不同的提供者协议，没有适配器层。

- **方向（仅当需要多协议时）：** 在 `src/loop/loop.ts` 中的模型调用边界引入提供者适配器接缝。Hermes 将每个协议隔离在 `agent/anthropic_adapter.py`、`agent/gemini_native_adapter.py`、`agent/codex_responses_adapter.py` 等之后。目前这会是过度设计。

### 4. 无动态工具门控/搜索

所有注册的工具定义每轮都发送给模型（受限于 `profiles.ts` 的允许列表）。在当前工具数量下没问题。

- **方向（仅在规模扩大时）：** 当完整工具列表给上下文窗口带来压力时，采用动态工具搜索/延迟 schema 加载。Hermes 为此使用 `tools/tool_search.py` + `managed_tool_gateway.py`。

### 5. 测试偏向集成测试

覆盖率偏向于连接层（`createAppContext`、registry/runtime、hook 注入）而非每个工具的单元测试。工具处理器大多通过间接方式被测试。

- **方向：** 随着各个工具积累真正的逻辑，为每个工具工厂添加有针对性的单元测试。结构契约测试（`tests/builtin-tool-ownership.test.ts`）已经在守卫布局。

### 6. 子 Agent 运行期间不可观测

被 fork 的子 Agent 静默运行：`Agent.fork` 不继承 lead 的 `HookBus`（它是属于 lead 的宿主交互装置——共享它会把子 Agent 的工具日志泄漏进 lead 的输出）。因此子 Agent 运行时，`check_subagent` 只能报告其消息数，而非实际进度，后台子 Agent 的工作也没有流式输出到任何地方。

- **为什么重要：** 在并发子 Agent 的情况下，用户在子 Agent 落定前对每个子 Agent 在做什么是盲的。
- **方向：** 一个按 Agent 的输出汇（前台流式 vs 后台静默，外加一种呈现哪些子 Agent 正在运行的方式）——等到有 TUI 来渲染它时。推迟而非放弃：`Agent.fork` 上的 `hooks` 字段就是子 Agent 自己的输出汇要接入的接缝。见 [0008](../decisions/0008-agent-object-model.md)。

## 有意的非目标（非限制）

这些是刻意的，与项目作为一个薄的、可读的 harness 而非框架保持一致：

- **无嵌套子代理** — `SUB_AGENT_ALLOWED_TOOLS` 排除了 `subagent`/`check_subagent`（ADR 0006）。
- **无真正的 MCP 传输** — `src/tools/mcp/` 在 `McpClient` 之后的 MCP-0 边界处停止（ADR 0004）。
- **集中式、显式的 `builtins.ts`** — 有意选择而非自动发现，这样完整的工具集和顺序在一个文件中可见（何时重新考虑请见限制 #2）。
- **无工作流/DAG 调度器** — 任务调度权限保持在 LLM 手中，而非确定性引擎（ADR 0006）。

