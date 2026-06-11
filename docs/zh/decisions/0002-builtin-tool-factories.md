> 本文档由 0002-builtin-tool-factories.md 翻译，英文版为准。

# 0002：内置工具工厂

## 状态

已采纳。下方"决策"里的 `src/tools/builtin/**` 布局后来被 [0007](0007-tool-structure-and-layout-overhaul.md) 取代——内置工具改为放在 `src/tools/<group>/`、由 `src/tools/builtins.ts` 组合。"每个工具一个工厂"的原则与 `toolDefinitions.ts`/`toolHandlers.ts` 不变量仍然有效，变的只是目录位置。

## 背景

在引入 `RegisteredTool` 之后，内置工具仍然驻留在一个集中的 `toolHandlers.ts` 文件中。这在一个地方保留了过多的所有权，并使内置提供者感觉像一个重新命名的全局 handler 表。

期望的所有权模型是每个工具拥有自己的定义和 handler。

## 决策

将内置工具移到 `src/tools/builtin/**` 下。

每个工具文件导出一个工厂：

```ts
createXTool(deps): RegisteredTool
```

组索引聚合相关工具。内置提供者加载顶层的内置索引并返回生成的工具。

## 后果

好的方面：

- 工具的所有者一目了然。
- 定义和 handler 不会在分散的文件中漂移。
- 新工具遵循可重复的路径。
- 内置工具和未来的 MCP 工具共享相同的最终形态。

权衡：

- 文件更多。
- 简单工具有稍微多一些样板代码。

## 不变量

- 不要重建 `src/tools/toolDefinitions.ts`。
- 不要重建 `src/tools/toolHandlers.ts`。
- 组索引仅做聚合。
- 保持内置工具顺序显式。

