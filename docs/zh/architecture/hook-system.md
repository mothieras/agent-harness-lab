> 本文档由 hook-system.md 翻译，英文版为准。

# Hook 系统

Hook 在已知的生命周期点扩展 Agent 循环。它们被有意分为效应 Hook 和控制 Hook。

## 事件

```text
LoopStart
PreLLMCall
PreToolUse
PostToolUse
ToolResultsReady
Stop
```

## 效应 Hook

效应 Hook 运行每个已注册的回调。返回值被忽略。

```text
LoopStart
PreLLMCall
PostToolUse
ToolResultsReady
```

将这些用于生命周期状态变更、消息/结果变更、终端显示和其他观察者行为。

重要语义：

- `LoopStart` 初始化每循环状态。
- `PreLLMCall` 可在模型调用前变更 `messages`。
- `PostToolUse` 观察已完成的工具调用并可更新本地状态。
- `ToolResultsReady` 可在结果列表作为用户消息推送之前变更它。

`ToolResultsReady` 仅变更。它不再通过第二个通道返回额外文本。

## 控制 Hook

控制 Hook 返回 `string | null`，并在第一个非 null 字符串处停止。

```text
PreToolUse
Stop
```

`PreToolUse` 可以阻止工具调用。返回的字符串成为 `tool_result.content`。

`Stop` 可以在非工具模型停止后强制继续。返回的字符串作为用户消息追加。

## 类型契约

`src/hooks/hookBus.ts` 定义了每个事件的参数类型：

```ts
type HookArgs = {
  LoopStart: [messages];
  PreLLMCall: [messages];
  PreToolUse: [block];
  PostToolUse: [block, output];
  ToolResultsReady: [results];
  Stop: [messages];
};
```

这避免了 Hook 实现中的 `unknown[]` 类型转换，并在代码中记录了循环契约。

## 失败策略

Hook 回调目前会将异常抛出到调用者。目前这是有意为之。

不要静默吞掉 Hook 失败，除非 Hook 系统首先获得显式的 Hook 类别，例如仅审计或尽力而为日志。

## 不变量

- 效应 Hook 不得短路。
- 控制 Hook 必须在第一个非 null 字符串处短路。
- `ToolResultsReady` 应通过变更 `results` 来添加内容。
- Hook 代码不应成为提供者发现、MCP 传输或工具标准化逻辑的存放地。

