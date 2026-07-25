# T01：Agent 领域模型与数据库迁移

> 状态：工程完成  
> 优先级：P0  
> 依赖：无  
> 阻塞：T02、T03

## 1. 目标

建立最小、可迁移、可审计的 Agent 领域对象和 CRUD RPC，为 UI 与任务绑定提供稳定契约。本任务不修改任务执行行为。

## 2. 范围

### 数据库

新增迁移：

- v9：创建 `agents`；
- v10：给 `tasks` 增加 `agent_id`、`agent_name_snapshot`、`agent_instructions_snapshot`，给 `schedules` 增加 `agent_id`。

建议 `agents` Schema：

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  default_recipe_id TEXT,
  default_budget_usd REAL,
  max_concurrent_runs INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 共享类型

新增：

- `AgentView`
- `AgentUpsertInput`
- `listAgents`
- `saveAgent`
- `setAgentEnabled`
- `deleteAgent`

### Runtime API

实现：

- 名称 trim、唯一、1–40 字符；
- description ≤ 240；
- instructions ≤ 10,000；
- default Recipe 必须存在；
- budget 为空或正数；
- max concurrent runs 为 1–3；
- 被 Task 或 Schedule 引用时禁止物理删除；
- 仍被启用中的 Schedule 引用时禁止停用；
- 停用只影响新选择，不影响历史。

## 3. 明确不做

- 不做 Agent UI；
- 不注入 Prompt；
- 不做 Agent 级 Provider、模型或工具权限；
- 不做头像文件；
- 不做在线/离线状态；
- 不生成默认种子 Agent。

## 4. 预计修改文件

- `src/runtime/db.ts`
- `src/runtime/api.ts`
- `src/shared/types.ts`
- `src/shared/agent.ts`（建议新增纯函数）
- `tests/agent.test.ts`
- `tests/db.test.ts`

如发现 API 文件继续膨胀，可新增 `src/runtime/agents.ts`，但不得借机重构无关 RPC。

## 5. 实施步骤

1. 为字段规范化、范围和引用删除保护写失败单测；
2. 增加 `AgentView` 和 RPC 判别联合；
3. 同时更新新装数据库的基准 `SCHEMA` 与 v9/v10 增量迁移；
4. 验证新数据库与 v8 数据库升级结果一致；
5. 实现 list/save/enable/delete；
6. 只读验证 Agent 不改变现有 Task 行为；
7. 补迁移和 RPC 单测；
8. 更新审计记录。

## 6. 测试要求

至少覆盖：

- 名称 trim、空名、超长、重复；
- description/instructions 长度边界；
- 非法 Recipe；
- 非法预算；
- 并发 0、1、3、4；
- 创建、更新、停用、重新启用；
- 启用中的 Schedule 引用时停用失败；
- Schedule 暂停后 Agent 可停用；
- 无引用删除成功；
- Task 引用后删除失败；
- Schedule 引用后删除失败；
- v8 数据库升级后旧 Task 的 Agent 字段为空；
- migration 版本严格递增。

## 7. 验收步骤

1. 使用隔离数据目录初始化新数据库；
2. 通过 RPC 创建 Agent；
3. 更新 Agent 并确认 `updated_at` 变化；
4. 停用后列表仍返回且 `enabled=false`；
5. 无引用时删除成功；
6. 人工制造 Task/Schedule 引用后删除被拒；
7. 旧数据库升级后原任务和 Schedule 数量不变。

## 8. 完成判据

- Agent 数据契约稳定；
- v8 → v10 升级可复现；
- 旧数据零丢失；
- 不改变现有任务执行；
- 无新增依赖；
- 全量现有测试不回退。

## 9. 回滚

代码回滚不删除已迁移列或表；旧版本应用应忽略新增结构。禁止写降级迁移删除 Agent 数据。

## 10. 实测结果（2026-07-23）

- 已完成 v9/v10 Agent 迁移、CRUD RPC、引用保护和旧任务兼容；完整证据见 `docs/审计与交接.md` 记录 AI。
- T10 迁移 E2E 从 v8 表结构启动，确认旧 Task/Run/Artifact/Evidence/Event/Schedule 数量不变，升级到当前 Schema v12 后可归档、创建 Agent、交付并重启。
- 未测边界：仓库没有独立保存的生产 v8 二进制副本；T10 使用由当前库按历史列定义重建的 v8 fixture，因此不能覆盖未知的外部手改索引或约束。
