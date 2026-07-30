---
guardrail_id: migration
status: active
last_verified: 2026-07-30
applies_to: sqlite-schema, migrations, indexes, historical-fixtures, recovery
---

# Migration 护栏

## 1. 词汇表

| 术语 | 定义 |
|---|---|
| SCHEMA | 新数据库启动时执行的最新表、索引和触发器定义。 |
| migration | 使既有数据库从较低 `schema_version` 前进到更高版本的有序变更。 |
| schema_version | `metadata` 中记录的已应用版本；当前代码基线为 v13。 |
| synthetic historical-schema fixture | 测试按历史列结构重建的旧库，不是来自真实历史产物。 |
| synthetic old-binary fixture | 表结构由旧版程序自己的 `initDb()` 创建、数据行为公开合成常量的旧库。 |
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
| 新版本库必须失败关闭 | 应用版本低于数据库版本时不得静默继续。由 `pendingMigrations()` 抛 `MigrationError('schema-too-new')` 满足。 |
| 版本台账恰好一行 | `schema_version` 必须恰好一行非负整数；多行、文本、负数、小数在读取时一律拒绝继续。 |
| SCHEMA 不等于最新结构 | 最新结构 = SCHEMA + v1–v13 全部迁移。只执行 SCHEMA 得到的库是不可用的（如 `tasks.schedule_id` 只由 v7 添加）。 |
| 失败不发布半成品 | `initDb()` 只在迁移成功后发布模块级连接与 data dir；失败时关闭连接并抛出，`getDb()` 不得拿到被拒绝的数据库。 |
| 未知对象不得删除 | 迁移不得删除或改写当前代码不认识但合法存在的表、索引与触发器。 |

## 3. 关键文件与责任

| 文件 | 责任 |
|---|---|
| [`src/runtime/db.ts`](../../src/runtime/db.ts) | 最新 SCHEMA、v1–v13 migration、排序校验、事务应用和数据库初始化。 |
| [`src/runtime/index.ts`](../../src/runtime/index.ts) | 选择 data root，先初始化数据库再执行恢复。 |
| [`src/main/index.ts`](../../src/main/index.ts) | E2E/测试可通过 `LEANCLAW_DATA_DIR` 隔离 Electron userData。 |
| [`tests/db.test.ts`](../../tests/db.test.ts) | migration 顺序、连续性、幂等、v11/v12 历史值、v13 索引与版本台账校验（mock 数据库）。 |
| [`tests/migration-evidence.mjs`](../../tests/migration-evidence.mjs) | 真实 SQLite 证据入口：建隔离根、打包被测源码、在 Electron 下运行场景集。 |
| [`tests/migration-evidence-scenarios.cjs`](../../tests/migration-evidence-scenarios.cjs) | 13 个真实 SQLite 场景：升级、指纹对拍、未知对象、重复启动、失败关闭、事务回滚。 |
| [`tests/fixtures/migrations/v8-old-binary/`](../../tests/fixtures/migrations/v8-old-binary/README.md) | old-binary v8 fixture、生成脚本与 manifest。 |
| [`tests/e2e/t06-fixture-migration.spec.ts`](../../tests/e2e/t06-fixture-migration.spec.ts) | 开发态 Electron 用 old-binary fixture 升级，并跑迁移后真实 Task 主路径。 |
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
4. **开发态迁移与 packaged migration 是两份证据。** 二者现在都有（开发态见 `t06-fixture-migration.spec.ts`，packaged 见 `npm run verify:packaged`），但仍分别陈述：packaged 证据依赖本机重新打包，每次引用都要重跑，不能用开发态结果替代。
5. **高版本数据库必须失败关闭（T06 已修）。** 旧行为是 `pendingMigrations` 对更高版本返回空集合，旧程序会继续打开新库；现在抛 `schema-too-new`。
6. **幂等测试不等于失败回滚测试。** 重复执行成功不能证明中途异常会整体回滚。T06 起 bootstrap 写入与全部 pending migration 同处一个事务，并有固定注入点的回滚证据。
7. **`schema_version` 的单行性只由读取时校验强制。** 没有数据库级唯一/CHECK 约束（那需要新迁移）；`readSchemaVersion()` 拒绝多行、文本、负数与小数。
8. **只跑 SCHEMA 得不到可用的最新库。** `tasks.schedule_id` 等列只由迁移添加；构造 N-1 夹具必须是 SCHEMA + v1–v(N-1)，否则 v13 会报 `no such column`。
9. **Node 下不能用真实 SQLite 做单测。** `better-sqlite3` 按 Electron ABI 编译，Vitest 只能 mock；真实 SQLite 断言走 `npm run migration:evidence`。
10. **nullable 历史字段不是缺陷。** 无法证明 actor/source 时，`NULL` 比伪造更可信。
11. **声明 Foreign Key 不等于运行时强制。** 当前初始化未启用 `PRAGMA foreign_keys = ON`。
12. **版本号通过不等于数据语义正确。** 需要行数、关键字段、完整 schema fingerprint、索引和实际查询路径证据。
13. **测试隔离不是一句约定。** 必须显式使用临时 data root，不能对真实 `~/.leanclaw` 做读取、复制或 hash 来声称“未访问”。
14. **未知对象"还在"不等于"还能用"。** 升级后要同时验证它保留且仍然生效（T06 的未知触发器在新 Task 更新时仍然写入审计表）。

## 6. 测试覆盖映射

| 测试 | 已覆盖 | 当前缺口 |
|---|---|---|
| [`tests/db.test.ts`](../../tests/db.test.ts) | 版本排序、重复/非递增拒绝、连续 v1–v13、v13 索引与幂等、v11/v12 不伪造历史值、`schema-too-new` 与版本台账校验 | 全部基于 mock 数据库，不触达真实 SQLite 行为 |
| [`tests/migration-evidence-scenarios.cjs`](../../tests/migration-evidence-scenarios.cjs) | 真实 SQLite：空库→v13、v12→v13、old-binary v8→v13、新库/升级库结构指纹对拍、未知对象保持、连续三次启动幂等、v14 拒绝、台账异常拒绝、0 行 bootstrap、固定注入点整体回滚、回滚后向前恢复 | 只覆盖 v8/v12/空库三个起点，未穷举 v1–v11 每个中间版本；不是 packaged binary |
| [`tests/e2e/t06-fixture-migration.spec.ts`](../../tests/e2e/t06-fixture-migration.spec.ts) | 开发态 Electron：old-binary v8 → v13、行数与未知对象保持、索引与查询计划、迁移后真实 Task 主路径、重启 | 开发态入口 `out/main/index.js`，不是最终 `.app` |
| [`tests/e2e/phase2-migration.spec.ts`](../../tests/e2e/phase2-migration.spec.ts) | 开发态 historical-schema v8 → v13、数据计数、NULL 历史字段、索引/查询计划、归档与重启 | 降格前创建的部分 v13 索引仍存在；不是 old-binary fixture；不是 packaged binary |
| [`tests/phase2-packaged-smoke.mjs`](../../tests/phase2-packaged-smoke.mjs) | 最终包在指定 data root 的主旅程 | 自身不预置旧库；packaged migration 由 `verify:packaged` 组合完成 |
| [`tests/packaged-verify.mjs`](../../tests/packaged-verify.mjs) | **packaged migration**：T06 old-binary v8 fixture 由最终 `.app` 升级到 v13，关键值与未知对象保持，升级后再跑完整 Journey A | 只覆盖 v8 一个起点与 arm64 ad-hoc 包；不进 CI，需本机重跑 |

新增 migration 的最低证据集：

1. 空目录创建最新数据库；
2. N-1 和受支持最旧 fixture 升级；
3. 同一数据库重复启动；
4. 固定注入点的事务失败与回滚；
5. 行数、关键字段、版本、索引和查询计划断言；
6. 新装与升级后的完整 schema fingerprint 对拍；
7. 至少一个升级后真实 Task 主路径；
8. 面向发布的迁移必须由最终 packaged binary 执行（`npm run verify:packaged`）；
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
| 2026-07-30 | 高版本库与版本台账异常改为失败关闭（T06） | RED 证据显示旧实现对 v14 库、多行/文本/负数/小数台账都不抛错，直接继续打开。 |
| 2026-07-30 | 版本台账单行性只在读取时校验，不加数据库约束 | 加唯一/CHECK 约束需要新迁移，超出 T06「不新增业务 Schema」的边界。 |
| 2026-07-30 | 真实 SQLite 证据独立成 `npm run migration:evidence` | `better-sqlite3` 按 Electron ABI 编译，Vitest 无法加载，mock 无法证明事务回滚与结构对拍。 |
| 2026-07-30 | v8 fixture 采用 old-binary 生成，保留 historical-schema E2E | 表结构由锚点提交自己的 `initDb()` 创建，可独立证明 13 个索引来自 v13 迁移；旧用例保留其归档与 UI 断言价值。 |
| 2026-07-30 | packaged migration 用同一个 T06 fixture 验证，不另造夹具（T08） | 同一 checksum 让开发态与最终产物两份证据可以互相对照，差异只剩执行入口。 |
| 2026-07-30 | 不启用 `PRAGMA foreign_keys = ON` | RED 证据未表明它是 T06 必需；启用属于语义迁移，需要独立任务与独立证据。 |
