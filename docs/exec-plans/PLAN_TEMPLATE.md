---
plan_id: replace-after-approval
status: replace-after-approval
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
current_phase: P0
current_task: T00
engineering_status: replace-after-approval
user_approval: replace-after-approval
---

# 计划名称

> 用户可见结果：
>
> 明确非目标：

## 1. 问题与证据

- 用户问题：
- 当前观察：
- 推断：
- 未知：
- 被否决方案及原因：

## 2. 依赖与风险

- 前置依赖：
- 数据/Schema/API 影响：
- 隐私与安全边界：
- 回滚路径：

## 3. 阶段与任务

| ID | 任务 | 依赖 | 产物 | 验收标准 | 状态 |
|---|---|---|---|---|---|
| T00 |  | 无 |  |  | 待开始 |

## 4. 检查节点

- Code complete：
- Tests pass：
- Smoke pass：
- Review pass：
- Engineering accepted：
- User accepted：
- Release ready：
- Shipped：

阶段收口时复制 [STAGE_ACCEPTANCE_TEMPLATE.md](./STAGE_ACCEPTANCE_TEMPLATE.md) 生成验收记录。以上状态分别举证，不能互相替代。

## 5. Smoke Ledger

| 时间 | 场景 ID | 产物 / commit | 环境 | Fixture / 凭据来源 | 操作 | 预期 | 实际 | 结果 | 证据 | 未测边界 |
|---|---|---|---|---|---|---|---|---|---|---|

随机故障测试记录 seed、注入点和预期结果；阶段门禁优先使用固定、可复现的故障矩阵。

## 6. 未测边界与回滚

| ID | 未测内容 | 原因 | 潜在影响 | 补证条件 |
|---|---|---|---|---|
| U-01 |  |  |  |  |

- 回滚触发条件：
- 回滚范围：
- 回滚方法：
- 数据保护：
- 回滚后验证：

## 7. 决策日志

- YYYY-MM-DD：决策、约束与理由。

## 8. 归档信息

> Active 期间保持为空；移入 completed/deferred/superseded 时填写。

- 归档原因：
- 归档日期：
- 重启条件或替代计划：
