/**
 * bash 定义 + handler
 *
 * 职责对应 s01 的 TOOLS 和 run_bash()：
 * - 定义部分：name, description, input_schema
 * - handler 部分：执行 shell 命令，返回 stdout/stderr
 */
// TODO: 导出 bashTool: ToolDefinition
// TODO: 导出 runBash: ToolHandler
//   - 黑名单检查（rm -rf /, sudo, shutdown, reboot, > /dev/）
//   - 执行命令（shell: true, cwd: process.cwd()）
//   - 超时 120s
//   - 输出截断 50000 字符
//   - 返回 "(no output)" 如果 stdout+stderr 为空