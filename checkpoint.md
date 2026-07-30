# checkpoint — P1 / T06 历史数据库迁移证据

> 分支：`codex/t06-migration-evidence`（基于 `main@a1e3496`）
>
> 更新时间：2026-07-30（T06 已关闭，执行指针 T07）

## 任务边界（本任务只做这些）

- 补迁移证据 + 必要的迁移失败关闭；
- 不新增业务 Schema，不重编号已发布 v1–v13；
- 不读取真实 `~/.leanclaw`；
- 不启用 `PRAGMA foreign_keys`（除非 RED 证据证明是 T06 必需）；
- 不做 packaged migration 验证（留 T08）。

## 已确认事实

- `15831e5` 是可用 v8 锚点：migration 最高 v8、有 `package-lock.json`、`main: out/main/index.js`、`out/main/runtime.js` 在无 `parentPort` 时先 `initDb()` 再退出（exit 2）。
- 当前 `node` 下 `require('better-sqlite3')` 报 `ERR_DLOPEN_FAILED`：原生模块按 Electron ABI 编译，因此真实 SQLite 场景必须在 `ELECTRON_RUN_AS_NODE=1 electron` 下运行（沿用 `tests/runtime-smoke.mjs` 模式）。
- 当前 `SCHEMA` 不含任何 `CREATE INDEX`；全部 13 个索引只由 migration v13 创建，所以新库与升级库天然收敛于同一条索引来源。

## 阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| A | 分支 + 任务说明 | done |
| B | RED 证据（真实 SQLite harness 跑在旧实现上） | done — 13 场景 3 PASS / 10 FAIL，含 3 条行为级失败关闭缺口，原文记入 记录 AY |
| C | 可追溯 v8 old-binary fixture | done — `tests/fixtures/migrations/v8-old-binary/` |
| D | 最小迁移框架修正 | done — `src/runtime/db.ts` |
| E | 验证矩阵 | done — static 22/22、typecheck、unit 363/363、migration 13/13、build、smoke、E2E 45/45 |
| F | 文档 + PR | done — [PR #6](https://github.com/Eleven1111/LeanClaw/pull/6) 两个 Required Checks 全绿并 squash merge 为 `main@a91c39a` |

## 恢复指引

`npm run migration:evidence` 是 T06 的真实 SQLite 证据入口；`tests/e2e/t06-fixture-migration.spec.ts` 是 fixture → v13 的开发态 Journey 证据。
