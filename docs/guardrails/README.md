---
guardrail_set: leanclaw-core
status: active
last_verified: 2026-07-29
---

# LeanClaw 模块护栏

本目录保存跨文件、后果严重且需要长期维持的工程不变量。护栏不是架构概览，也不是实现完成证明；修改相关模块前必须先阅读对应文档，并用其中的测试映射重新验证。

## 当前护栏

| 护栏 | 状态 | 修改前必须阅读的场景 |
|---|---|---|
| [State](State.md) | Active | Task 状态、Run/Step 生命周期、调度、Approval、Andon、恢复、归档 |
| [Privacy](Privacy.md) | Active | Renderer 投影、Activity、Need You、诊断日志/导出、密钥、本地路径 |
| [Migration](Migration.md) | Active | SQLite Schema、索引、迁移、历史 fixture、数据恢复 |

## 计划中的候选

`Permission`、`Automation`、`Release` 仍是候选护栏，尚未创建，也不代表已经完成治理。只有后续任务实际触碰对应边界、出现跨模块复发风险或进入正式发行决策时，才评估是否建立。

## 文档契约

每份护栏必须包含：

1. 词汇表；
2. 不变量；
3. 关键文件与责任；
4. 修改检查表；
5. 常见踩坑；
6. 测试覆盖映射；
7. 决策日志。

发现实现与护栏不一致时，不得静默修改文档来迁就代码。先把差异标为风险或未知，判断是实现缺陷、历史例外还是护栏过时，再用测试和决策记录关闭。

## 相关事实源

- [当前工程基线](../current-baseline.md)
- [执行计划索引](../exec-plans/README.md)
- [当前优化执行方案](../exec-plans/active/CodePilot借鉴分析与LeanClaw优化执行方案.md)
- [审计与交接](../审计与交接.md)
