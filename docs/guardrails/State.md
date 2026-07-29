---
guardrail_id: state
status: active
last_verified: 2026-07-29
applies_to: task-state, run-step-lifecycle, scheduler, recovery, ledger
---

# State 护栏

## 1. 词汇表

| 术语 | 定义 |
|---|---|
| InternalStatus | SQLite 与 Runtime 使用的 14 个 Task 内部状态。 |
| UserStatus | Renderer 使用的 9 个用户状态；由内部状态穷尽映射。 |
| transition | 正常业务状态迁移入口；校验合法边、更新 Task、追加 `status-changed` 并按需发布。 |
| recovery escape hatch | 重启恢复时对瞬态状态执行的受控 SQL 修复；它不是正常业务迁移。 |
| scheduler queue | 进程内队列；只有数据库中仍为 `queued` 的 Task 可以执行。 |
| ledger | `run_events` 审计轨迹；它记录事实，但当前 Task 状态真值来自 `tasks.status`。 |
| archive compaction | 将旧事件事务性搬入 `run_events_archive`、删除热表副本并追加摘要事件。 |

## 2. 不变量

| 不变量 | 约束 |
|---|---|
| 状态映射穷尽 | 新增内部状态必须同步更新用户状态映射；不能让 UI 猜测状态。 |
| 合法边集中定义 | 正常业务迁移必须由 `ALLOWED` 和 `transition()` 控制；禁止散落的直接 `tasks.status` 更新。 |
| 交付门不可绕过 | `delivered` 只能从 `verifying` 进入。 |
| 归档是终态 | `archived` 没有出边。 |
| queued 是唯一调度入口 | scheduler 出队时必须重读数据库并丢弃非 `queued` 项；离开 queued 前清理内存队列。 |
| 同状态迁移不产生状态副作用 | `transition()` 对同状态返回 `false`；调用方必须避免继续写重复领域事件。 |
| 恢复例外必须受控 | 创建时可直接插入初始 `draft`；重启恢复可将瞬态状态修复为 `paused_by_user` 或 `draft`，并写 `recovered-after-restart`。除此之外不得新增直写例外。 |
| Task 与子实体一致 | Approval、Andon、Run、Step 的变更必须与 Task 状态形成一致快照；多表动作优先事务化，提交后再发布和调度。 |
| 审计历史不可无痕丢失 | 常规事件只追加；只有 archive compaction 可以搬迁/删除热表事件，且必须事务化并留下摘要。 |
| 事件不是状态真值 | 不得从投影后的 Activity/RunEvent 反推或覆盖 `tasks.status`。 |

## 3. 关键文件与责任

| 文件 | 责任 |
|---|---|
| [`src/shared/types.ts`](../../src/shared/types.ts) | InternalStatus、UserStatus 和共享实体类型。 |
| [`src/shared/machine.ts`](../../src/shared/machine.ts) | 用户状态映射、允许边、无自环规则。 |
| [`src/runtime/state.ts`](../../src/runtime/state.ts) | 正常 Task 状态迁移入口。 |
| [`src/runtime/api.ts`](../../src/runtime/api.ts) | 用户动作、Approval/Andon、增量修改、归档和重启恢复。 |
| [`src/runtime/engine.ts`](../../src/runtime/engine.ts) | 执行循环、验证门和交付。 |
| [`src/runtime/scheduler.ts`](../../src/runtime/scheduler.ts) | 排队、并发、重入和过期队列清理。 |
| [`src/runtime/ledger.ts`](../../src/runtime/ledger.ts) | 事件追加与归档压缩。 |
| [`src/shared/activity.ts`](../../src/shared/activity.ts) | 状态与恢复事件的用户投影。 |
| [`src/shared/privacy.ts`](../../src/shared/privacy.ts) | RunEvent 安全字段投影。 |

## 4. 修改检查表

- [ ] 写清 source、target、用户状态、取消路径、恢复路径和归档路径。
- [ ] 同步检查 `InternalStatus`、`UserStatus`、映射、`ALLOWED`、Activity、Need You 和筛选器。
- [ ] 除初始 `draft` 与既有 recovery escape hatch 外，不直接更新 `tasks.status`。
- [ ] 离开 `queued` 前清队列；进入 `queued` 只在事务提交后 `requestRun()`。
- [ ] 多表动作使用事务，并在提交后只发布一次完整快照。
- [ ] 检查 `transition()` 返回值，避免 no-op 后重复领域事件。
- [ ] 新事件同步更新 Activity 投影、Privacy allowlist 与测试。
- [ ] 持久化状态值改名或删除时提供 migration。
- [ ] 不放宽 `verifying → delivered` 与 `archived` 终态，除非有单独产品决策。
- [ ] 验证纯状态图、数据库持久化、重启恢复、scheduler、跨实体一致性和用户主路径。

## 5. 常见踩坑

1. **把“集中迁移”写成绝对规则。** 创建初态和重启恢复是现存例外；新增例外必须有原因、事件和专项测试。
2. **状态、事件、发布并非原子。** 当前 `transition()` 的 SQL、事件和总线发布不在同一事务，sink 异常也可能反向影响调用链。
3. **交互式启动可能半初始化。** `draft → planning → Brief/Run/Steps → queued` 尚未整体事务化。
4. **先发布再清子实体会产生短暂不一致。** stop/archive 等路径需警惕订阅者看到旧 Approval、Andon 或 Run。
5. **重复 pause/stop 会留下重复领域事件。** 同状态 no-op 不等于调用方自动幂等。
6. **恢复队列不是持久化队列。** 重启后修复瞬态状态，不重放进程内队列。
7. **`failed` 的生产语义尚未收敛。** 状态图中存在，但当前未发现常规生产迁移调用；扩展前先做产品和执行语义决策。

## 6. 测试覆盖映射

| 测试 | 已覆盖 | 当前缺口 |
|---|---|---|
| [`tests/machine.test.ts`](../../tests/machine.test.ts) | 映射、关键边、交付门、归档终态、自环 | 未锁定完整邻接矩阵 |
| [`tests/scheduler.test.ts`](../../tests/scheduler.test.ts) | FIFO、去重、容量、重入、暂停/取消清队列 | 无持久化队列恢复语义 |
| [`tests/e2e/data-governance.spec.ts`](../../tests/e2e/data-governance.spec.ts) | 事件归档摘要与治理路径 | 无 ledger 单元级故障回滚 |
| [`tests/e2e/activity.spec.ts`](../../tests/e2e/activity.spec.ts) | 状态/恢复/归档事件投影 | 无状态原子性断言 |
| [`tests/privacy.test.ts`](../../tests/privacy.test.ts) | RunEvent payload allowlist | 未表驱动覆盖全部状态事件 |

新增或修改状态行为时，至少补齐受影响边的数据库级测试。优先补的长期缺口是：`state.ts` 直接单测、完整邻接矩阵、恢复 SQL、重复动作幂等、多表故障回滚。

## 7. 决策日志

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-07-29 | 保留 `transition()` 为正常业务唯一入口，同时显式记录创建和恢复例外 | 与当前实现一致，避免用错误绝对规则掩盖恢复机制。 |
| 2026-07-29 | 将 ledger 定义为“不可无痕丢失”，而不是字面 append-only | 归档会合法地从热表删除已搬迁事件。 |
| 2026-07-29 | 把事务原子性、恢复测试和幂等性记录为风险，不冒充已解决 | T02 只建立护栏，不修改业务代码。 |
