---
guardrail_id: migration
status: active
last_verified: 2026-07-29
applies_to: sqlite-schema, migrations, indexes, historical-fixtures, recovery
---

# Migration 护栏

## 1. 词汇表

| 术语 | 定义 |
|---|---|
| SCHEMA | 新数据库启动时执行的最新表、索引和触发器定义。 |
| migration | 使既有数据库从较低 `schema_version` 前进到更高版本的有序变更。 |
| schema_version | `metadata` 中记录的已应用版本；当前代码基线为 v13。 |
| synthetic fixture | 测试按历史列结构重建的旧库，不是来自真实历史产物。 |
| real historical fixture | 由旧版 LeanClaw 实际生成、离线脱敏并经授权保存的测试数据库。 |
| conservative backfill | 不为未知历史事实编造值；优先 nullable、可证明默认值或运行时回退。 |
| isolated data root | 测试专用临时 `LEANCLAW_DATA_DIR` / HOME，禁止接触真实用户数据库。 |

## 2. 不变量

| 不变量 | 约束 |
|---|---|
| 版本只前进 | migration 版本严格递增且唯一；不得重编号或静默改写已经发布的历史迁移。 |
| 新库与旧库同构 | SCHEMA 负责新库最终结构，migration 负责既有表补齐；两条路径最终必须满足同一关键约束和索引。 |
| 批次事务化 | 所有 pending migration 在一个事务中执行；每个 `up` 成功后才更新版本，失败必须整体回滚。 |
| 迁移可重复启动 | SQL 使用列存在检查、`IF NOT EXISTS` 等安全方式；升级完成后再次启动不得重复改坏数据。 |
| 历史事实不伪造 | 新 actor/source 等字段若无法从旧数据证明，应保持 `NULL` 或安全回退，不批量编造身份。 |
| 数据先于清理 | 破坏性列/表变更需要独立迁移方案、备份、校验和回滚；不得以“重建数据库”作为用户恢复方案。 |
| 测试与用户数据隔离 | 迁移测试只用临时 data root 和受控 fixture；读取真实用户库必须另行授权、复制、脱敏且离线。 |
| fixture 来源可追溯 | synthetic 与 real fixture 必须明确标注，不能把按结构重建的测试库当成真实历史证据。 |
| 启动顺序稳定 | 数据库初始化和迁移完成后，才执行重启恢复与 Runtime 服务逻辑。 |
| 约束声明不等于已启用 | SQLite 外键声明只有在连接启用 `PRAGMA foreign_keys = ON` 后才强制；当前不能宣称外键已被运行时执行。 |
| 新版本库必须失败关闭 | 应用版本低于数据库版本时不得静默继续；当前实现尚未满足，修改迁移框架时必须优先补齐。 |

## 3. 关键文件与责任

| 文件 | 责任 |
|---|---|
| [`src/runtime/db.ts`](../../src/runtime/db.ts) | 最新 SCHEMA、v1–v13 migration、排序校验、事务应用和数据库初始化。 |
| [`src/runtime/index.ts`](../../src/runtime/index.ts) | 选择 data root，先初始化数据库再执行恢复。 |
| [`src/main/index.ts`](../../src/main/index.ts) | E2E/测试可通过 `LEANCLAW_DATA_DIR` 隔离 Electron userData。 |
| [`tests/db.test.ts`](../../tests/db.test.ts) | migration 顺序、连续性、幂等、v11/v12 历史值与 v13 索引。 |
| [`tests/e2e/phase2-migration.spec.ts`](../../tests/e2e/phase2-migration.spec.ts) | synthetic v8 → v13 升级、数据保留、索引和重启主路径。 |
| [`docs/current-baseline.md`](../current-baseline.md) | 当前 Schema 和验证证据的唯一简明入口。 |

## 4. 修改检查表

- [ ] 分配新的、唯一且严格递增的版本号，不改写既有 migration 的历史语义。
- [ ] 同时更新最新 SCHEMA、migration、版本连续性测试和当前基线。
- [ ] 新列选择 nullable 或可证明安全的默认值；写清历史数据如何解释。
- [ ] 使用 `hasColumn`、`IF NOT EXISTS` 等保证升级后再次启动安全。
- [ ] 验证事务失败时 schema、数据和 `schema_version` 全部回滚。
- [ ] 验证新库、N-1、受支持最旧版本及重复启动。
- [ ] 对表/列/索引变更比较迁移前后行数、关键值、约束和查询计划。
- [ ] 测试设置临时 HOME/data root，并让越界读取失败。
- [ ] real fixture 必须记录生成版本、脱敏方法、授权、checksum 和禁止包含的隐私字段。
- [ ] 不在未备份的真实用户数据库上试跑迁移。
- [ ] 明确回滚是代码回退、数据库备份恢复还是向前修复；不能假设降级 migration 存在。

## 5. 常见踩坑

1. **`CREATE TABLE IF NOT EXISTS` 不会给旧表补列。** 新库 SCHEMA 通过不代表升级路径通过。
2. **synthetic v8 不是 real fixture。** 当前 E2E 会按历史列定义重建 v8 表，无法证明未知索引、约束和真实数据组合可迁移。
3. **当前 synthetic v8 降格不彻底。** 它只重建四张表，部分 v13 索引会从最初的新库残留，因此最终“索引存在”不能独立证明 v13 migration 创建了全部索引。
4. **开发态迁移与 packaged migration 是两份证据。** 当前旧库升级由 `out/main/index.js` 执行，packaged smoke 只覆盖空库；不能合并表述成“最终产物旧库升级已验证”。
5. **高版本数据库当前不会失败关闭。** `pendingMigrations` 对高于当前版本的数据库返回空集合，旧程序可能继续打开新库。
6. **幂等测试不等于失败回滚测试。** 重复执行成功不能证明中途异常会整体回滚；SCHEMA 与 version=0 初始化也位于 migration transaction 之外。
7. **`schema_version` 的单行真实性未由约束保证。** 当前读取 `LIMIT 1`、更新全部行，缺少唯一性和范围约束。
8. **nullable 历史字段不是缺陷。** 无法证明 actor/source 时，`NULL` 比伪造更可信。
9. **声明 Foreign Key 不等于运行时强制。** 当前初始化未确认启用 `PRAGMA foreign_keys = ON`。
10. **版本号通过不等于数据语义正确。** 需要行数、关键字段、完整 schema fingerprint、索引和实际查询路径证据。
11. **测试隔离不是一句约定。** 必须显式使用临时 data root，不能对真实 `~/.leanclaw` 做读取、复制或 hash 来声称“未访问”。

## 6. 测试覆盖映射

| 测试 | 已覆盖 | 当前缺口 |
|---|---|---|
| [`tests/db.test.ts`](../../tests/db.test.ts) | 版本排序、重复/非递增拒绝、连续 v1–v13、v13 索引与幂等、v11/v12 不伪造历史值 | 缺 migration 中途失败的整体回滚；缺新库与升级库完整 schema 对拍 |
| [`tests/e2e/phase2-migration.spec.ts`](../../tests/e2e/phase2-migration.spec.ts) | 开发态 synthetic v8 → v13、数据计数、NULL 历史字段、索引/查询计划、升级后运行和重启 | 降格前创建的部分 v13 索引仍存在；不是 old-binary/real fixture；不是 packaged binary |
| [`tests/phase2-packaged-smoke.mjs`](../../tests/phase2-packaged-smoke.mjs) | 最终包在空 data root 的主旅程 | 未预置旧数据库，不证明 packaged migration |

新增 migration 的最低证据集：

1. 空目录创建最新数据库；
2. N-1 和受支持最旧 fixture 升级；
3. 同一数据库重复启动；
4. 固定注入点的事务失败与回滚；
5. 行数、关键字段、版本、索引和查询计划断言；
6. 新装与升级后的完整 schema fingerprint 对拍；
7. 至少一个升级后真实 Task 主路径；
8. 面向发布的迁移必须由最终 packaged binary 执行；
9. 当 old-binary/real fixture 尚不存在时，明确把结论降级为“开发态 synthetic fixture 通过”。

## 7. 决策日志

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-07-29 | 当前 Schema 基线记录为 v13 | 已由当前代码与 T00 验证确认。 |
| 2026-07-29 | 明确标记现有 v8 E2E 为 synthetic fixture | 它通过测试代码重建旧表，不能冒充真实历史数据库。 |
| 2026-07-29 | real fixture 采用 deny-by-construction 隔离和独立授权 | “未修改”或 hash 不足以证明未读取、未复制真实用户数据。 |
| 2026-07-29 | 外键执行状态保持 Unknown/未启用声明 | 当前未发现初始化连接显式开启 `PRAGMA foreign_keys = ON`。 |
| 2026-07-29 | 将开发态迁移与 packaged migration 分开陈述 | 两条测试当前覆盖不同 data root 和启动入口，证据不能合并。 |
| 2026-07-29 | 将高版本库 fail-closed 与 schema ledger 约束列为未满足不变量 | 当前实现会对高版本返回无待迁移项，且版本表未保证恰好一行。 |
