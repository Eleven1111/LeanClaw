# T08：Need You Inbox

> 状态：工程完成  
> 优先级：P0  
> 依赖：T03  
> 阻塞：T10

## 1. 目标

把跨任务的 Approval、Andon、验证失败、Blocked 和预算停线聚合成一个可直接处理的行动收件箱。

## 2. 数据契约

建议 `NeedYouItemView`：

```ts
interface NeedYouItemView {
  id: string
  type: 'approval' | 'andon' | 'verification_failed' | 'blocked' | 'budget'
  urgency: 1 | 2 | 3
  taskId: string
  taskGoal: string
  agentName: string | null
  title: string
  detail: string
  createdAt: string
  primaryAction:
    | 'approve'
    | 'retry'
    | 'retry_checkpoint'
    | 'add_budget'
    | 'open_task'
  secondaryActions: Array<'reject' | 'cancel' | 'open_task'>
  sourceId: string | null
}
```

新增 RPC：

```ts
{ method: 'listNeedYouItems' }
```

只做查询投影，不建 inbox 表。

## 3. 排序

建议：

1. Blocked / verification failed；
2. Approval / Andon / budget；
3. 同等级按最早发生时间。

排序必须是纯函数并有测试。

## 4. 页面

侧边栏工作区组新增“需要你处理”，显示实时数量。

列表卡片显示：

- 类型和紧迫度；
- Task；
- Agent；
- 原因；
- 等待时长；
- 主要动作；
- 次要动作；
- 查看任务。

Home 的“需要你处理”改为复用同一数据和组件的前 3 项。

## 5. 动作复用

- approval：现有 `resolveApproval`；
- andon：现有 `resolveAndon`；
- verification failed：现有 `retryFromCheckpoint` / `stopTask`；
- budget：现有 `updateBudget`，成功后由现有恢复语义继续；
- blocked：进入 Task，不能伪造通用恢复；
- open task：现有 Task 路由。

不得新增“直接设为 Running/Delivered”的 RPC。

## 6. 实时更新

- Task push 后刷新待办；
- 动作成功后立即移除或变更；
- 动作失败时保留原项并显示错误；
- 多次点击必须被服务端状态检查拒绝或前端禁用；
- 处理一个 Task 不影响其他 Task 的待办。

## 7. 预计修改文件

- `src/shared/types.ts`
- `src/shared/need-you.ts`（新增排序/投影纯函数）
- `src/runtime/api.ts`
- `src/runtime/views.ts` 或新增 `src/runtime/need-you.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/NeedYou.tsx`（新增）
- `src/renderer/src/Home.tsx`
- `src/renderer/src/styles.css`
- `tests/need-you.test.ts`
- `tests/e2e/need-you.spec.ts`（新增）

## 8. 实施步骤

1. 先写投影和排序失败测试；
2. 实现聚合 SQL/RPC；
3. 增加导航、计数和空状态；
4. 实现各类型卡片；
5. 复用现有动作；
6. Home 复用前 3 项；
7. 覆盖 push 和竞态；
8. 做键盘、读屏和 900×600 检查。

## 9. 测试要求

- 每种 item 类型；
- 排序；
- 侧边栏计数；
- approve/reject；
- Andon retry/cancel；
- verification checkpoint retry；
- budget 输入验证；
- Blocked 只进入 Task；
- 两个任务同时待办；
- 已处理 item 消失；
- 过期动作被服务端拒绝；
- Home 与 Inbox 使用相同结果；
- 无 console/page error。

## 10. 明确不做

- 不做已读/未读；
- 不做通知归档；
- 不做邮件或推送；
- 不做批量批准；
- 不做跨设备同步；
- 不让 Blocked 统一显示一个虚假“恢复”按钮。

## 11. 完成判据

所有真正需要用户决定的事项都能在一个页面看到；每个主要动作都走现有安全链，并在处理后可靠退出列表。

## 12. 实测结果（2026-07-23）

- 已完成 Approval、Andon、Verification、Blocked、Budget 五类投影、排序、计数、Home 复用及原安全链动作；证据见审计记录 AP。
- T10 四类异常逐一核对 Activity、Need You、Runtime 与取消/继续结果；独立审查发现并修复 Approval detail 的完整目录泄露，最终 API 与 DOM 哨兵回归通过。
- 未测边界：不做已读、批量批准、邮件/推送或跨设备同步；Blocked 不伪造通用恢复动作。
