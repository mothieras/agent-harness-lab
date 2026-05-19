## Agent Harness Lab

A TypeScript learning harness for building coding-agent runtime pieces step by step:
tool loops, local tools, skill loading, subagents, slash commands, context compaction,
persistent task tracking with dependency graphs, background task execution with auto-wake,
and a DI container (AppContext) for service lifecycle management.

Based on the Python agent tutorial series by [Anthropic](https://github.com/anthropics/anthropic-cookbook)
— each chapter (S02–S08) maps to a lesson, reimplemented in TypeScript.
Learning notes are in `note/`.

The project is intentionally small so each harness concern stays visible in code instead
of being hidden behind a framework.

Design Checklist — 
    answer these BEFORE merging:

    1. Reusability   — Would this still work if called from a CLI/test/doc-gen?
    2. Lifecycle     — Do these pieces of state change at the same frequency?
    3. Concern type  — Business logic, or crosscutting (logging/metrics/cache)?
    4. Path weight   — Hot path (per call) or cold path (once at startup)?
    5. Falsifiable   — Is the choice based on objective criteria, not "I prefer"?
## Pre-merge Checklist

- [ ] **复用性**：换个调用方（CLI、测试、文档生成器）还能用吗？
- [ ] **生命周期**：这两块东西的变化频率一样吗？（启动时 vs 每次调用 vs 持久化）
- [ ] **横切关注点**：这是业务核心，还是统计/日志/缓存这类横切关注点？
- [ ] **路径权重**：这是热路径（每次调用）还是冷路径（启动一次）？
- [ ] **判据可证伪**：决策基于"我喜欢/感觉"，还是基于客观可争论的标准?
