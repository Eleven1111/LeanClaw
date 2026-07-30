# LeanClaw 后续任务交接 - Claude 执行说明

> 交接对象：Claude
>
> 交接日期：2026-07-30
>
> 当前仓库：[`Eleven1111/LeanClaw`](https://github.com/Eleven1111/LeanClaw)
>
> 当前本地基线：`main@2a6e3b6`
>
> 当前执行指针：`P1 / CP1`（等待用户验收）
>
> 交接原则：严格按 active plan 一个任务一个任务执行；工程完成、远端门禁和用户验收分别判定

## 1. 先读这里

开始任何实现前，按顺序完整阅读：

1. 当前 Claude/Codex 会话提供的仓库级执行、验证、提交和安全指令；
2. [`current-baseline.md`](./current-baseline.md)：当前事实唯一入口；
3. [`exec-plans/README.md`](./exec-plans/README.md)：唯一领取规则和状态流转；
4. [`CodePilot 借鉴分析与 LeanClaw 优化提升执行方案`](./exec-plans/active/CodePilot借鉴分析与LeanClaw优化执行方案.md)：当前 active plan；
5. [`Migration.md`](./guardrails/Migration.md)：T06 的强制不变量与已知缺口；
6. [`test-isolation.md`](./test-isolation.md)：所有自动测试必须遵守的数据隔离契约；
7. [`审计与交接.md`](./审计与交接.md)：历史实现、失败和证据记录。

不要从历史 Phase 文档自行领取任务。当前唯一可领取任务以 active plan frontmatter 的 `current_task` 为准。

## 2. 当前真实状态

### 2.1 已完成

- P0 治理基线已由用户明确验收；
- P1/T04 远端 CI、Required Checks 和失败阻断证明已完成；
- P1/T05 自动测试与真实用户数据强隔离已完成；
- P1/T06 历史数据库迁移证据已完成并合并（`main@a91c39a`，[PR #6](https://github.com/Eleven1111/LeanClaw/pull/6) 两个 Required Checks 全绿）；
- P1/T07 已知故障路径补洞已完成并合并（`main@16809b9`，[PR #8](https://github.com/Eleven1111/LeanClaw/pull/8) 两个 Required Checks 全绿）；
- P1/T08 最终打包产物验证已完成并合并（`main@490205f`，[PR #10](https://github.com/Eleven1111/LeanClaw/pull/10) 两个 Required Checks 全绿；本机 `verify:packaged` 台账 10/10，含 packaged migration）；
- P1/T09 依赖风险刷新与决策已完成并合并（`main@2a6e3b6`，[PR #12](https://github.com/Eleven1111/LeanClaw/pull/12) 两个 Required Checks 全绿；`npm audit --omit=dev` 为 0）；
- CP1 阶段收口已完成**工程裁决**，验收记录见 [`docs/acceptance/leanclaw-codepilot-optimization-P1.md`](./acceptance/leanclaw-codepilot-optimization-P1.md)；
- `main` 受到 Branch Protection 保护：
  - `Quality` 和 `Electron E2E` 都是 Required Check；
  - 管理员同样受约束；
  - 禁止强推和删除 `main`；
  - 要求线性历史和评审会话解决；
- T05 代码与证据已合并：
  - 产品提交：`1bd9722`；
  - 证据提交：`a1e3496`；
  - 最终 PR、合并后 main 和证据 PR 的 CI 均通过。

### 2.2 当前验证基线

最近确认的本地基线：

- static：22/22；
- unit：367/367；
- s1–s18 逐条：18/18；
- 迁移证据（真实 SQLite）：13/13；
- 双路径对拍（真实 SQLite）：5/5；
- typecheck：PASS；
- production build：PASS；
- Runtime smoke：PASS；
- Electron E2E：46/46；
- 最终产物验证：10/10（DMG `e54a751e…` / ZIP `c7351451…`）；
- 当前 Schema：v13。

这些数字是历史证据，不是后续分支自动继承的结论。任何代码变更后必须重新执行并记录真实输出。

### 2.3 当前未完成

P1 还剩：

1. CP1 的**用户验收**——工程侧已全部完成，等待用户明确回复"验收通过"。

P1 未通过 CP1 用户验收前，不得开始 P2 业务实现。

## 3. 执行纪律

### 3.1 一个任务一个任务

每次只领取 active plan 的 `current_task`：

1. 从最新 `origin/main` 创建 `codex/` 前缀分支；
2. 先准备失败证据或锁定现有行为；
3. 实施当前任务，不顺手展开下一任务；
4. 运行本地门禁；
5. 更新当前基线、active plan、专项文档和审计记录；
6. 使用 Lore 格式提交；
7. 推送并创建 PR；
8. 等待 `Quality` 和 `Electron E2E` 全绿；
9. 修复失败，不用无改动重跑掩盖问题；
10. 合并后同步 `main`、清理分支，再移动执行指针。

T06 完成后先完成 T06 的 PR、证据和状态更新，再开始 T07。

### 3.2 状态不能互相代替

- README、计划和报告不是实现证据；
- 测试文件存在不等于测试已运行；
- 本地通过不等于 GitHub Runner 通过；
- 开发态 E2E 不等于最终 `.app` 通过；
- PR 合并不等于阶段用户验收；
- 本机打包不等于 Release ready 或 Shipped；
- 用户说“继续”不等于“验收通过”。

阶段验收使用 [`STAGE_ACCEPTANCE_TEMPLATE.md`](./exec-plans/STAGE_ACCEPTANCE_TEMPLATE.md)。只有用户明确回复“验收通过”或同等明确表述，才能把阶段用户状态设为 `accepted`。

### 3.3 数据和隐私边界

禁止：

- 读取、复制、hash、上传或修改真实 `~/.leanclaw`；
- 为了“更真实”擅自读取用户旧数据库；
- 在日志、fixture、截图、PR 或诊断包写入 token、真实私密路径或用户正文；
- 把 synthetic fixture 描述为 real historical fixture；
- 用“未修改真实库”冒充“未访问真实库”。

如确需真实历史库，必须先停下并取得用户对以下事项的单独明确授权：

1. 允许读取的精确源文件；
2. 离线复制位置；
3. 脱敏规则；
4. 允许保留的字段；
5. checksum 和销毁记录；
6. 是否允许将脱敏 fixture 提交到公开仓库。

默认方案不需要真实用户库。

## 4. 已完成任务归档：T06 历史数据库迁移证据

> T06 已于 2026-07-30 完成并合并，本节保留为实施记录。当前可领取任务是 T07（见第 5.1 节）。

### 4.1 任务目标

把“当前 synthetic v8 测试能启动”升级为可复现、可追溯、失败关闭的迁移证据：

- fixture 有明确来源和生成方法；
- v8 到当前版本的升级保持数据语义；
- 重复启动不重复破坏；
- pending migration 中途失败会整体回滚；
- 高于当前版本的数据库拒绝由旧程序继续打开；
- 新库与升级库的关键 schema 结构一致；
- 未知索引、触发器或约束不会被无意删除；
- 全过程只使用隔离数据根。

### 4.2 当前代码事实与已知缺口

关键文件：

- [`src/runtime/db.ts`](../src/runtime/db.ts)
  - 当前 migration 为 v1-v13；
  - `runMigrations()` 只把 pending migration 包在一个事务里；
  - `SCHEMA` 和空 `schema_version` 初始化发生在 migration transaction 之前；
  - `getSchemaVersion()` 使用 `LIMIT 1`；
  - 高版本数据库目前会得到空 pending 列表，不会失败关闭；
  - `schema_version` 没有保证恰好一行；
  - 没有确认启用 `PRAGMA foreign_keys = ON`。
- [`tests/db.test.ts`](../tests/db.test.ts)
  - 已覆盖版本排序、连续性、部分迁移幂等和 v11/v12 历史值；
  - 现有测试把“current 高于最新版本返回空数组”当作旧行为，T06 应先用失败测试明确新契约再修改。
- [`tests/e2e/phase2-migration.spec.ts`](../tests/e2e/phase2-migration.spec.ts)
  - 先用当前 v13 应用创建数据库，再手工重建四张旧表并把版本降到 v8；
  - 降格前的部分 v13 索引会残留；
  - 因此它不是 old-binary fixture，也不能独立证明 v13 migration 创建了全部索引。

Git 历史中，`15831e5` 是可用于追溯 v8 结构的重要锚点。先核验：

```bash
git show 15831e5:src/runtime/db.ts
git show 15831e5:package.json
git show 15831e5:package-lock.json
```

不要只凭这个提示下结论；必须确认该提交实际包含完整 v8 SCHEMA、构建入口和可执行锁文件。

### 4.3 建议实施顺序

#### 步骤 A：建立 T06 分支和任务说明

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c codex/t06-migration-evidence
git status --short --branch
```

在修改代码前，写清：

- 本任务只补迁移证据和必要的迁移失败关闭；
- 不新增业务 Schema；
- 不读取真实用户数据；
- 不做最终 packaged migration，最终产物验证留给 T08；
- 不顺手启用外键或做其他语义迁移，除非失败证据证明这是 T06 必需。

#### 步骤 B：先准备 RED 证据

至少新增以下失败测试：

1. **高版本数据库失败关闭**
   - 当前应用最高为 v13；
   - schema version 为 14 或更高时必须抛出稳定、可识别错误；
   - 不得继续执行 Runtime 恢复或业务查询。
2. **schema ledger 异常失败关闭**
   - `schema_version` 为 0 行时可按明确 bootstrap 规则初始化；
   - 多于 1 行、非整数、负数或无法解析时拒绝继续；
   - 不再依赖 `LIMIT 1` 随机选中一行。
3. **pending migration 事务回滚**
   - 构造一个迁移先写表/数据，再在固定注入点抛错；
   - 断言 schema、数据和 `schema_version` 全部回到迁移前；
   - 失败测试必须针对真实 SQLite，不只用 mock。
4. **新库与升级库 schema fingerprint 对拍**
   - 从空目录创建最新库；
   - 从历史 fixture 升级到最新库；
   - 规范化比较关键 table/index/trigger SQL、列、默认值和唯一约束；
   - 明确排除 SQLite 自动生成名称等非语义噪音。
5. **未知对象保持**
   - fixture 中加入当前代码不认识但合法的索引或触发器；
   - 升级后仍存在且语义不变；
   - 不要伪造一个当前迁移本来就会重建的对象来冒充未知对象。
6. **重复启动**
   - 同一升级库连续启动至少两次；
   - 版本、行数、关键值和未知对象保持不变。

先在旧实现上运行目标测试并保存真实失败输出。不要先改实现再补一条永远为绿的测试。

#### 步骤 C：生成可追溯的 v8 fixture

优先使用旧代码/旧二进制生成，而不是从当前 v13 数据库倒拆：

1. 在 `/tmp` 创建临时 worktree 或临时 clone，固定到已核验的 v8 commit；
2. 使用该提交自己的 lockfile 安装依赖并构建；
3. 在启动旧 Runtime 之前显式设置临时 `HOME`、`TMPDIR` 和 `LEANCLAW_DATA_DIR`；
4. 由旧版 `initDb()` 实际创建 v8 数据库；
5. 只写入公开、合成、确定性的测试数据；
6. 关闭旧 Runtime 后复制 fixture；
7. 记录来源 commit、生成命令、Node/Electron 版本、数据说明和 SHA-256；
8. 清理临时 worktree、安装目录和生成过程残留。

建议结构：

```text
tests/fixtures/migrations/v8-old-binary/
  README.md
  manifest.json
  leanclaw.db
  generate.sh 或 generate.mjs
```

要求：

- `manifest.json` 明确写 `source_kind: synthetic-old-binary`；
- 不得写 `real historical`；
- 生成脚本必须拒绝输出到真实 HOME；
- fixture 必须能由脚本重新生成并通过语义校验；
- 如果二进制 SQLite 字节不完全可复现，记录语义 fingerprint，不伪造“相同 hash 可重复生成”。

如果旧 commit 无法在当前环境构建，保留失败日志并降级为“historical-schema-derived synthetic fixture”。不要把手工重建提高为 old-binary 证据。

#### 步骤 D：做最小迁移框架修正

根据 RED 测试做最小实现，优先：

- 对 `current > latest` 明确抛错；
- 对 `schema_version` 行数和数值做严格校验；
- 提供可测试的迁移应用边界，让真实 SQLite 可以注入固定失败 migration；
- 保持所有 pending migration 和对应版本更新在同一事务内；
- 保持已发布 v1-v13 migration 的历史语义，不重编号、不静默改写；
- 不使用“删库重建”作为恢复方案；
- 不承诺 downgrade migration；失败恢复应说明是事务回滚、备份恢复或向前修复。

如果需要改 `initDb()` 的 bootstrap 原子性，必须分别证明：

1. 空目录创建失败不会留下被误认成成功的半成品；
2. 既有数据库 migration 失败整体回滚；
3. 成功路径与当前 Runtime 启动顺序不变。

#### 步骤 E：验证矩阵

最低执行：

```bash
npm run check:static
npm run typecheck
npm test
npm run build
npm run smoke
npx playwright test tests/e2e/phase2-migration.spec.ts
npm run e2e
git diff --check
```

此外必须单独记录：

- 空库到 v13；
- old-binary 或 historical-schema fixture 到 v13；
- N-1 到 v13；
- 高版本库拒绝；
- 固定失败注入和回滚；
- 重复启动；
- schema fingerprint；
- 未知对象保持；
- 迁移后至少一个真实 Task 主路径。

所有命令使用 T05 的 test root 机制。不要通过固定 sleep 或 Playwright retry 掩盖失败。

#### 步骤 F：文档与 PR

至少同步：

- [`current-baseline.md`](./current-baseline.md)；
- [`Migration.md`](./guardrails/Migration.md)；
- active plan 的 T06 状态和 `current_task`；
- [`审计与交接.md`](./审计与交接.md)；
- 新 fixture 的 README/manifest；
- 如测试数量变化，同步 [`ci.md`](./ci.md)。

PR 描述必须区分：

- synthetic historical-schema；
- synthetic old-binary；
- real historical；
- 开发态 migration；
- packaged migration。

T06 的 PR 在两个 Required Checks 全绿并合并前不得关闭 T06，也不得开始 T07。

### 4.4 T06 完成标准

只有同时满足以下条件才算工程完成：

- fixture 来源、生成方法、隐私级别和 checksum/fingerprint 可追溯；
- 高版本库失败关闭；
- schema ledger 异常失败关闭；
- migration 固定失败点整体回滚；
- 新库和升级库关键 schema 对拍；
- 历史数据行数与关键值保持；
- 重复启动幂等；
- 未知对象不被删除；
- 本地完整门禁通过；
- PR Required Checks 通过；
- 文档和审计记录与代码一致；
- 所有未测边界明确记录。

T06 是 P1 内部任务，不需要单独把 CP1 标记为用户验收通过。

## 5. T06 之后的 P1 任务

### 5.1 T07 已知故障路径补洞（已于 2026-07-30 完成并合并，保留为实施记录）

依赖：T05；执行顺序上等待 T06 完整关闭。

必须覆盖：

1. `TaskSummaryView` 的批量 SQL 路径与完整 `TaskView` 派生路径逐字段/逐字节对拍；
2. Automation 在真实 Runtime 中的 DB 故障注入；
3. 认领、触发、失败、恢复、停止后的队列和状态一致性；
4. 失败不会制造假成功、重复 Task、无提示跳过或 UI/事件矛盾。

建议做法：

- 先建立共享的确定性 fixture；
- 对同一 Task 同时走两条摘要构造路径并比较稳定序列化结果；
- Automation 使用固定故障点，不用随机失败作为唯一证据；
- 断言 Task、RunEvent、Automation history、Need You 和 UI 的结论一致；
- 记录既有“认领先推进、失败不回滚”语义是保持、修正还是接受风险。

T07 完成后更新 active pointer 到 T08。

### 5.2 T08 最终打包产物验证（已于 2026-07-30 完成并合并，保留为实施记录）

依赖：T04-T07 全部完成。

必须重新生成最终产物，不能复用旧 `.app`、DMG 或 ZIP：

- 校验应用版本；
- 校验 Electron 与 native ABI；
- 在隔离数据根首次启动；
- 用 T06 fixture 验证最终 `.app` 的旧库升级；
- 校验 Runtime 健康；
- 执行核心 Journey；
- 校验签名现状、DMG/ZIP 完整性和 SHA-256；
- packaged app/CDP 必须由受控 launcher 先安装测试隔离环境。

当前仍是 ad-hoc 签名，不得写成正式发行、公证通过或 Shipped。

### 5.3 T09 依赖风险刷新与决策（已于 2026-07-30 完成并合并，保留为实施记录）

依赖：T04；按顺序在 T08 后执行，避免并行改变 lockfile 和打包证据。

要求：

- 联网刷新当前 advisory，记录日期和命令；
- 区分 production、development、build-time 和不可达依赖；
- 对每个保留风险记录可达性、影响、缓解和复查日期；
- 不为“audit 清零”盲目降级 Electron、native module 或构建链；
- 任何依赖变化后重新执行 install、typecheck、unit、build、E2E 和 T08 适用的产物验证。

### 5.4 CP1 阶段收口

T06-T09 全部完成后：

1. 从模板创建 `docs/acceptance/leanclaw-codepilot-optimization-P1.md`；
2. 记录源码 commit、最终产物 hash、环境和证据截止时间；
3. 运行并记录：
   - static；
   - typecheck；
   - 全量 unit；
   - build；
   - 全量 Electron E2E；
   - s1-s18；
   - 全新最终打包；
   - packaged migration 和核心 Journey；
4. 做独立风险复核，未关闭 P0/P1 时不得标记 Engineering accepted；
5. 把工程结果交给用户验证；
6. 等用户明确回复“验收通过”；
7. 只有此后才能关闭 CP1 并开始 P2。

## 6. P2-P5 路线图

这一节用于理解后续方向，不代表现在可以直接领取。

### P2：统一能力契约与 Runtime Doctor

顺序：T10 -> T11 -> T12 -> T13 -> T14 -> CP2。

- T10：定义 Provider/Model/Tool/MCP/Shell/Scheduler 的统一 Capability Contract；
- T11：统一结构化错误分类，保留 primary/fallback 双因果链；
- T12：区分 passive 与 active probe，active probe 明示联网、spawn、认证刷新和费用副作用；
- T13：升级现有 Runtime Center，不新建监控墙；
- T14：用固定故障矩阵验证 UI、RPC、日志和诊断包一致。

未知能力默认不可用。Renderer 只能读取共享白名单契约，不得读取 Runtime 私有字段。

CP2 完成后必须让用户明确验收 Runtime Doctor，才可进入 P3。

### P3：Run 历史与行动检查点

开始 T15 前必须停下来取得用户产品决策，不能由 Claude 猜测：

- `refineTask` 创建新 Run 还是继续当前 Run；
- retry/resume/stop/追加预算/批准如何划分 Run；
- 历史 Run 的保留、归档、删除和隐私策略；
- checkpoint 是否只恢复执行上下文。

默认不做隐式文件回滚。

用户决策后顺序执行：T15 -> T16 -> T17 -> T18 -> T19 -> CP3。

### P4：可维护性与 UI 治理

顺序：T20 -> T21 -> T22 -> T23 -> CP4。

只有 CP3 完成，或用户明确决定跳过 P3，才开始 P4。

要求：

- 先锁定行为再拆分；
- 一次只处理一个 smell；
- 优先删除重复、复用现有组件；
- 不引入无第二消费者的抽象；
- 不新增依赖，除非用户单独批准；
- 每轮保持 900x600、标准窗口、键盘路径和可访问性证据。

### P5：条件式发行可信度

只有用户明确决定外部分发时才启动。先让用户选择：

- A：继续本机自用；
- B：小范围测试分发；
- C：正式外部分发。

未选择 B/C 时，不得擅自采购证书、启用 notarization 或接入 updater。

顺序：T24 -> T25 -> 条件式 T26 -> T27 -> CP5。

本机打包、PR 合并或上传文件都不等于 Shipped。

## 7. 每个任务的交付格式

### 7.1 中间更新

向用户简短说明：

- 当前任务和分支；
- 已发现的真实问题；
- 正在运行的验证；
- 失败原因和修复，而不是只说“还在处理”。

工具运行超过约一分钟时持续给出进度，不让用户面对长时间静默。

### 7.2 最终交付

每个任务结束至少报告：

1. 结果和当前执行指针；
2. 变更文件；
3. 本地测试真实数量和结果；
4. GitHub PR、Required Checks 和 main run；
5. 失败记录及修复；
6. 未测边界和剩余风险；
7. 是否需要用户验收；
8. 下一任务，但不要提前实施。

### 7.3 Lore commit

提交信息使用仓库 Lore 协议，至少包含：

```text
<为什么要改>

<约束、问题和方案说明>

Constraint: ...
Rejected: ... | ...
Confidence: high
Scope-risk: narrow|moderate|broad
Reversibility: clean|messy|irreversible
Directive: ...
Tested: ...
Not-tested: ...
```

## 8. Claude 的首个行动清单

收到本交接后，Claude 应直接执行：

1. 核对 `pwd`、`git status --short --branch` 和 `git log -1 --oneline`；
2. 拉取 `origin/main`，确认基线没有漂移；
3. 完整阅读第 1 节列出的治理文档；
4. 只创建 `codex/t06-migration-evidence`；
5. 核验 `15831e5` 是否为可构建的 v8 生成锚点；
6. 写出 T06 的失败测试清单和 fixture 生成说明；
7. 先取得 RED 证据，再修改 migration 实现；
8. 完成 T06 本地验证、文档、PR 和远端门禁；
9. T06 合并并同步 main 后，才把指针移到 T07。

如果发现当前 `main`、active plan 或用户指令与本文冲突，以更新后的用户指令和仓库当前事实为准，并同步修正文档；不要静默沿用过期假设。
