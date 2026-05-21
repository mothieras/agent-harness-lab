# Agent Teams

## 核心概念

让 Agent 不再是一个人在战斗。多 Agent 有名字、有角色、有状态，通过内存邮箱异步通信。

```
S04 (Subagent)              S09 (Teammate)
匿名、一次性                 命名、持久化
spawn→execute→return→destroy spawn→working→idle→working→...
同步等待结果                  fire-and-forget，结果走通知注入
只有返回值                   有收件箱，可跨轮次收发消息
无状态                       config.json 记录状态
```

## 关键设计决策

### 1. 内存 Map 替代文件 JSONL

教程用文件做邮箱（`alice.jsonl` 追加写入，读完清空），我们换成 `Map<string, TeamMessage[]>`。

**为什么可以换？** 教程是 Python 脚本，跑完退出，需要落盘。我们是一个 Node 进程常驻，Teammate 和 Lead 同进程，不需要跨进程通信。进程崩了 teammate 也没了。

**代价**：放弃崩溃恢复。收益：零 I/O、零序列化、天然无并发问题（Node 单线程事件循环）。

### 2. Teammate 复用 agentLoop，不复写循环

教程的 `_teammate_loop()` 和 `agent_loop()` 是两个独立函数，模式相似但代码重复。我们让 teammate 调同一个 `agentLoop()`，通过参数区分：

| 参数 | Lead | Teammate |
|------|------|----------|
| `maxTurns` | 200 | 50 |
| `allowedTools` | 全部 17 个 | 6 个（bash/read/write/edit/send_message/read_inbox） |
| `system` | "You are a team lead" | "You are 'alice', role: coder" |
| `beforeTurn` | 有（查 lead 收件箱） | 有（查自己收件箱） |
| `runSubAgent` | 有 | 无 |
| `runTeammate` | 有 | 无 |

**代价**：给 agentLoop 加了 `beforeTurn` hook 和 3 个 team 相关选项。agentLoop 的职责边界从"纯粹循环"变成了"循环 + 编排"。

### 3. AsyncLocalStorage 传递 Agent 身份

同一个 `send_message` handler，lead 调用时 `from="lead"`，alice 调用时 `from="alice"`。不需要两个 handler，用 Node.js 内置的 `AsyncLocalStorage` 在调用链中自动携带身份。

```typescript
// 启动时
agentIdentity.run("lead", () => agentLoop(...));
agentIdentity.run("alice", () => agentLoop(...));

// handler 里
const from = agentIdentity.getStore() ?? "lead";
```

### 4. fire-and-forget：void 替代 threading.Thread

Python 用 `threading.Thread` 让 teammate 后台跑（同步阻塞必须开线程）。Node.js 的 `client.messages.create()` 返回 Promise，`void agentLoop(...)` 不 await 就让它在事件循环上自己跑。不需要 Worker Threads。

**困惑点**：async/await 到底怎么并发的？Node 只有一个主线程，`await` 暂停当前函数但不阻塞整个线程——让出控制权给事件循环处理别的任务。多个 Promise 可以交替推进（并发），但不是同时执行（并行）。这个问题我还没完全搞清楚，需要专门看"Node.js 事件循环 + 异步模型"。

### 5. 锁的讨论

教程的 `readInbox()` 读和清空之间有 TOCTOU 窗口，Python 和 JS 都存在。教程不加锁是因为单消费者场景概率极低。我们加锁的话成本为零（内存 Promise 链），但最终选择：**内存 Map 不需要锁**（Node 单线程，`drainInbox` 里的 push 和 splice 之间没有 yield 点被插入）。

### 6. 通知注入：对齐 background 模式

Teammate 完成后不阻塞 Lead。通知通过 `<teammate-updates>` 标签在下一轮 LLM 调用前自动注入对话，跟 `<background-results>` 完全一致的模式。

```
registerLoop → Promise.finally → push notification
agentLoop 每轮开始 → drainNotifications → 注入 <teammate-updates>
```

### 7. clone 架构参考

看了"Claude Code Best"的逆向工程代码，它用 `createSubagentContext()` 彻底隔离 mutable state + `CacheSafeParams` 共享 prompt cache + `AsyncGenerator` 统一同步/异步路径。比我们的实现成熟很多，但核心思想一致：上下文隔离 + 异步通知。

## 新增工具

| 工具 | 用途 | 谁有 |
|------|------|------|
| `spawn_teammate` | 创建持久队友（编排层拦截） | Lead |
| `list_teammates` | 查看团队名册 | Lead |
| `send_message` | 发消息到队友收件箱 | Lead + Teammate |
| `read_inbox` | 读自己的收件箱 | Lead + Teammate |
| `broadcast` | 群发所有队友 | Lead |

## 文件变更

| 文件 | 动作 |
|------|------|
| src/team/types.ts | 新建：TeamMember/TeamMessage/TeamConfig 类型 |
| src/team/teammateManager.ts | 新建：spawn/inbox/通知/config 管理 |
| src/agentLoop.ts | +beforeTurn hook, +runTeammate/drainTeammateNotifications 选项, +spawn_teammate 拦截 |
| src/tools/toolDefinitions.ts | +5 个 team tool schema |
| src/tools/toolRuntime.ts | +agentIdentity (AsyncLocalStorage), +4 个 team handler |
| src/appContext.ts | +TeammateManager 字段 |
| src/config.ts | system prompt 增加 team 工具说明 |
| src/subagent.ts | +TEAMMATE_ALLOWED_TOOLS 导出（后移至 team/） |
| src/cli.ts | buildTeamOptions() 工厂，装配 runTeammate/beforeTurn/drain 回调 |
| note/s09-agent-teams.md | 新建 |
