# LeanClaw 执行计划索引

> 状态：当前执行入口
>
> 生效日期：2026-07-29

## 1. 唯一领取规则

实施者只能从 [`active/`](./active/) 领取任务。

- `active/`：已获准执行、当前可领取的计划；
- `completed/`：工程门禁和用户验收均完成的历史计划；
- `deferred/`：用户明确暂缓、满足重启条件后可能恢复的计划；
- `superseded/`：已被新计划替代，仅用于追溯决策。

`completed/`、`deferred/`、`superseded/` 中的内容均不可自行执行。研究文档、Phase 历史规格、审计记录和聊天结论也不能替代 active 计划。

## 2. 当前 Active

| Plan ID | 计划 | 当前阶段/任务 | 工程状态 | 用户状态 |
|---|---|---|---|---|
| `leanclaw-codepilot-optimization` | [CodePilot 借鉴分析与 LeanClaw 优化提升执行方案](./active/CodePilot借鉴分析与LeanClaw优化执行方案.md) | P1 / CP1 | T04–T09 全部关闭；CP1 工程裁决 accepted | P0 已验收；**CP1 等待用户验收** |

当前执行交接：[LeanClaw 后续任务交接 - Claude 执行说明](../Claude后续任务交接.md)。

## 3. 领取前检查

1. 阅读 [../current-baseline.md](../current-baseline.md)；
2. 阅读本索引和目标 active 计划的 frontmatter；
3. 只领取 `current_task`，确认其依赖已完成；
4. 阅读任务涉及的 guardrail、测试规格和最近审计记录；
5. 清理/重构先锁定行为，功能开发先准备失败证据；
6. 完成后同步计划、验证证据和未测边界；
7. 不得把工程完成直接改成用户验收。

阶段收口统一使用 [STAGE_ACCEPTANCE_TEMPLATE.md](./STAGE_ACCEPTANCE_TEMPLATE.md)。`Code complete`、`Tests pass`、`Smoke pass`、`Review pass`、`Engineering accepted`、`User accepted`、`Release ready`、`Shipped` 必须分别记录，任何一个状态都不能替代另一个。

实际验收记录统一保存在 [`docs/acceptance/`](../acceptance/README.md)，不放入 `active/`，避免被误认成可领取计划。

## 4. 状态字段

每个计划必须在文件顶部保留以下 frontmatter：

```yaml
---
plan_id: stable-kebab-case-id
status: active
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
current_phase: P0
current_task: T00
engineering_status: pending
user_approval: approved
---
```

允许值：

| 字段 | 允许值 |
|---|---|
| `status` | `active`、`completed`、`deferred`、`superseded` |
| `engineering_status` | `pending`、`in_progress`、`complete`、`blocked` |
| `user_approval` | `pending`、`approved`、`accepted`、`rejected` |

`user_approval: approved` 只表示获准开始实施；`accepted` 才表示用户完成阶段或计划验收。

计划 frontmatter 是当前执行指针，不替代阶段验收记录。阶段验收记录必须保存被验证的 commit/产物、环境、命令、Smoke Ledger、未测边界、回滚说明与用户明确决定。

## 5. 状态流转

所有流转都使用 `git mv` 或等价的可追踪移动，并在同一变更中更新本索引。

### Active → Completed

仅当以下条件同时满足：

- 所有任务和阶段门禁完成；
- 当前基线、测试、打包和未测边界已经刷新；
- 用户明确回复“验收通过”或同等明确表述。

移动后增加：

```yaml
status: completed
engineering_status: complete
user_approval: accepted
completed_at: YYYY-MM-DD
```

### Active → Deferred

只在用户明确暂缓时移动。文件顶部增加：

```yaml
status: deferred
archive_reason: 简述为什么暂缓
archived_at: YYYY-MM-DD
restart_condition: 可观察、可判断的重启条件
```

只有用户主动要求恢复且重启条件满足后，才能移回 active；恢复原因写入决策日志。

### Active → Superseded

只在新计划已经承担原计划职责时移动。文件顶部增加：

```yaml
status: superseded
archive_reason: 简述替代原因
archived_at: YYYY-MM-DD
superseded_by: ../active/new-plan.md
```

替代计划必须反向链接旧计划，避免决策链断裂。

## 6. 防漂移规则

- 一个 `plan_id` 只能有一个文件；
- 索引状态、目录和 frontmatter 必须一致；
- 计划中的完成状态必须有代码、测试或验收证据；
- 自动检查只能验证结构，不能证明实现或用户验收；
- 回复“继续”、批准开始、测试通过、本机打包成功都不能自动设置 `user_approval: accepted`；
- `Release ready` 需要适用的分发门禁通过；`Shipped` 需要真实渠道、版本、hash 和可获取证据；
- Phase 2 的既有文档保留在原位置，属于生命周期规则生效前的历史规格，不迁入 active；
- 发现语义漂移时先把状态降级为 `pending/unknown`，再补证据。

## 7. 新计划模板

使用 [PLAN_TEMPLATE.md](./PLAN_TEMPLATE.md) 起草。未获批准的提案保留在研究/评审文档中，不进入四个执行目录；用户批准后再设置真实字段并移入 `active/`。未经批准的研究和备选方案不得伪装成 active 执行计划。
