# 0007: 工具结构和项目布局大修

> 本文档由 0007-tool-structure-and-layout-overhaul.md 翻译，英文版为准。

## 状态

已接受（2026-06-07）。建立在 [0001](0001-provider-registry-runtime.md)（provider/registry/runtime）之上。移除 [0005](0005-stable-subagent-orchestration.md)/[0006](0006-async-subagent-runner.md) 曾保持推迟的 teammate 子系统。

## 背景

0001 中的 provider→registry→runtime 模型是健全的，且大多数工具已经是单文件的。但有五件事已经偏离对齐：

1. **Teammate 是死代码。** `subagent`（0006）完全取代了它，然而 `src/team/`、`team` 工具组、`teammate` 工具 profile、`getTeammateManager` 依赖以及两个运行时注入器（`inbox`、`teammate-updates`）都还在，外加约 23 个测试引用。
2. **编排绕过了管道。** `subagent`/`check_subagent` 在 `src/app/orchestrationTools.ts` 中手工构建，并直接注册到 `ToolRuntime` 上——这是唯一不通过 provider 进入 registry 的工具。注册也*在* context 构建之后进行，通过闭包读取 `app.subAgentRunner` 和事后设置的 `app.checkPermission` 字段——这是一种惰性绑定的坏味道。
3. **文件工具违反了"每个工具一个文件"。** `bash`/`read`/`write`/`edit` 各拆分为 `xTool.ts`（定义）+ `runX.ts`（逻辑），与单文件的 task/skill/memory 工具不同。
4. **依赖是一个"上帝之包"。** 每个工具工厂接受一个 6 字段的 `BuiltinToolDeps`，即使它只使用一个字段。
5. **命名和布局不一致。** `toolRegistry.ts`/`toolRuntime.ts`/`toolTypes.ts`（在 `tools/` 内部有冗余的 `tool` 前缀）与 `input.ts` 形成对比；状态服务（`taskManager`、`backgroundManager`）平铺在内核旁边；循环核心位于 `src/agent/`。

## 决策

一个五步重构，每步保持绿色（`tsc --noEmit` + 测试）并分别提交。

- **完全移除 teammate**（如果需要，可以从 git 恢复）。
- **每个工具有显式依赖。** 丢弃 `BuiltinToolDeps`；每个工厂声明一个仅包含其使用服务的内联对象。单一的 `BuiltinServices` 对象由组合根解构并按组分发。将每个 `runX.ts` 合并到其工具文件中。
- **`subagent`/`check_subagent` 成为普通的 builtin 工具**，位于 `src/tools/subagent/` 下，通过与其他所有工具相同的组合方式注册。删除 `src/app/orchestrationTools.ts`。重新排序 `createAppContext`，使 registry **最后填充**——`ToolRegistry → ToolRuntime → SubAgentRunner → 加载工具 → registerMany`——这样在构建工具时 runner 已经存在。无需惰性 getter。
- **注入 `checkPermission`** 到 `createAppContext`（CLI 在 context 之前构建它并传入）；移除可变的 `AppContext.checkPermission` 字段。
- **按功能分组的布局**，使用冗余自由的名称（参见 [tool-system.md](../architecture/tool-system.md) 中的目标树）。MCP 保持完整，位于 `src/tools/mcp/` 下。

规划期间锁定的选择：

1. **MCP 保留** — 它是一个有文档记录的边界（0004），有自己的测试，不是附带品。
2. **`app/context.ts` 是纯 DI 组装**；hook 注册保留在 CLI 中。
3. **每个工具有独立的依赖**，而非共享的包。
4. **面向模型的工具名称不变**（`update_memory`、`check_background`、……）——重命名会搅动提示和断言，而没有行为收益。
5. **注入 `checkPermission`**，消除事后可变字段。

## 后果

优点：

- 每个工具——包括 subagent 编排——遵循同一路径：单文件 `RegisteredTool` → 组 index → `builtins.ts` → registry → runtime。应用层中无特殊情况。
- 启动时没有惰性 getter 和事后组装修改；构建顺序表达了真实的依赖图。
- 每个工具的依赖在其签名中可见；无"上帝之包"。
- 布局与系统的推理方式相匹配（循环 / 按功能分组的工具 / hooks），冗余的 `tool`/`Tool` 前缀已消失。

权衡：

- `builtins.ts` 是一个添加工具时必须编辑的中心列表（这是自注册的刻意逆操作——参见 [limitations-and-roadmap.md](../architecture/limitations-and-roadmap.md)）。
- 此移动触及了约 45 个文件和约 160 个导入点（通过路径重写脚本机械化完成，由 `tsc` 验证）。

## 不变量

- 所有 builtin 工具（包括 subagent）通过 `src/tools/builtins.ts` 中的 `loadBuiltinTools()` 注册；没有任何工具从应用层直接注册到 `ToolRuntime`。
- 无共享的工具依赖包；每个工厂仅声明其所需内容。
- Registry 在 `createAppContext` 中最后填充，在 runtime 和 `SubAgentRunner` 存在之后。
- `checkPermission` 通过 `createAppContext` options 传入；不存在可变的 `AppContext.checkPermission`。
- `src/tools/<group>/` 下每个工具一个文件；组 `index.ts` 仅做聚合。

## 测试

- 所有预先存在的行为测试保持绿色（移除 3 个死 `TeammateManager` 测试后，53 个通过）。
- 结构契约测试（`tests/builtin-tool-ownership.test.ts`）被重写以断言新布局：`builtins.ts` 聚合并按工具工厂，工厂文件位于 `file/bash.ts … memory/save.ts`，`src/tools/builtin/` 不再存在。

