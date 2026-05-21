# Memory

## 核心概念

持久化的跨会话记忆。压缩会丢细节，memory 不参与压缩，用文件系统保存，跨会话保留。

```
之前                         现在
压缩后偏好退化成摘要          索引常驻 system prompt，不参与压缩
新会话记忆归零               .memory/*.md 跨会话保留
只能硬编码偏好                update_memory 工具主动写入 + extract 后台被动提取
```

## 关键设计决策

### 1. 索引常驻 system prompt，不做 per-turn side-query

教程每轮调一次 LLM 选相关记忆注入上下文。我们改成索引一直挂在 system prompt 里，模型自己看到需要的用 read_file 去读。

**收益**：零额外 API 调用；system prompt 稳定 → prompt cache 可命中。
**代价**：当前会话新增的记忆，索引下次会话才生效（但模型刚写的东西自己知道）。

### 2. 不维护 MEMORY.md 文件，buildIndex() 全量扫描

教程用 MEMORY.md 作为索引文件，每次写记忆后全量重建。我们直接扫描 .memory/ 目录，buildSystem() 时拼索引字符串——每个会话只调一次，性能无影响。

### 3. 两条写入路径

| 路径 | 触发 | 方式 |
|------|------|------|
| 主动 | 模型调 `update_memory` | handler → write() → 写 .md 文件 |
| 被动 | 每轮 stop_reason != "tool_use" | fire-and-forget → extract() → LLM 抽记忆 → write() |

`#dirtyThisTurn` 标志防止重复：主动写过后跳过同轮被动提取。

### 4. 去重合并

会话退出时（/exit），文件数 ≥ 10 触发 consolidate() → LLM 去重合并 → 清空目录 → 重写文件。

### 5. 文件格式

每条记忆一个 .md，YAML frontmatter（name, description, type）+ Markdown 正文。slug 由 name 推导。

## 新增工具

| 工具 | 用途 |
|------|------|
| `update_memory` | 创建或更新一条记忆 |

## 文件变更

| 文件 | 动作 |
|------|------|
| src/memory/types.ts | 新建：MemoryType, MemoryEntry |
| src/memory/memoryManager.ts | 新建：buildIndex, write, list, extract, consolidate |
| src/appContext.ts | +memoryManager 字段 |
| src/config.ts | buildSystem() 读索引注入 system prompt |
| src/tools/toolDefinitions.ts | +update_memory schema |
| src/tools/toolRuntime.ts | +update_memory handler, +MemoryManager 注入 |
| src/cli.ts | buildSystem() 传参变化, +extract fire-and-forget, +consolidate on exit |
