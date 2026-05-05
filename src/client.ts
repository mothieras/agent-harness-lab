/**
 * createClient(apiKey, baseUrl?)
 *
 * 返回一个函数：call(messages, tools, systemPrompt) → Promise<LLMResponse>
 *
 * 职责：封装 Anthropic API 调用细节（model, max_tokens 等），
 * 让 loop.ts 无需知道 SDK 具体用法。
 */
// TODO: 使用 @anthropic-ai/sdk 创建 Anthropic 实例
// TODO: 返回 call 函数，内部调用 client.messages.create()
// TODO: 处理 ANTHROPIC_BASE_URL（兼容第三方 provider）
// TODO: 设置 max_tokens（s01 用 8000）