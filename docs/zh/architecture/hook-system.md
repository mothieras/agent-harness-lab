1|> 本文档由 hook-system.md 翻译，英文版为准。
2|
3|# Hook 系统
4|
5|Hook 在已知的生命周期点扩展 Agent 循环。它们被有意分为效应 Hook 和控制 Hook。
6|
7|## 事件
8|
9|```text
10|LoopStart
11|UserPromptSubmit
12|PreToolUse
13|PostToolUse
14|ToolResultsReady
15|Stop
16|```
17|
18|## 效应 Hook
19|
20|效应 Hook 运行每个已注册的回调。返回值被忽略。
21|
22|```text
23|LoopStart
24|UserPromptSubmit
25|PostToolUse
26|ToolResultsReady
27|```
28|
29|将这些用于生命周期状态变更、消息/结果变更、终端显示和其他观察者行为。
30|
31|重要语义：
32|
33|- `LoopStart` 初始化每循环状态。
34|- `UserPromptSubmit` 可在模型调用前变更 `messages`。
35|- `PostToolUse` 观察已完成的工具调用并可更新本地状态。
36|- `ToolResultsReady` 可在结果列表作为用户消息推送之前变更它。
37|
38|`ToolResultsReady` 仅变更。它不再通过第二个通道返回额外文本。
39|
40|## 控制 Hook
41|
42|控制 Hook 返回 `string | null`，并在第一个非 null 字符串处停止。
43|
44|```text
45|PreToolUse
46|Stop
47|```
48|
49|`PreToolUse` 可以阻止工具调用。返回的字符串成为 `tool_result.content`。
50|
51|`Stop` 可以在非工具模型停止后强制继续。返回的字符串作为用户消息追加。
52|
53|## 类型契约
54|
55|`src/hooks/hookBus.ts` 定义了每个事件的参数类型：
56|
57|```ts
58|type HookArgs = {
59|  LoopStart: [messages];
60|  UserPromptSubmit: [messages];
61|  PreToolUse: [block];
62|  PostToolUse: [block, output];
63|  ToolResultsReady: [results];
64|  Stop: [messages];
65|};
66|```
67|
68|这避免了 Hook 实现中的 `unknown[]` 类型转换，并在代码中记录了循环契约。
69|
70|## 失败策略
71|
72|Hook 回调目前会将异常抛出到调用者。目前这是有意为之。
73|
74|不要静默吞掉 Hook 失败，除非 Hook 系统首先获得显式的 Hook 类别，例如仅审计或尽力而为日志。
75|
76|## 不变量
77|
78|- 效应 Hook 不得短路。
79|- 控制 Hook 必须在第一个非 null 字符串处短路。
80|- `ToolResultsReady` 应通过变更 `results` 来添加内容。
81|- Hook 代码不应成为提供者发现、MCP 传输或工具标准化逻辑的存放地。
82|