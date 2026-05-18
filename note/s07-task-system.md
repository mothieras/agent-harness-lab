# S07: Persistent Task System

## 核心概念

把任务从内存移到磁盘，让它们活过上下文压缩。

```
S06 (todoManager)          S07 (TaskManager)
内存 items[]               .tasks/task_N.json
压缩后丢失                压缩不影响（从磁盘重读）
1个 todo 工具             4个 task_create/get/update/list
无依赖                     blockedBy 依赖图 + 级联清理
```

## 关键设计决策

1. **CRUD 拆成 4 个独立 tool**：每个 tool 有自己的 input schema 和 handler，而非像 Python 版用 `**kw` 反射路由。沿用了项目已有的 ToolRuntime 分发模式。

2. **blockedBy 只是信息标签**：不验证依赖是否真实完成，不检测环路，不全流程约束。LLM 看到 `(blocked by: 2)` 自行决定是否遵守。未来可以加拓扑排序做强约束。

3. **级联清理**：任务标记 completed → `clearDependency()` 遍历所有文件移除该 ID。不需要手动清理依赖。

4. **nextId 分配**：从已有文件中推导最大值 + 1。进程重启不重复。

## agentLoop 四层叠加

```
核心:    调模型 → 执行工具 → 循环
叠加1:   turns 上限 (防死循环)
叠加2:   deadlineAt 超时 (withDeadline / Promise.race)
叠加3:   microCompact + autoCompact (防爆 context window)
叠加4:   task 提醒 + subagent 支持
```

### withDeadline 模式
用截止时间(deadline)而非固定时长(timeout)。每次操作前 `remainingMs()` 动态计算剩余时间，保证整个 loop 共享一个截止点。通过 `Promise.race` 竞速实现。

### 提醒逻辑演进
- 初版：连续 3 轮不用 task 工具 → 盲目提醒
- 优化：加 `hasActiveTasks()` 扫描磁盘，无活跃任务不提醒
- 最终：加 `taskToolUsed` 标志，没碰过 task 工具前零开销，全完成后停计数器

## 文件变更

| 文件 | 动作 |
|------|------|
| src/tools/taskManager.ts | 新建：持久化 CRUD + 依赖图 |
| src/tools/todoManager.ts | 删除 |
| src/tools/toolDefinitions.ts | 1个todo → 4个task_* |
| src/tools/toolRuntime.ts | 新handler + requireInteger / optionalArrayOfIntegers |
| src/agentLoop.ts | 提醒逻辑 + taskToolUsed 标志 |
| src/config.ts | 系统提示词更新 |
| src/subagent.ts | 允许subagent使用task工具 |
| .gitignore | +.tasks/ |
