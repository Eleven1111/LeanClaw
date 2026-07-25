# T09：Automation Center

> 状态：工程完成  
> 优先级：P1  
> 依赖：T03  
> 阻塞：T10

## 1. 目标

把现有 Schedule 从 Home 内嵌管理区升级为独立 Automation Center，补齐最近结果、运行历史和“立即运行”，同时继续使用同一任务安全链。

## 2. 产品语义

- 用户可见名称使用“自动化”；
- 内部继续使用 Schedule；
- 每次定时或手动触发都创建普通 Task；
- Task 通过 `schedule_id` 回到 Automation；
- 绑定 Agent 时使用 T03 的规则；
- 不新建 Automation Run History 表。

## 3. 页面结构

### 列表

每张 Automation 卡：

- 名称；
- 启用/暂停；
- Agent；
- Recipe；
- 频率和时区语义；
- 下次运行；
- 最近一次结果；
- 最近一次时间；
- 立即运行；
- 编辑；
- 删除。

### 详情/展开区

- 最近五次 Task；
- 每次状态、耗时、成本、交付物；
- 点击进入 Task；
- 错误时说明是否已进入 Need You。

## 4. 新增 RPC

```ts
{ method: 'triggerScheduleNow'; scheduleId: string }
{ method: 'getScheduleHistory'; scheduleId: string; limit?: number }
```

`triggerScheduleNow` 必须：

1. 读取 Schedule；
2. 验证其仍存在；
3. 创建普通 Task；
4. 写入 schedule_id；
5. 启动 Task；
6. 经过 WIP、Agent 并发、预算、Approval、Andon、Verification；
7. 不修改 `next_run_at`；
8. 记录触发来源为 manual。

为区分 schedule/manual，可给 Task 增加 `schedule_trigger_source` 可选字段，或在 `task-created` payload 中记录；优先选择最小 Schema 变化。

## 5. 失败语义

- 触发 RPC 失败：页面显示错误，不创建半成品 Task；
- Task 执行失败：按现有状态进入 Need You；
- 启用中的 Automation 会阻止其 Agent 被停用；已停用 Agent 关联的暂停 Automation 不能重新启用；
- Recipe 被引用时现有删除保护继续有效；
- 删除 Automation 不删除历史 Task；
- 暂停不取消已创建 Task。

## 6. Home 调整

- Home 不再承载完整 Schedule 列表；
- 创建任务区域保留“保存为自动化”快捷入口；
- 保存后提供“查看自动化”；
- 已有 Schedule 管理迁移到新页面；
- 不能破坏原创建任务流程。

## 7. 预计修改文件

- `src/shared/types.ts`
- `src/runtime/api.ts`
- `src/runtime/schedules.ts`
- `src/runtime/views.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/Automations.tsx`（新增）
- `src/renderer/src/Schedules.tsx`（收敛为创建入口或拆分表单）
- `src/renderer/src/Home.tsx`
- `src/renderer/src/styles.css`
- `tests/schedule.test.ts`
- `tests/e2e/automations.spec.ts`（新增）
- `src/runtime/smoke.ts`

## 8. 实施步骤

1. 先写“立即运行不改变 next_run_at”和历史查询测试；
2. 实现窄 RPC；
3. 实现自动化页面和导航；
4. 迁移 Home 管理入口；
5. 接 Agent；
6. 接 Need You 失败表现；
7. 增加 s18；
8. 做旧 Schedule 数据升级/显示验证。

## 9. 新增冒烟

建议 s18：

1. 创建 Automation；
2. 记录原 `next_run_at`；
3. 手动触发一次；
4. Task 通过正常链路交付；
5. 断言 `schedule_id`；
6. 断言 `next_run_at` 未改变；
7. 断言历史返回该 Task；
8. 定时到期再触发一次，断言两次历史来源可区分；
9. 断言无重复认领。

## 10. E2E

- 列表空状态；
- 从 Home 保存自动化；
- 启用/暂停；
- 编辑；
- 立即运行；
- 最近五次历史；
- 进入 Task；
- Agent 停用与 Automation 启用互锁提示；
- 删除不删除历史 Task；
- 失败进入 Need You；
- 应用重启后仍存在。

## 11. 明确不做

- 不做 cron 自由输入；
- 不做 webhook；
- 不做秒级调度；
- 不做 missed-run 批量补跑；
- 不做并行 fan-out；
- 不做自动重试策略 UI；
- 不做跨机器调度。

## 12. 完成判据

用户能判断每个自动化“是否启用、何时再跑、上次是否成功、如何立即验证”，且手动和定时触发都不绕过任何安全门。

## 13. 实测结果（2026-07-23）

- 已完成 Automation Center、立即运行、定时运行、最近五次历史、来源、Task 跳转、Agent 互锁与删除保留 Task；证据见审计记录 AQ。
- s18 最终输出 `manual=delivered`、`scheduled=delivered`、`agentBound=true`、`pauseKeptTask=true`，手动触发未改变下一次时间且重复认领被阻止。
- 未测边界：定时认领先推进时间、后创建 Task 的既有崩溃窗口仍存在；不做 cron DSL、日历、补跑、fan-out 或跨机器调度。
