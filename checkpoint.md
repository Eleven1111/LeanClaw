# checkpoint — P1 / T07 已知故障路径补洞

> 分支：`codex/t07-fault-path-coverage`（基于 `main@7b62f68`）
>
> 更新时间：2026-07-30（T06、T07 已关闭并合并；T08 工程完成，待远端门禁）

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

## T07 阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| A | 双路径对拍 harness（RED：`lastDoneLabel` 未脱敏） | done |
| B | 修复列表投影脱敏 | done — `src/runtime/views.ts` |
| C | Automation 真实 Runtime DB 故障注入 E2E | done — `tests/e2e/t07-automation-fault.spec.ts` |
| D | 失败可见性（`lastTriggerFailed` + 卡片文案） | done — `src/shared/schedule.ts`、`api.ts`、`Automations.tsx` |
| E | 验证矩阵 | done — static 22/22、unit 367/367、migration 13/13、parity 5/5、E2E 46/46 |
| F | 文档 + PR | done — [PR #8](https://github.com/Eleven1111/LeanClaw/pull/8) 两个 Required Checks 全绿并 squash merge 为 `main@16809b9` |

T07 的裁决：「认领先推进、失败不回滚 `next_run_at`」保持不变（回退会导致热重试），改为在 UI 上显式报告触发失败。

## T08 阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| A | 受控 launcher `tests/packaged-verify.mjs` | done |
| B | `rm -rf release && npm run dist:mac` 重新生成产物 | done |
| C | 台账 10/10（含 packaged migration） | done |
| D | 回归：static/typecheck/unit/两个证据 harness/smoke/E2E | done |
| E | 文档 + PR | in_progress |

当前产物：DMG `9006f9b1…`、ZIP `b98da328…`。状态 `Packaged smoke pass`，不是 `Release ready`/`Shipped`。
