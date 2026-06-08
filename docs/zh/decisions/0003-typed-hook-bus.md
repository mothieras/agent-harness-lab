> 本文档由 0003-typed-hook-bus.md 翻译，英文版为准。

# 0003：类型化 Hook 总线

## 状态

已采纳。

## 背景

hook 总线最初使用一种回调类型：

```ts
(...args: unknown[]) => string | null
```

这隐藏了真正的契约。有些事件会改变消息，有些观察工具输出，有些阻断工具执行，有些强制继续执行。更糟糕的是，旧的触发路径对每个事件在遇到第一个非空字符串时就短路，即使调用者忽略了返回值。

## 决策

将 hooks 分为：

- 副作用 hooks：运行所有回调，忽略返回值。
- 控制 hooks：返回 `string | null`，在遇到第一个字符串时短路。

在 `HookArgs` 中定义每个事件的参数类型。

`ToolResultsReady` 现在仅为变更类型；回调直接推送额外的结果块。

## 后果

好的方面：

- hook 的意图在类型系统中可见。
- 副作用 hooks 不会在运行时意外跳过后续回调。
- 运行时 hooks 不再需要 `unknown` 转换。
- hook 系统不太可能成为 MCP/提供者逻辑的万用桶。

权衡：

- HookBus 有两个触发方法而非一个。
- TypeScript 仍然允许在 `void` 期望的位置传入返回值的函数，但运行时忽略该值。

## 不变量

- 对副作用 hooks 使用 `emitEffect()`。
- 对控制 hooks 使用 `triggerControl()`。
- 不要给 `ToolResultsReady` 添加第二个返回值通道。
- 不要在没有明确策略的情况下吞掉 hook 异常。

