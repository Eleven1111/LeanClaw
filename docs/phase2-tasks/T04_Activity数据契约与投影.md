# T04：Activity 数据契约与投影

> 状态：工程完成  
> 优先级：P0  
> 依赖：T03  
> 阻塞：T05、T08

## 1. 目标

把现有追加式 `run_events` 转换为稳定、类型化、面向用户的 Activity 数据，同时保留 Run Inspector 的原始技术账本。

## 2. 数据变化

建议 migration v11 为 `run_events` 和 `run_events_archive` 增加：

- `actor_type TEXT`
- `actor_id TEXT`
- `actor_name_snapshot TEXT`

全部可空，旧数据不回填虚构 Agent。

扩展 `appendEvent`：

```ts
interface EventActor {
  type: 'user' | 'agent' | 'system'
  id?: string
  name?: string
}
```

调用方不传时默认 `system`。明确的用户动作和 Agent 执行动作逐步传入 actor。

## 3. ActivityView

建议字段：

```ts
interface ActivityView {
  id: string
  seq: number
  kind:
    | 'task'
    | 'run'
    | 'step'
    | 'approval'
    | 'andon'
    | 'budget'
    | 'verification'
    | 'deliverable'
    | 'archive'
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  actorType: 'user' | 'agent' | 'system'
  actorId: string | null
  actorName: string
  title: string
  detail: string | null
  taskId: string
  runId: string | null
  stepId: string | null
  target: 'task' | 'step' | 'approval' | 'andon' | 'verification' | 'deliverable' | null
  createdAt: string
}
```

## 4. 投影规则

实现纯函数 `projectRunEventToActivity`。至少映射：

| Event | Activity |
|---|---|
| task-created | 你创建了任务 |
| run-started | Agent/系统开始执行 |
| paused-by-user | 你暂停了任务 |
| resumed-by-user | 你继续了任务 |
| brief-edited | 你更新了 Brief |
| refine-requested | 你提出了修改 |
| step-started | Agent 正在执行某步骤 |
| step-completed | 完成某步骤 |
| step-error | 某步骤失败，将重试或停线 |
| approval-requested | 请求批准 |
| approval-resolved | 你批准/拒绝了动作 |
| andon-opened | 任务需要处理 |
| andon-resolved | 你选择重试/取消 |
| budget-warning | 预算接近上限 |
| budget-exhausted | 预算不足，任务停线 |
| model-fallback | 模型切换到备选 |
| verification | 验证通过/失败 |
| verification-blocked | 验证门拦截交付 |
| delivered | 交付物已生成 |
| events-archived | 历史活动已压缩 |

不直接展示：

- 原始模型输入；
- Tool input JSON；
- 私有路径；
- 完整异常堆栈；
- Evidence 原文；
- 可能包含密钥的 payload。

## 5. 用户与 Agent actor

用户动作：

- task-created
- paused/resumed/stopped/archived
- brief-edited
- refine-requested
- approval-resolved
- andon-resolved
- budget-updated

Agent 动作：

- run-started
- step-started/completed/error
- model/tool/verification/delivered

系统动作：

- status-changed
- recovered-after-restart
- events-archived
- 无法确认 actor 的旧事件

## 6. RPC

新增：

```ts
{ method: 'getTaskActivity'; taskId: string; limit?: number; beforeSeq?: number }
```

规则：

- 默认 50 条；
- limit 1–200；
- 按时间倒序查询、返回时按时间正序展示；
- 支持 `beforeSeq` 分页；
- 归档 Task 只返回 `events-archived` 摘要和保留的热事件；
- 不从 archive 表恢复完整 Feed。

## 7. 预计修改文件

- `src/runtime/db.ts`
- `src/runtime/ledger.ts`
- `src/runtime/api.ts`
- `src/runtime/views.ts` 或新增 `src/runtime/activity.ts`
- `src/shared/types.ts`
- `src/shared/activity.ts`（建议新增纯函数）
- `tests/activity.test.ts`
- `tests/db.test.ts`
- 相关 runtime 测试

## 8. 实施步骤

1. 先写 15 类事件映射失败测试；
2. 增加 actor 字段迁移；
3. 扩展 archive 搬运，保证 actor 字段不丢；
4. 扩展 `appendEvent`；
5. 给明确调用点补 actor；
6. 实现类型化投影；
7. 实现分页 RPC；
8. 用旧数据验证无 actor 回退；
9. 确认 Run Inspector 原始事件不回退。

## 9. 测试要求

- 每类事件标题、tone、target；
- payload 缺字段时安全降级；
- payload 含 API Key 样式内容不进入输出；
- 用户/Agent/System actor；
- 旧事件 actor 为空；
- Agent 改名后事件使用 snapshot；
- limit 边界；
- beforeSeq 分页无重复；
- 归档搬运 actor 不丢；
- 归档摘要不伪造明细；
- 不修改事件全序和 append-only 契约。

## 10. 明确不做

- 不建 Activity 表；
- 不做评论；
- 不做跨 Task 全局 Activity；
- 不解析任意 JSON 为 UI；
- 不恢复已归档的完整事件流。

## 11. 完成判据

任何 Activity 文案都能追溯到一个真实 RunEvent；任何无法确认的 actor 都明确显示为系统，而不是猜测。

## 12. 实测结果（2026-07-23）

- 已完成 v11 actor 元数据、追加式账本兼容、人类可读 Activity 投影、分页和归档摘要；证据见审计记录 AL。
- 30 个 Activity 单测覆盖事件映射、actor 快照、畸形 payload、分页与归档；T10 进一步把 Run Inspector payload 改为安全字段白名单，原始敏感正文只保留在 SQLite 技术账本。
- 未测边界：不提供跨 Task 全局 Activity，也不从归档表恢复完整历史事件流。
