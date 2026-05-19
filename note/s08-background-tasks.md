# S08: Background Tasks + Auto-Wake + AppContext

## 核心概念

让 Agent 发出后台命令后不阻塞，继续干活。命令结果通过通知队列自动注入对话。

```
S07                          S08
同步 bash (await)            + background_run (fire-and-forget)
无后台执行                    + BackgroundManager 通知队列
无自动唤醒                    + CLI auto-wake 轮询
无 DI                        + AppContext 统一管理有状态服务
SYSTEM 常量                  + buildSystem() 工厂函数
agentLoop 直接 console.log   + logToolResult 回调解耦
手动 task_list               + <task-status> 自动注入
```

## 关键设计决策

### 1. BackgroundManager — tasks 和 notifications 分开存

- **tasks Map**：持久查询用，check_background 随时可查
- **notifications 数组**：一次性消费，drain 即清空
- 分开的理由：drain 是 O(1)（取走清空），如果用 `notified: bool` 标记则是 O(n) 全量扫描

### 2. Node.js 不需要锁

Python 用 `threading.Lock()` 因为真线程并发。Node.js 的 `child_process.exec` 回调在单线程事件循环里执行，天然无竞态。代码更简单。

### 3. Drain 时机：LLM 调用之前，不是之后

放在之后会让结果延迟一个回合才被 LLM 看到。放在之前保证 LLM 生成回复时掌握最新情报。

注入形式是独立的 `<background-results>` user 消息，不是 tool_result（tool_result 必须绑定 tool_use_id）。

### 4. Auto-wake：系统负责等待，不推给用户或 LLM

agentLoop 结束后检查 `hasRunningBackgroundTasks()`：
- 有 → 不进 readline，每 500ms 轮询，完成后自动重入 agentLoop
- 无 → 正常回 CLI 等待用户输入
- Ctrl+C 跳出等待，回到提示符

### 5. AppContext：有状态服务的 DI 容器

```typescript
AppContext {
  skillLoader: SkillLoader      // 移自 runtime.ts（已删除）
  toolRuntime: ToolRuntime {
    taskManager: TaskManager    // 持久化任务
    backgroundManager: BackgroundManager  // 后台命令
  }
}
```

标准：放进去的东西必须同时满足 — 有状态 + 进程生命周期 + 跨层使用。

### 6. log.ts：终端输出与 agentLoop 解耦

`agentLoop` 通过 `onToolResult` 回调让调用方决定如何展示工具结果。CLI 注入 `logToolResult`，未来 Web API 可传空或自定义。

### 7. task 工具：从 toolRuntime 移到 agentLoop

破解循环依赖 `toolRuntime → subagent → agentLoop → toolRuntime`。task 工具是编排层概念（启动子代理），不该在工具层。通过 `AgentLoopOptions.runSubAgent` 回调注入。

### 8. 任务自动注入

- LLM：`<task-status>` 消息在首轮和任务变更后自动注入（详细列表）
- 用户：`printTaskStatus()` 在每次 agentLoop 返回后打印（`[ ]` 标记格式）
- system prompt 告诉 LLM 不需要手动调 `task_list`

## 结构清理

| 问题 | 动作 |
|------|------|
| `listDetailed()` 与 `listAll()` 85% 重复 | 删 listDetailed，统一用 listAll |
| `countByStatus()` 没人用 | 删除 |
| `createToolRuntime()` 没人调 | 删除 |
| 错误字符串化 6 处重复 | 提取 `formatError.ts` |
| TaskManager default export 不一致 | 改 named export |
| `estimateTokens` / `textFromContent` 意外导出 | 去 export |
| 循环依赖 toolRuntime ↔ subagent | task handler 上移到 agentLoop |
| `runtime.ts` 单例 | 删除，skillLoader 入 AppContext |
| BG 模块级单例 | 删除，变为 ToolRuntime 实例字段 |

## 文件变更

| 文件 | 动作 |
|------|------|
| src/tools/backgroundManager.ts | 新建 |
| src/appContext.ts | 新建 |
| src/log.ts | 新建 |
| src/tools/formatError.ts | 新建 |
| note/s08-background-tasks.md | 新建 |
| src/tools/toolDefinitions.ts | +background_run, +check_background |
| src/tools/toolRuntime.ts | +BG handler, +drain, +taskSummary, +taskStatusForUser |
| src/agentLoop.ts | +drain 逻辑, +task handler 上移, +<task-status> 注入, +onToolResult/runSubAgent 回调 |
| src/cli.ts | +auto-wake, +printTaskStatus, +runSubAgent 注入 |
| src/config.ts | SYSTEM → buildSystem(), +system prompt 更新 |
| src/subagent.ts | +toolRuntime 参数 |
| src/tools/index.ts | 删 createToolRuntime |
| src/tools/taskManager.ts | 删 listDetailed/countByStatus/maxId, +启动清理, 改 named export |
| src/tools/readFileTool.ts | formatError 统一 |
| src/tools/writeFileTool.ts | formatError 统一 |
| src/tools/editFileTool.ts | formatError 统一 |
| src/runtime.ts | 删除（移入 AppContext） |
| src/contextCompact.ts | estimateTokens 去 export |
| src/format.ts | textFromContent 去 export |
| README.md | +描述更新 |
