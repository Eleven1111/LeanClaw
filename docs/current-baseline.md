# LeanClaw 当前可信基线

> 状态：当前事实入口
>
> 刷新日期：2026-07-30
>
> 已验证代码基线：`codex/t07-fault-path-coverage`（基于 `main@7b62f68`）；远端门禁证据见 T07 PR
>
> 维护规则：代码、Schema、测试门禁、打包方式或已知边界变化时，必须在同一任务内刷新本文

## 1. 文档定位

本文是 LeanClaw **当前状态的唯一入口**，用于回答“现在真实存在什么、验证到什么程度、还有哪些边界”。

事实优先级如下：

1. 当前代码、Manifest、Schema 和本轮可复现命令；
2. 本文记录的刷新日期与证据等级；
3. [exec-plans/README.md](./exec-plans/README.md) 指向的唯一 active 执行计划；
4. [审计与交接.md](./审计与交接.md) 中按时间追加的实现与验证记录；
5. Stage、Phase 和任务文档中的历史设计/验收快照。

历史文档不回写成当前实现说明。它们记录的是当时的目标、约束和验收证据；出现数值差异时，以当前代码和本文为准，同时保留历史原貌。

## 2. 当前产品边界

以下边界已经过 Product Phase 2 验收，下一阶段不得默认改变：

- Agent 是执行配置，不是聊天人格；
- Task 是持续验收和修改的工作目标；
- Run 是执行上下文，Step 是确定性步骤；
- Runtime 只观察和控制当前本机执行环境；
- Need You 从 Approval、Andon、验证失败和失败 Task 投影，不建平行 inbox 事实表；
- Automation 每次触发创建普通 Task，复用 WIP、预算、Approval、Andon、Verification 和交付链；
- 正常业务状态通过 Runtime 状态机迁移；创建初始 `draft` 与崩溃恢复是有事件留痕的受控例外；
- 工具必须经过 Registry、风险判断、Dry Run/Approval 和 Andon；
- Renderer 保持 sandbox、白名单投影和隐私脱敏；
- 工程完成与用户验收是两个独立状态。

## 3. 当前实现基线

| 维度 | 当前事实 | 代码/文档证据 |
|---|---|---|
| 应用 | Electron + React + TypeScript，本机单用户桌面应用 | [`package.json`](../package.json) |
| 持久化 | SQLite；迁移严格递增并在单个事务内执行；高版本库与异常版本台账失败关闭 | [`src/runtime/db.ts`](../src/runtime/db.ts) |
| Schema | **v13**；新增 13 个热路径索引 | [`src/runtime/db.ts`](../src/runtime/db.ts#L425) |
| 执行主链 | Task → Run → Step → ModelCall/ToolCall → Artifact/Evidence/Verification | [`src/runtime/db.ts`](../src/runtime/db.ts#L21) |
| 状态事实 | 正常业务状态变更经过 `transition()`；创建初态和崩溃恢复是受控例外，详见 State 护栏 | [`src/runtime/state.ts`](../src/runtime/state.ts#L15)、[`docs/guardrails/State.md`](./guardrails/State.md) |
| Runtime | Main 通过 Utility Process 启动独立本机 Runtime | [`src/main/index.ts`](../src/main/index.ts#L175) |
| 风险控制 | Tool 通过 `baseRisk/riskFor/dryRun/execute` 描述，写操作进入 Approval | [`src/runtime/tool-types.ts`](../src/runtime/tool-types.ts#L21) |
| Need You | 从现有安全对象实时投影 | [`src/runtime/need-you.ts`](../src/runtime/need-you.ts#L35) |
| 列表投影 | `TaskSummaryView`；固定 5 条批量查询，详情按需加载 | [`src/runtime/views.ts`](../src/runtime/views.ts#L186) |
| 隐私 | Renderer 数据使用共享白名单和脱敏函数 | [`src/shared/privacy.ts`](../src/shared/privacy.ts) |
| 测试隔离 | 自动测试在 import 前固定独立 test root/home/data/tmp；Main、Runtime、MCP 与文件/Shell 能力失败关闭 | [`docs/test-isolation.md`](./test-isolation.md)、[`src/runtime/test-isolation.ts`](../src/runtime/test-isolation.ts) |
| 投影一致性 | 摘要两条派生路径由 `npm run parity:evidence` 逐字节对拍，共享同一脱敏规则 | [`tests/summary-parity-scenarios.cjs`](../tests/summary-parity-scenarios.cjs) |
| 迁移证据 | old-binary v8 fixture + 13 个真实 SQLite 场景，独立入口 `npm run migration:evidence` | [`docs/guardrails/Migration.md`](./guardrails/Migration.md)、[`tests/fixtures/migrations/v8-old-binary/README.md`](../tests/fixtures/migrations/v8-old-binary/README.md) |
| 打包目标 | macOS arm64，目录包、DMG、ZIP | [`package.json`](../package.json#L8) |
| 签名状态 | `identity: "-"`、`hardenedRuntime: false`，属于 ad-hoc 本机产物 | [`package.json`](../package.json#L65) |
| 远端 CI | PR/main workflow 已实现；Node 24.18.0、macOS arm64、Quality（含迁移证据）与 Electron E2E 分层 | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)、[`docs/ci.md`](./ci.md) |

## 4. 当前验证状态

### 4.1 本轮直接执行

执行日期：2026-07-30。

| 门禁 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npm run typecheck` | PASS |
| 静态治理 | `npm run check:static` | **5 个文件、22/22 PASS** |
| 单元测试 | `npm test` | **40 个文件、367/367 PASS** |
| 迁移证据 | `npm run migration:evidence` | 真实 SQLite **13/13 PASS** |
| 双路径对拍 | `npm run parity:evidence` | 真实 SQLite **5/5 PASS** |
| Production build | `npm run build` | PASS |
| Runtime smoke | `npm run smoke` | 独立临时根内 `delivered`，退出后无残留 |
| Electron E2E | `npm run e2e` | 受控 GUI 权限下 **46/46 PASS** |

`npm ci` 干净安装预演是 2026-07-29 T05 轮的证据（Node 23.6.0 arm64），本轮未重跑；依赖未变更。

### 4.2 最近一次仓库完整证据

[审计与交接.md 记录 AU](./审计与交接.md#L762) 记录的最近一次完整验证包括：

- 345/345 单元测试；
- 43/43 Electron E2E；
- s1–s18 逐条 18/18；
- typecheck 与 production build；
- 重新打包、产物校验和 packaged Journey A；
- `listTasks` RPC 31.7ms、494 字节/Task 的专项样本。

这是 **2026-07-25 的仓库审计证据**，不是 2026-07-29 本轮重新执行的 E2E、smoke 或打包证明。需要声明“当前全量通过”时，必须重新执行相应门禁。

## 5. 当前性能事实

- 1000 Task 的列表投影性能债已经清偿，不再是待办；
- 记录 AU 的样本中，`listTasks` RPC 为 31.7ms，payload 为 494KB（494 字节/Task）；
- 545–690ms 的完整首屏测量主要包含 Electron 冷启动；
- 启动预热和 Renderer 延迟加载尚未专项评估；
- TaskSummary 的 SQL 批量投影与完整 Task push 派生共用构造入口，并由 `npm run parity:evidence` 逐字节对拍守住（T07）。

T06 已用 old-binary v8 fixture 补齐迁移证据：13 个真实 SQLite 场景全绿，覆盖升级、结构指纹对拍、未知对象保持、重复启动幂等、高版本库与异常版本台账失败关闭、固定注入点整体回滚，详见 [Migration 护栏](./guardrails/Migration.md) 与 [记录 AY](./审计与交接.md)。

自动测试隔离已在 T05 实现并通过本地完整回归；[PR #4 最终 run 30457091843](https://github.com/Eleven1111/LeanClaw/actions/runs/30457091843) 与合并后的 [`main` run 30457521961](https://github.com/Eleven1111/LeanClaw/actions/runs/30457521961) 又在 Node 24.18.0 / macOS 15 arm64 上通过 `Quality` 与 `Electron E2E`。T05 已关闭，执行指针移到 T06。

性能数字是指定夹具和机器上的样本，不是所有机器的 SLA。任何后续优化必须先复现、归因，再设门槛。

## 6. 当前已知缺口

| 优先级 | 缺口 | 当前边界 |
|---:|---|---|
| P0 | packaged `.app` 的旧库升级未验证 | T06 只覆盖开发态入口 `out/main/index.js`；最终产物迁移属于 T08 |
| P1 | Automation「认领先推进、失败不回滚」是刻意保留的语义 | T07 已在真实 Runtime 注入 DB 故障验证：不假成功、不重复、不静默跳过；回退 `next_run_at` 会把坏计划变成每 tick 热重试，因此保持不回退，改为在卡片上显示「触发失败」 |
| P1 | Provider/Model/Tool/MCP/Shell/Scheduler 缺少统一能力与错误契约 | 已有 Runtime Center、Provider 测试和诊断导出，不应重建平行页面 |
| P1 | 模型 primary/fallback 缺少结构化错误语义 | fallback 双失败时用户无法看到完整因果链 |
| P1 | `refineTask` 复用最新 Run，Run Inspector 只读取最新 Run | Run 历史是否升级属于待批准产品决策 |
| P1 | 多个 Renderer/Runtime 文件职责较重 | 重构前必须先锁定行为，不新增无必要依赖 |
| 条件式 | 未配置 Developer ID、hardened runtime、notarization、正式升级链 | 只有决定对外分发后才启动 |
| P1 | 高版本库失败关闭缺少面向用户的解释 | 数据库层已拒绝并抛 `schema-too-new`，但 Runtime 会因此启动失败退出；解释性 UI 属于 P2 Runtime Doctor |
| P1 | `schema_version` 单行性无数据库级约束 | 由 `readSchemaVersion()` 读取时强制；加约束需要新迁移 |
| P1 | 迁移起点只覆盖空库、v8 与 v12 | 未穷举 v1–v11 每个中间版本 |
| 动态 | 依赖 advisory 会随时间变化 | 必须联网刷新并按生产可达性、非降级修复和缓解措施判断 |

## 7. 当前非目标

在没有独立用户证据和新立项前，不进入：

- 聊天 Persona、长期人格记忆；
- 第二 Runtime 或多 Runtime 平台化；
- 远程 IM/Bridge；
- Skills 市场；
- 多用户、云同步、团队协作；
- Generative UI、Media Studio；
- Windows/Linux 正式发行；
- 隐式文件 rewind。

## 8. 可复现刷新命令

在仓库根目录执行：

```bash
git status --short
git log -1 --oneline
rg -n "version: [0-9]+" src/runtime/db.ts
npm run typecheck
npm run check:static
npm test
npm run migration:evidence
npm run parity:evidence
npm run build
npx playwright test --list
```

需要声明 E2E、smoke 或最终打包通过时，再执行：

```bash
npm run e2e
# s1–s18 逐条命令以 docs/审计与交接.md 的当前回归命令为准
npm run dist:mac
# 对刚生成的最终产物重新执行签名、DMG/ZIP 和 packaged journey 校验
```

所有测试必须使用受限的临时 HOME/`LEANCLAW_DATA_DIR`，自动测试不得读取、复制或修改真实用户 DB、凭据和工作区。

## 9. 变更与验收规则

- 数值、版本和产物 hash 必须带刷新日期；
- 只列出测试清单不能写成测试通过；
- 历史审计结果不能冒充本轮执行结果；
- README、计划或报告不是实现证据；
- 未配置正式签名/公证时，不得使用“正式发行”或 `Shipped`；
- 每个阶段工程完成后仍需用户明确验收；
- 用户未说“验收通过”，不得关闭阶段或自动开始下一阶段。
