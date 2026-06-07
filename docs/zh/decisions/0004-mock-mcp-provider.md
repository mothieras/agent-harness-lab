> 本文档由 docs/decisions/0004-mock-mcp-provider.md 翻译，英文版为准。

# 0004: Mock MCP Provider 边界
4|
5|## 状态
6|
7|已接受。
8|
9|## 背景
10|
11|工具架构已为 MCP 做好准备，但立即连接真实的 MCP 传输会将多个关注点混在一起：provider 加载、schema 转换、结果标准化、进程/HTTP 传输、凭证以及连接生命周期。
12|
13|我们需要在引入真实传输复杂性之前，验证 provider/registry/runtime 边界。
14|
15|## 决策
16|
17|将 MCP-0 实现为一个可 mock 的 provider 边界：
18|
19|- 定义一个最小化的 `McpClient` 接口。
20|- 实现 `loadMcpTools({ serverName, client })`。
21|- 将列出的 MCP 工具转换为带命名空间的 `RegisteredTool` 条目。
22|- 将来源元数据保存为 `{ type: "mcp", serverName, originalName }`。
23|- 构建调用 `client.callTool(originalName, input)` 的 handler。
24|- 将 MCP 风格的结果标准化为当前的字符串工具结果格式。
25|- 当列出工具失败时返回不可用的 provider 诊断信息。
26|- 提供 `MockMcpClient` 用于测试和架构验证。
27|
28|`createAppContext()` 接受预加载的 provider 结果，因此测试或未来的设置代码可以注册 mock MCP 工具，而无需使 app context 变为异步。
29|
30|## 后果
31|
32|优点：
33|
34|- MCP 数据流现在可通过 registry 和 runtime 实际执行。
35|- 循环本身对 MCP 无感知。
36|- 真实传输可以在 `McpClient` 之后添加。
37|- 结果标准化和诊断可在没有外部服务器的情况下进行测试。
38|
39|权衡：
40|
41|- 这还不是真实的 MCP 传输。
42|- 应用启动时不会自动发现 MCP 配置。
43|- 真实传输仍需要配置、凭证、生命周期和连接处理。
44|
45|## 不变量
46|
47|- Registry 名称使用 `mcp__server__tool`。
48|- MCP 服务器使用原始工具名称调用。
49|- `source` 不得包含凭证。
50|- Provider 故障返回诊断信息，而非部分注册的损坏工具。
51|