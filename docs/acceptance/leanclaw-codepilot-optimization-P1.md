---
record_type: stage-acceptance
plan_id: leanclaw-codepilot-optimization
phase_id: P1
prepared_at: 2026-07-30
evidence_cutoff: 2026-07-30T15:43:03Z
code_status: complete
test_status: pass
smoke_status: pass
review_status: pass
engineering_acceptance: accepted
user_acceptance: pending
release_readiness: not_applicable
shipping_status: not_shipped
---

# 阶段验收记录：CodePilot 借鉴分析与 LeanClaw 优化提升执行方案 / P1（CP1）

## 1. 验收对象与证据截止点

| 字段 | 内容 |
|---|---|
| Plan ID | `leanclaw-codepilot-optimization` |
| 阶段 / Checkpoint | P1 / CP1（T04–T09） |
| 验收范围 | 远端 CI 门禁、自动测试与真实用户数据隔离、历史数据库迁移证据、已知故障路径补洞、最终打包产物验证、依赖风险刷新 |
| 明确非目标 | P2 的统一能力契约与 Runtime Doctor；Run 历史与检查点；UI 治理重构；任何对外分发（证书、公证、updater） |
| 基线提交 / 工作树状态 | `main@2a6e3b6aee55d03afaa9f99879540ab91a6d7d03`，工作树干净（本记录本身除外） |
| Schema / 数据版本 | v13（v1–v13 未重编号） |
| 被验证产物 | 源码 `2a6e3b6`；开发态应用 `out/main/index.js`；最终产物 `LeanClaw-0.1.0-arm64.dmg` / `.zip`（hash 见 §4） |
| 证据截止时间 | 2026-07-30T15:43:03Z |
| 验收环境 | macOS 26.5.2 arm64；本机 Node v23.6.0；Electron 43.1.0；远端 GitHub Runner macos-15 arm64 + Node 24.18.0；Provider 使用 `LEANCLAW_WEB_MOCK=1`，`ANTHROPIC_API_KEY` 为空 |

证据截止时间之后的任何代码、依赖或产物变化都不自动继承本记录的结论。**macOS 打包不是逐字节可复现的**：同一 commit 重新 `dist:mac` 会得到不同 hash，因此 §4 的 hash 只对本次生成的那一份产物有效。

## 2. 状态面板

| 状态 | 允许值 | 当前值 | 证据或阻塞 |
|---|---|---|---|
| Code complete | `not_started / in_progress / complete / blocked` | `complete` | T04–T09 六个任务均已合并进 `main`，文档与护栏同步更新 |
| Tests pass | `not_run / partial / pass / fail / blocked` | `pass` | §4 检查 C-01…C-07 |
| Smoke pass | `not_run / partial / pass / fail / blocked` | `pass` | §5 Smoke Ledger：s1–s18 逐条取退出码 18/18；packaged 空库与旧库两条 Journey |
| Review pass | `not_run / pass / changes_requested / blocked` | `pass` | §6，无未关闭 P0/P1 |
| Engineering accepted | `pending / accepted / rejected / blocked` | `accepted` | §11 工程裁决 |
| User accepted | `pending / accepted / rejected` | `pending` | 用户尚未验证，见 §9 |
| Release ready | `not_applicable / not_ready / ready / blocked` | `not_applicable` | 未决定对外分发；ad-hoc 签名、未公证、无 updater |
| Shipped | `not_shipped / shipped / rolled_back` | `not_shipped` | 无任何发布渠道 |

## 3. 工程范围与变更

### 已完成

- **T04 远端 CI 基线**：PR/main workflow，Node 24.18.0 + macos-15 arm64，`Quality` 与 `Electron E2E` 分层并成为 `main` 的 Required Check；管理员同样受约束，禁止强推与删除；故意失败 PR 证明合并阻断真实生效。
- **T05 测试与真实用户数据强隔离**：Vitest、Playwright、Runtime smoke 在 import/启动前建立独立 test root/home/data/tmp；Main、Utility Runtime、MCP 子进程、文件工具、Shell cwd 与导出路径全部加入测试根硬边界；越界、符号链接逃逸、过宽 `allowedDirs`、场景覆盖隔离变量都有失败反证。
- **T06 历史数据库迁移证据**：`npm run migration:evidence` 13 个真实 SQLite 场景；fixture 由锚点提交 `15831e5` 自己的 `initDb()` 创建（`source_kind: synthetic-old-binary`，含 manifest、checksum、语义指纹与重生成脚本）；实现补齐高版本库与版本台账的失败关闭、迁移应用边界与事务回滚、失败不发布半成品连接。
- **T07 已知故障路径补洞**：`npm run parity:evidence` 对 `TaskSummaryView` 两条派生路径做逐字节对拍（首次运行即发现列表投影未脱敏并修复）；Automation 在真实 Runtime 内注入可移除的 DB 故障；新增 `lastTriggerFailed` 让触发失败在 UI 上不再表现为正常周期。
- **T08 最终打包产物验证**：受控 launcher `npm run verify:packaged`，拒绝旧包、验证解压后的 ZIP 二进制、版本/ABI/签名/完整性/hash，并用 T06 fixture 证明**最终 `.app` 的 v8→v13 升级**。
- **T09 依赖风险刷新**：生产依赖树 advisory 清零；构建期 `brace-expansion` 保留并记录可达性、缓解与复查日期，拒绝 `electron-builder` 大版本降级。

### 未完成或移出范围

- 高版本数据库失败关闭目前是 Runtime 启动失败退出，**没有面向用户的解释性 UI** → 留给 P2 Runtime Doctor。
- `schema_version` 的单行不变量只在读取时强制，**没有数据库级约束**（加约束需要新迁移）。
- Automation 连续多次触发失败在卡片上只显示为一次，无失败次数或历史。
- 未在其它机器或全新 macOS 账号验证 Gatekeeper；未构建 x64/universal。

### 变更文件

| 文件 | 变更目的 | 风险级别 |
|---|---|---|
| `src/runtime/db.ts` | 迁移失败关闭、版本台账严格校验、`applyMigrations` 边界、`initDb` 不发布半成品 | 高（数据库启动路径） |
| `src/runtime/views.ts` | 列表投影补脱敏，与完整视图共享规则 | 中（隐私边界） |
| `src/shared/schedule.ts`、`src/runtime/api.ts`、`src/renderer/src/Automations.tsx` | Automation 触发失败可见性 | 中 |
| `src/shared/types.ts` | `ScheduleView.lastTriggerFailed` | 低 |
| `tests/migration-evidence*`、`tests/summary-parity*`、`tests/support/electron-evidence.mjs`、`tests/packaged-verify.mjs` | 真实 SQLite 与最终产物的证据入口 | 低（测试面） |
| `tests/fixtures/migrations/v8-old-binary/*` | old-binary 迁移夹具与生成脚本 | 低 |
| `.github/workflows/ci.yml` | 新增迁移证据与对拍两个必过步骤 | 中（门禁） |
| `docs/*` | 基线、护栏、CI、依赖台账、打包手册、审计记录同步 | 低 |

## 4. 自动化验证证据

被测对象统一为 `main@2a6e3b6`，除非另行注明。

| 时间 | 检查 ID | 命令 / 动作 | 被测对象 | 结果 | 关键输出 | 证据位置 |
|---|---|---|---|---|---|---|
| 2026-07-30T15:2xZ | C-01 | `npm run check:static` | 源码 | `pass` | 5 文件 / **22/22** | 本机终端 |
| 2026-07-30T15:2xZ | C-02 | `npm run typecheck` | 源码 | `pass` | 两个 tsconfig 均无错误 | 本机终端 |
| 2026-07-30T15:2xZ | C-03 | `npm test` | 源码 | `pass` | 40 文件 / **367/367** | 本机终端 |
| 2026-07-30T15:2xZ | C-04 | `npm run migration:evidence` | 真实 SQLite（Electron ABI） | `pass` | **迁移证据台账：13/13 PASS** | 本机终端 |
| 2026-07-30T15:2xZ | C-05 | `npm run parity:evidence` | 真实 SQLite（Electron ABI） | `pass` | **双路径对拍台账：5/5 PASS** | 本机终端 |
| 2026-07-30T15:2xZ | C-06 | `npm run build` | 源码 → production bundle | `pass` | 主进程/preload/renderer 均产出 | 本机终端 |
| 2026-07-30T15:3xZ | C-07 | `npm run e2e` | 开发态 Electron `out/main/index.js` | `pass` | **46 passed (2.3m)** | 本机终端 |
| 2026-07-30T15:4xZ | C-08 | `rm -rf release && npm run dist:mac` | 最终产物 | `pass` | DMG + ZIP 重新生成 | `release/` |
| 2026-07-30T15:43Z | C-09 | `npm run verify:packaged` | 解压自 ZIP 的 `.app` | `pass` | **台账 10/10 OK** | 本机终端 |
| 2026-07-30T07:3xZ–15:0xZ | C-10 | GitHub Actions `Quality` + `Electron E2E` | PR 与合并后 `main` | `pass` | 见 §4.1 | GitHub Actions |

**最终产物 hash（本次 CP1 生成）**：

- DMG `e54a751e5005d926e4e4f4246f32778dcf27031e30fd2d1002e07388ca0b7cac`
- ZIP `c7351451d3f36fe2853bed86ad981600fd10c6f314d45a798b89e0b9120ddcd9`

这组 hash 取代 T08（记录 BA）与 T09（记录 BB）中的两组——它们对应的是同一份代码的**不同次打包**。macOS 打包不是逐字节可复现的，因此产物 hash 只能标识"某一次生成的那一份"，不能用来证明"代码没变"。要证明代码没变用 commit，不要用产物 hash。

### 4.1 远端门禁证据

| 任务 | PR run | 合并后 main run |
|---|---|---|
| T06 | [30517200723](https://github.com/Eleven1111/LeanClaw/actions/runs/30517200723) Quality 55s / E2E 4m19s | [30517494478](https://github.com/Eleven1111/LeanClaw/actions/runs/30517494478) |
| T07 | [30523391877](https://github.com/Eleven1111/LeanClaw/actions/runs/30523391877) Quality 1m17s / E2E 4m02s | [30523728447](https://github.com/Eleven1111/LeanClaw/actions/runs/30523728447) |
| T08 | [30538036581](https://github.com/Eleven1111/LeanClaw/actions/runs/30538036581) Quality 1m38s / E2E 3m59s | [30538427593](https://github.com/Eleven1111/LeanClaw/actions/runs/30538427593) |
| T09 | [30556481206](https://github.com/Eleven1111/LeanClaw/actions/runs/30556481206) Quality 51s / E2E 4m20s | [30556953956](https://github.com/Eleven1111/LeanClaw/actions/runs/30556953956) |

远端两个 job **不含打包**（CI 刻意不跑 `dist:mac`），因此 CI 全绿不等于产物已验证；产物证据只来自本机 C-08/C-09。

## 5. Smoke Ledger

环境统一为 macOS 26.5.2 arm64、Electron 43.1.0、`LEANCLAW_WEB_MOCK=1`、`ANTHROPIC_API_KEY` 为空；每条冒烟由 `npm run smoke` 的 wrapper 建立独立临时 root/home/data/tmp，结束即清理，**不接触真实 `~/.leanclaw`**。

| 时间 | 场景 ID | 产物 / commit | Fixture 来源 | 操作 | 预期 | 实际 | 结果 |
|---|---|---|---|---|---|---|---|
| 2026-07-30T15:0xZ | s1 | `2a6e3b6` 开发态 | 内置 sample notes | 默认最短交付 | `delivered` | `delivered` | `pass` |
| 同上 | s2 | 同上 | 同上 | 注入 `bad_citation` | `verification_failed` | 一致 | `pass` |
| 同上 | s3 | 同上 | 同上 | 注入 `tool_fail` | `cancelled_by_user` | 一致 | `pass` |
| 同上 | s4 | 同上 | 不存在的输入路径 | 输入缺失 | `cancelled_by_user` | 一致 | `pass` |
| 同上 | s5 | 同上 | 同上 | 注入 `forbidden_path` | `cancelled_by_user` | 一致 | `pass` |
| 同上 | s6 | 同上 | web mock | deep-research | `delivered` | 一致 | `pass` |
| 同上 | s7 | 同上 | web mock | deep-research + `bad_citation` | `verification_failed` | 一致 | `pass` |
| 同上 | s8 | 同上 | 内置 | content-pack | `delivered` | 一致 | `pass` |
| 同上 | s9 | 同上 | 内置 | content-pack + `banned_word` | `verification_failed` | 一致 | `pass` |
| 同上 | s10 | 同上 | 内置 | 5 任务 / maxActive=3 | 峰值不超限且全部交付 | `peak=3 ≤ maxActive=3，5/5 全部交付` | `pass` |
| 同上 | s11 | 同上 | 内置 | 预算 0.05 + 昂贵模型 | 预算击穿停线 | `cancelled_by_user` | `pass` |
| 同上 | s12 | 同上 | 内置 | 增量 Run | v2 交付且旧版被取代 | `v2 交付、旧版被取代、第二轮产生新批准、内容已更新` | `pass` |
| 同上 | s13 | 同上 | 假 primary provider（`127.0.0.1:1`） | `primary_500` 故障转移 | 回落后交付 | `delivered` | `pass` |
| 同上 | s14 | 同上 | 仓库内 `mcp-echo-server.cjs` | MCP 链路 | 连接、注册且默认需批准 | `已连接、echo 工具注册且默认 approval_required、execute 返回 echo:` | `pass` |
| 同上 | s15 | 同上 | 白名单 `echo ` | Shell 三级风险 | 风险判定正确且越权失败 | `三级风险判定正确、白名单执行成功、失败命令正确抛错` | `pass` |
| 同上 | s16 | 同上 | 内置 | 定时任务 | 到点入队、防重复、可暂停 | 一致 | `pass` |
| 同上 | s17 | 同上 | 内置 | Agent 快照与绑定 | 快照与安全门正确 | 一致 | `pass` |
| 同上 | s18 | 同上 | 内置 | Automation 手动/定时 | 同链路、历史与防重复 | 一致 | `pass` |
| 2026-07-30T15:43Z | P-01 | ZIP 解压出的 `.app`（`c7351451…`） | 空数据根 | packaged 首启 + Journey A | `schema_version=13`、`delivered` | 一致，`runtimeRuns=1`，Renderer 零错误 | `pass` |
| 2026-07-30T15:43Z | P-02 | 同上 | T06 old-binary v8 fixture（`sha256=048630e9…`） | packaged 旧库升级 + Journey A | v8→v13、关键值与未知对象保持、升级后仍可交付 | 一致，`idx_*` 14 个 | `pass` |

s1–s18 **逐条读取各自退出码**（不经管道，避免拿到 `tail` 的恒 0），结果 `TOTAL pass=18 fail=0`。故障矩阵是固定注入点，没有使用随机故障作为门禁证据。

## 6. Review 结论

| Finding ID | 严重级别 | 结论 | 处置 | 证据 |
|---|---|---|---|---|
| F-01 | P0 | 列表投影 `lastDoneLabel` 未脱敏，把 Task 私有绝对路径送进 Renderer | `fixed` | `parity:evidence` 首次 RED 输出；修复后 5/5，记录 AZ |
| F-02 | P0 | 高版本数据库不会失败关闭，旧程序可继续打开新库 | `fixed` | `migration:evidence` RED 三条；`schema-too-new`，记录 AY |
| F-03 | P0 | `schema_version` 用 `LIMIT 1` 读取，多行/非法值不拒绝 | `fixed` | `readSchemaVersion()` + 单测 + 场景，记录 AY |
| F-04 | P0 | packaged migration 无证据（只有空库 smoke） | `fixed` | `verify:packaged` P-02，记录 BA |
| F-05 | P1 | Automation 触发失败在 UI 上表现为正常周期（假成功 / 无提示跳过） | `fixed` | `lastTriggerFailed` + E2E 故障注入，记录 AZ |
| F-06 | P1 | 生产依赖树存在 moderate advisory | `fixed` | `npm audit --omit=dev` → 0，记录 BB |
| F-07 | P2 | 构建期 `brace-expansion` DoS 无非降级修复 | `accepted-risk` | 不可达 + 缓解 + 复查日期 2026-08-30，`docs/dependency-risk.md` |
| F-08 | P2 | 高版本库拒绝缺少面向用户的解释 | `deferred` | 归入 P2 Runtime Doctor |
| F-09 | P2 | `schema_version` 单行性无数据库级约束 | `accepted-risk` | 加约束需要新迁移，超出 P1 范围 |
| F-10 | P3 | 空 `output_summary` 得到空标签而非步骤标题 | `deferred` | 两条路径行为一致；是否改属 UI 决策 |

- Reviewer：Claude（实施者自评）+ 每个任务的独立 PR 与 Required Checks
- Review 范围：T04–T09 的实现、测试、文档与产物证据
- Review 结论：**无未关闭的 P0/P1**。F-07/F-09 是明确记录的接受风险，F-08/F-10 已转入后续阶段。
- **独立性边界**：本次 Review 由实施者自评 + 远端门禁强制执行，**没有第三方评审人**。这是本记录最弱的一环，已在 §7 记为 U-07。

## 7. 未测边界与未知

| ID | 未测内容 | 原因 | 潜在影响 | 当前缓解 | 补证条件 / 后续任务 |
|---|---|---|---|---|---|
| U-01 | 其它机器 / 全新 macOS 账号的 Gatekeeper 行为 | ad-hoc 签名包在他机会被拦截 | 无法交给第二个人使用 | 定位为本机自用 | 决定对外分发时进入 P5 |
| U-02 | x64 / universal 产物 | 只构建 arm64 | Intel Mac 不可用 | 明示只支持 arm64 | 有真实需求时再评估 |
| U-03 | packaged 的 v12→v13 起点 | 只用了 v8 fixture | 中间版本 packaged 升级未直接验证 | 开发态已覆盖 v12→v13 | 需要时扩展 fixture 矩阵 |
| U-04 | 写 `runs`/`steps`/`run_events` 失败的故障组合 | 只注入了写 `tasks` 失败 | 其它写点的回滚行为未直接验证 | 同一事务边界，机制相同 | 故障矩阵扩展 |
| U-05 | Electron 43.1.0 自身 CVE | 依赖台账只覆盖 npm advisory | 运行时漏洞可能未被发现 | 版本较新 | Electron 升级作为独立决策 |
| U-06 | advisory 快照之后的新披露 | advisory 是动态的 | 结论会腐烂 | 复查日期 2026-08-30 | 引用前必须重跑 `npm audit` |
| U-07 | **独立第三方评审** | 本轮 Review 为实施者自评 | 可能存在实施者盲区 | 每个任务独立 PR + Required Checks + 逐条 RED 证据 | 用户验收即为独立复核 |
| U-08 | 长时间连续运行 / 大数据量下的稳定性 | 未做长跑或压力测试 | 长期使用的内存与体积增长未知 | 1000 Task 规模有性能夹具 | 需要时立专项 |
| U-09 | 真实 Provider（付费 API）下的端到端 | 全程 `LEANCLAW_WEB_MOCK=1`、空 API key | 真实模型返回的边界未覆盖 | 隔离与成本考虑下的刻意选择 | 由用户在自己的凭据下验证 |

## 8. 回滚与恢复说明

| 字段 | 内容 |
|---|---|
| 回滚触发条件 | 升级后数据库无法打开、Task 主链断裂、或最终产物无法启动 |
| 可回滚范围 | 代码与产物；**数据库不可自动降级** |
| 回滚方法 | `git revert` 对应的 squash commit（T06 `a91c39a`、T07 `16809b9`、T08 `490205f`、T09 `2a6e3b6`），随后重新 `npm run build` / `dist:mac` |
| 数据保护与备份 | 迁移在单事务内执行，失败整体回滚；升级成功后旧版本无法读取新库 |
| 不可逆变化 | **schema 一旦升到 v13 就不可降级**——没有 downgrade migration，这是刻意的设计选择 |
| 回滚后验证 | 重跑 `check:static`/`typecheck`/`test`/`migration:evidence`/`parity:evidence`/`e2e`，并重新打包 + `verify:packaged` |
| 预计恢复时间 | 代码回退 + 重新验证约 30 分钟；数据库需从用户自己的备份恢复 |
| 负责人 | 用户（11） |

**恢复路径是"回滚代码 + 向前修复"，不是"降级迁移"**。若用户已用 v13 打开过数据库，回退到旧版本代码将无法读取该库；此时唯一安全的做法是恢复升级前的数据库备份，或继续向前修复。

## 9. 用户验收记录

> 本节只记录真实发生的用户验收，不预填结论。

| 字段 | 内容 |
|---|---|
| 提交验收时间 | 2026-07-30 |
| 用户验证的产物 / hash | `release/LeanClaw-0.1.0-arm64.dmg`（`e54a751e…`）/ `.zip`（`c7351451…`），源码 `main@2a6e3b6` |
| 用户验证的场景 | 建议：安装并首启、跑一个真实 Task 到交付、打开 Automations 确认「触发失败」文案、（如有旧库）确认升级后数据完好 |
| 用户反馈 | 待填写 |
| 验收决定 | `pending` |
| 明确表述与时间 | 待填写 |
| 附加条件 | 待填写 |

## 10. 发行与交付证据

| 字段 | 内容 |
|---|---|
| 分发决策 | **本机自用**（尚未选择小范围测试或正式外发） |
| Release candidate 版本 / hash | `0.1.0`；DMG `e54a751e…`、ZIP `c7351451…` |
| 签名 / 公证 / Gatekeeper | ad-hoc（`identity: "-"`、`hardenedRuntime: false`），electron-builder 日志明确 `skipped macOS notarization`；Gatekeeper 行为未在他机验证 |
| 升级与回滚验证 | `not_applicable`（未接入 updater） |
| 发布渠道与权限 | 无 |
| 实际发布时间 | 无 |
| 可获取地址 | 无 |
| 发布产物 checksum | 见上（仅本机产物，未发布） |
| 发布后 smoke | `not_applicable` |

## 11. 最终裁决

- **工程裁决**：`accepted`。T04–T09 全部完成并合并，每个任务都有独立 PR、两个 Required Checks 与逐条可复现证据；无未关闭的 P0/P1；接受风险项均有可达性分析、缓解与复查日期。
- **用户裁决**：`pending`。用户尚未验证本记录 §9 的产物与场景。
- **发行裁决**：`not_applicable`。ad-hoc 签名、未公证、无 updater、无渠道，状态只到 `Packaged smoke pass`。
- **阶段是否允许关闭**：**否**。必须等用户明确回复"验收通过"或同等明确表述。
- **下一阶段是否允许开始**：**否**。CP1 未获用户验收前不得开始 P2。
- 裁决人 / 时间：Claude（工程裁决）/ 2026-07-30T15:43:03Z

## 12. 状态变更日志

| 时间 | 字段 | 原值 | 新值 | 原因与证据 |
|---|---|---|---|---|
| 2026-07-30 | `code_status` | `in_progress` | `complete` | T04–T09 全部合并进 `main@2a6e3b6` |
| 2026-07-30 | `test_status` | `not_run` | `pass` | §4 C-01…C-07、C-10 |
| 2026-07-30 | `smoke_status` | `not_run` | `pass` | §5：s1–s18 逐条 18/18，packaged P-01/P-02 |
| 2026-07-30 | `review_status` | `not_run` | `pass` | §6，无未关闭 P0/P1；独立性局限记为 U-07 |
| 2026-07-30 | `engineering_acceptance` | `pending` | `accepted` | §11 工程裁决 |
| — | `user_acceptance` | `pending` | `pending` | 等待用户明确表述，不得由"继续"或未提异议推导 |
