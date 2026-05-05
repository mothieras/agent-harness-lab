/**
 * agentLoop(messages, client, tools, registry, systemPrompt)
 *
 * s01 的核心：while stop_reason === "tool_use" 循环。
 *
 * 1. 调用 LLM → 拿到 response
 * 2. 把 response.content 追加为 assistant message
 * 3. 如果 stop_reason !== "tool_use"，循环结束
 * 4. 否则：遍历 response.content 中的 ToolUseBlock，
 *    按 name 查 registry 执行，收集 ToolResult，
 *    追加为 user message，回到步骤 1
 */
// TODO: 实现 while 循环
// TODO: 遍历 content blocks，过滤 type === "tool_use"
// TODO: 调用 registry.get(block.name)(block.input)，收集 results
// TODO: 打印执行的命令和输出（黄色命令，截断输出）
// TODO: 把 results 作为 user message 追加到 messages