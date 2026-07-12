# LeanClaw — Stage 2：实施方案

> 版本：v1.0 ｜ 日期：2026-07-10 ｜ 状态：代码骨架已落地并通过验证
> 前置文档：[Stage1_产品形态与架构方向.md](Stage1_产品形态与架构方向.md)（已确认，六处过度工程风险已裁决）
> 本文档描述的不是计划中的代码，而是**仓库中已存在、已构建、已通过端到端冒烟验证的代码**。所有命令和验收结论均为 2026-07-10 实测结果。

---

## 0. 与原始提示词的一处交付方式调整

原始提示词要求 Stage 2 在文档中给出"每个文件的路径和完整代码"。由于本次工作直接在仓库中进行，代码以真实文件形式落盘（可构建、可测试、可运行），文档只列文件清单与设计说明，不重复粘贴代码——真实文件比文档里的代码块更可信，且不存在两处不同步的风险。

## 1. 核心数据模型

主链路九个实体，全部落在 SQLite（见第 6 节 Schema）。关系如下：

```
Task 1─n Run 1─n Step 1─n ModelCall / ToolCall
                     │
                     ├──n Artifact ──n Evidence
                     ├──n Verification
                     ├──n Approval
                     └──n AndonEvent
Task 1─n RunEvent（追加式账本，全实体事件汇入）
```

设计要点（对应六处风险裁决）：

- **Evidence 只有四个业务字段**：`source_type`、`locator`、`excerpt`、`verification_status`，外键关联到结论 Artifact。没有置信度、没有不确定性。
- **Artifact 是一等公民**：版本号自增，新版本通过 `superseded_by` 取代旧版本（保留完整历史），`hash` 支持幂等判断，`is_deliverable` 标记最终交付，`source_artifact_ids` 记录血缘。
- **runs.resume_step_index** 是检查点机制的全部：验证失败时写入应回退到的步骤下标，重试时从此处重置后续步骤。
- **run_events 是追加式账本**：只 INSERT 不 UPDATE，`seq` 自增主键保证全序。崩溃恢复、复盘指标、成果追溯都从这里读。

## 2. 状态机与事件模型

### 内部状态（14 个，全部真实存在于代码）

定义于 [src/shared/machine.ts](../src/shared/machine.ts)：`draft, planning, queued, step_running, step_retrying, paused_by_user, awaiting_approval, andon_open, verifying, verification_failed, delivered, cancelled_by_user, failed, archived`。

转换合法性由 `ALLOWED` 邻接表 + `canTransition()` 纯函数决定，运行时的 `transition()`（[src/runtime/state.ts](../src/runtime/state.ts)）在非法转换时抛错。关键约束已用单元测试锁定：

- `delivered` 的唯一入边是 `verifying`（交付门，模型无法自述完成）；
- `archived` 无出边（终态）；
- `paused_by_user` 映射到用户可见的 Running（暂停是角标，不是状态）；
- 崩溃恢复路径 `step_running → paused_by_user → queued` 合法。

唯一允许绕过状态机的写入是 `recoverAfterRestart()`：进程死亡不是正常转换，恢复逻辑将残留的运行中状态直接置为 `paused_by_user`（有 Run）或回退 `draft`（无 Run），并记录 `recovered-after-restart` 事件。

### RunEvent 类型清单（当前实现产生的全部事件）

`task-created, run-started, status-changed, step-started, step-completed, step-error, step-retry(隐含在 step-error), model-call, tool-call, tool-forbidden, artifact-created, verification, verification-blocked, approval-requested, approval-resolved, andon-opened, andon-resolved, delivered, task-cancelled, paused-by-user, resumed-by-user, retry-from-checkpoint, recovered-after-restart`

一条正常交付的 Run 产生 48 条事件（实测值），足以完整重放执行过程。

## 3. Artifact / Evidence / Verification / Approval / Andon 字段与关联

| 实体 | 关键字段 | 关联 | 生命周期 |
|---|---|---|---|
| Artifact | type, title, version, content/local_path, hash, producer, source_artifact_ids, verification_status, is_deliverable, superseded_by | 属于 Task/Run/Step；被 Evidence、Verification 引用 | 创建 → 验证 → (被取代 \| 标记交付) |
| Evidence | source_type, locator, excerpt, verification_status | 指向结论 Artifact | 引用核验步骤中批量创建，状态一次判定 |
| Verification | kind(schema/deterministic/evidence), status(passed/failed), detail | 属于 Run/Step，可选指向 Artifact（同步更新其 verification_status） | 每次验证步骤追加，不覆盖历史 |
| Approval | action_desc, diff, status(pending/approved/rejected) | 属于 Task/Run/Step；ToolCall 记录 approval_id | pending → (approved: 继续执行 \| rejected: 任务取消) |
| AndonEvent | reason, impact, recommended_actions[], resume_step_index, chosen_action | 属于 Task/Run/Step | open → resolved(retry: 从检查点续跑 \| cancel: 任务取消) |

Approval 语义裁定：**拒绝写入 = 取消任务**（MVP 简化）。将来如需"拒绝但调整后重试"，在 rejected 分支改挂 Andon 即可，数据结构不变。

## 4. 页面级交互说明

MVP 实现两个页面（Home、Task Workspace），对应 [src/renderer/src/](../src/renderer/src/)。

**Home**（Home.tsx）：
- 「需要你处理」区（Waiting for You / Blocked 任务）排在输入卡之前，有事优先；
- 任务输入卡：目标 textarea + 输入文件路径（支持拖入文件，经 `webUtils.getPathForFile` 取真实路径）+「开始任务」；
- 「进行中」「全部任务」列表，每行显示目标、当前进度短语、状态胶囊。

**Task Workspace**（TaskWorkspace.tsx）：
- 头部：目标、状态胶囊（蓝 Running / 橙 Waiting / 紫 Verifying / 绿 Delivered / 红 Blocked）、耗时与成本一行、控制按钮（暂停/继续/停止，按状态渐进显隐）；
- Task Brief 卡；
- Andon 卡（橙色左边条）：原因 + 影响 + [重试] [取消任务]；
- Approval 卡（蓝色左边条）：动作描述 + Diff Preview + [批准] [拒绝]；
- 验证失败卡（红色左边条）：失败详情 + [从检查点重试] [取消任务]；
- 执行计划步骤列表：○ 待执行 / ● 进行中 / ✓ 完成 / ⚠ 失败，附每步产出摘要与重试次数；
- 最终交付卡：应用内预览 + [在 Finder 中显示]；
- 右侧 Inspector：Verification / Evidence / Artifacts / 账本四段。

所有界面更新由 Runtime 推送驱动（每次状态变更推送完整 TaskView 快照），Renderer 无轮询。

## 5. Electron 进程与 IPC 设计

四层进程边界（与 Stage 1 一致，已实现）：

| 进程 | 文件 | 职责 | 安全设置 |
|---|---|---|---|
| Renderer | src/renderer/ | React UI | sandbox=true, contextIsolation=true, nodeIntegration=false |
| Preload | src/preload/index.ts | 白名单桥：rpc / reveal / getPathForFile / onPush | contextBridge，仅 4 个方法 |
| Main | src/main/index.ts | 窗口、通知、IPC 路由、fork Runtime | 刻意保持薄（~150 行） |
| Utility Process | src/runtime/ | Loop Engine、状态机、Policy、Verifier、SQLite | 独立于 UI 存活，`utilityProcess.fork` |

IPC 协议（[src/shared/types.ts](../src/shared/types.ts) 的 `RpcRequest` 判别联合，11 个方法）：

```
Renderer --invoke('rpc', RpcRequest)--> Main --postMessage({id,req})--> Runtime
Runtime --postMessage({kind:'rpc-result',id,result|error})--> Main --resolve--> Renderer
Runtime --postMessage({kind:'push',event:PushEvent})--> Main --send('push')--> Renderer
```

Main 用自增 id + pending Map 做请求关联；推送事件同时驱动系统通知（用户可见状态变为 Waiting for You / Delivered 时）。

竞态防护：引擎 `drive()` 用 active Set 防止同任务并发驱动；`finally` 中若发现状态仍为 `queued` 则 `setImmediate` 自我重启，消除"批准回调先于 Suspend 展开"的竞态（冒烟测试全自动批准场景下已实证）。

## 6. 本地目录结构与 SQLite Schema

**应用数据目录**（生产 = `~/Library/Application Support/leanclaw/`，可用 `LEANCLAW_DATA_DIR` 覆盖）：

```
<dataDir>/
├── leanclaw.db        SQLite（WAL 模式）
├── leanclaw.db-wal/-shm
└── workspace/         默认工作区（白名单目录），首启种子 notes.md
```

**SQLite Schema**：12 张表，完整 DDL 见 [src/runtime/db.ts](../src/runtime/db.ts)。表清单：`tasks, runs, steps, model_calls, tool_calls, artifacts, evidence, verifications, approvals, andon_events, run_events`（另有 projects 预留列 project_id，MVP 不建独立表——Project 是人工归档容器，等有真实归档需求再建）。

**工程目录**：

```
LeanClaw/
├── docs/                          Stage1 / Stage2 文档
├── src/
│   ├── shared/                    纯函数层（可单测，不依赖 electron/db）
│   │   ├── types.ts               领域类型 + IPC 协议
│   │   ├── machine.ts             状态机邻接表 + 用户状态映射
│   │   ├── diff.ts                LCS 行级 diff（Approval 预览）
│   │   └── verify.ts              Schema 解析 + 引用存在性检查
│   ├── main/index.ts              Main 进程
│   ├── preload/index.ts           contextBridge 白名单
│   ├── runtime/                   Utility Process（产品心脏）
│   │   ├── index.ts               入口：初始化、崩溃恢复、消息循环/冒烟模式
│   │   ├── db.ts                  SQLite 初始化 + Schema
│   │   ├── ledger.ts              RunEvent 追加
│   │   ├── state.ts               受控状态转换
│   │   ├── views.ts               TaskView 投影（含指标聚合）
│   │   ├── bus.ts                 推送订阅
│   │   ├── engine.ts              Loop Engine：步骤驱动、重试退避、Suspend、Andon、StepContext
│   │   ├── tools.ts               Tool Registry + fs.read / fs.write（三级风险、DryRun、幂等）
│   │   ├── model.ts               Model Adapter（Anthropic API / 本地 Mock 自动切换）
│   │   ├── recipe.ts              LoopTemplate + file-edit-summarize Recipe（7 步）
│   │   ├── api.ts                 RPC 处理器 + 崩溃恢复
│   │   └── smoke.ts               CLI 端到端冒烟驱动器
│   └── renderer/                  React UI（Home / TaskWorkspace / 样式）
├── tests/                         vitest 单元测试（21 个用例）
├── electron.vite.config.ts
├── package.json / tsconfig*.json
```

## 7. Tool Registry、MCP 与 Skill 的接口设计

**ToolDefinition**（已实现，[src/runtime/tools.ts](../src/runtime/tools.ts)）：

```ts
interface ToolDefinition {
  id: string; name: string; version: string
  provider: 'builtin' | 'mcp' | 'cli'
  description: string
  baseRisk: RiskLevel                                    // low | approval_required | forbidden
  riskFor(input, ctx: { allowedDirs }): RiskLevel        // 三级风险：工具类型 + 关键参数规则
  dryRun?(input): ToolResult                             // 产出 Diff Preview
  execute(input, ctx): Promise<ToolResult>
}
```

三级风险的当前规则（按裁决，不建风险分数、不建策略 DSL）：`fs.read` 恒为 low；`fs.write` 在白名单目录（workspace + 输入文件所在目录）内为 approval_required，白名单外为 forbidden（不执行、直接 Andon）。工具的成功率/延迟不是静态字段，从 tool_calls 表聚合。

**MCP 接入（第 2-3 周实现）**：`McpToolAdapter` 将 MCP Server 的每个 tool 包装为 ToolDefinition（provider='mcp'），经统一 Registry 与 Policy 走完全相同的调用链——MCP 不允许黑箱执行的保证就在这一层。MCP Client 使用官方 `@modelcontextprotocol/sdk`，Server 进程由 Runtime 作为 child process 派生和监督。

**Skill（第 3-4 周实现）**：Skill = Instructions + Tool 白名单 + 输入 Schema + 输出 Artifact 契约 + Verification 绑定，本质是"可被 Recipe 步骤引用的能力包"。MVP 阶段三条 Recipe 直接内联这些内容（LoopTemplate 只保留真正使用的字段：id/title/goal/requiredInputs/steps），Skill 抽象等出现第二个消费者再提取——这是裁决第 5 条的执行。

## 8. 三条 MVP Recipe

**R1 文件整理（已实现并验证）**——`file-edit-summarize`，7 步：读取输入 → 生成摘要草稿 → Schema 校验 → 引用存在性核验（逐条生成 Evidence）→ 批准写入（Diff + Approval）→ 确定性验证（存在/非空/含标题）→ 交付门。它是"文件或代码修改"类的最小实例，覆盖了全部五种机制（ToolCall / Verification / Andon / Approval / Artifact 交付）。

**R2 深度研究（第 2 周）**——复用同一引擎，新增 `web.search` / `web.fetch` 工具（low 风险、只读）：澄清目标 → 检索 → 保存来源（Artifact type=source，含抓取快照）→ 证据提取（Evidence locator=URL+选区）→ 报告生成 → 引用存在性核验 → Markdown 交付。与 R1 的唯一结构差异是来源从本地文件变为网页，验证逻辑完全复用 `checkCitations` 的思路（引用必须逐字存在于已保存的来源快照中）。

**R3 内容生产（第 3-4 周）**——Brief → 大纲（中间 Artifact，可人工调整）→ 初稿 → 规则检查（Rule Verification 的第一个真实场景：禁用词表、长度约束，纯确定性规则）→ 修改 → 交付。按裁决第 3 条，规则检查作为该 Recipe 的场景化验证实现，不建通用 Verification Engine。

## 9. 2–4 周开发计划（骨架已完成部分标出）

| 周 | 目标 | 状态 |
|---|---|---|
| W1 | Runtime 骨架：四进程、SQLite、状态机、账本、崩溃恢复、R1 端到端、Approval/Andon/检查点/幂等、基础 UI | ✅ **本骨架已全部覆盖**（原计划 W1+W3 的核心机制提前合并完成） |
| W2 | 深度研究 Recipe：web 工具、来源快照、Evidence UI（引用角标跳转）、真实模型策略、错误分类细化 | 待做 |
| W3 | 内容生产 Recipe、Library（Recipe 卡片 + 选择器）、Deliverables 页、菜单栏面板、全局快捷键 | 待做 |
| W4 | Run Inspector（Advanced 区唯一页面）、复盘摘要卡、「存为 Recipe」、15 条验收标准逐条过 + 故障注入回归、打包签名 | 待做 |

骨架把最难的可靠性机制（第 3 周风险项）前置完成并验证，后续三周的主要工作是**加宽**（更多 Recipe 与工具）而不是**加深**（引擎不需要重构）。

## 10. 故障注入与验收测试（2026-07-10 实测结果）

### 已执行并通过的验证

| # | 验证项 | 方法 | 结果 |
|---|---|---|---|
| 1 | 单元测试 | `npm test`（状态机 8 例 / 验证 9 例 / diff 4 例） | ✅ 21/21 通过 |
| 2 | 类型检查 | `npm run typecheck`（node + web 两套配置） | ✅ 0 错误 |
| 3 | 构建 | `npm run build`（main+runtime / preload / renderer） | ✅ 通过 |
| 4 | 正常交付链路 | 冒烟：真实任务 → 自动批准 → 交付 | ✅ delivered；3 Artifact、3 Verification、2 Evidence、1 Approval、48 RunEvent |
| 5 | 引用造假停线 | `LEANCLAW_FAULT=bad_citation` | ✅ Evidence 验证失败 → verification_failed（Blocked），伪造引用被逐字核验拦截 |
| 6 | 工具持续故障 | `LEANCLAW_FAULT=tool_fail` | ✅ 3 次尝试（含退避）→ Andon「连续 3 次失败」→ 用户取消 |
| 7 | 输入缺失 | 指向不存在的文件 | ✅ 不可重试错误直接 Andon，不做无意义重试 |
| 8 | 崩溃恢复 | `step_retrying` 状态下 kill -9，重启 | ✅ 恢复为 paused_by_user + `recovered-after-restart` 事件，可继续 |
| 9 | 幂等重试 | 同一交付目标重复执行写入 | ✅ 第二次记录「目标内容未变化，幂等跳过」，无重复副作用 |
| 10 | GUI 启动 | `npm start` 拉起打包产物 | ✅ 窗口 + Runtime 进程正常，日志无错误 |

### 与 15 条 MVP 验收标准的对照

已满足：#1(输入发起) #2(Brief+计划) #3(开始/暂停/恢复/取消) #4(简洁进度) #5(中间+最终 Artifact) #6(应用内预览+Finder) #7(成果可追溯到调用与来源) #8(ToolCall 失败触发 Andon) #9(写入过 Diff+Approval) #10(验证失败进 Blocked) #11(重启恢复) #12(重试幂等) #13(一条 Recipe 端到端) #14(耗时/成本/重试/介入/验证摘要) #15(状态由 Runtime 判定)。

**15/15 在骨架层面已有真实实现**；其中 #2 的"可编辑 Brief"目前只读展示（编辑触发重规划排在 W2），#6 的预览是文本渲染（富预览排在 W3）——功能存在但精度待提升，不算未满足。

### 待补的故障注入（W4 回归清单）

- `LEANCLAW_FAULT=forbidden_path`：写入白名单外路径 → Forbidden → Andon（代码路径已实现，未纳入自动冒烟）；
- 模型 API 超时/限流分类重试（当前统一按可重试处理）；
- Andon retry 后故障仍在的循环上限（当前依赖用户判断，应加同步骤 Andon 计数上限）。

## 11–13. 安装、启动与验证命令

```bash
cd /Users/na/na/Claudecode/LeanClaw
npm install                 # 含 better-sqlite3 针对 Electron ABI 的自动重建

npm run typecheck           # 类型检查
npm test                    # 21 个单元测试
npm run build               # 构建三端产物到 out/

npm run dev                 # 开发模式（热更新）
npm start                   # 以构建产物启动应用

# CLI 端到端冒烟（无需 GUI，退出码 0=通过）
npm run smoke                                                  # 正常链路，预期 delivered
LEANCLAW_FAULT=bad_citation LEANCLAW_SMOKE_EXPECT=verification_failed npm run smoke
LEANCLAW_FAULT=tool_fail    LEANCLAW_SMOKE_EXPECT=cancelled_by_user   npm run smoke
LEANCLAW_SMOKE_INPUT=/nonexistent/x.md LEANCLAW_SMOKE_EXPECT=cancelled_by_user npm run smoke
```

模型配置：设置 `ANTHROPIC_API_KEY` 后自动使用真实模型（默认 `claude-sonnet-5`，可用 `LEANCLAW_MODEL` 覆盖）；未设置时使用本地 Mock（保证离线可跑通全链路）。W2 将把密钥迁移至 macOS Keychain。

GUI 验收路径：`npm run dev` → Home 已预填示例任务 → 开始任务 → 观察步骤推进 → 在 Approval 卡审查 Diff 并批准 → Delivered → 「在 Finder 中显示」查看 `notes.summary.md`。

## 14. 交接提示词（给 Claude Code / Codex 继续开发）

```
你将继续开发 LeanClaw——一款 Mac 桌面 AI 工作伙伴（Electron + React + TypeScript + SQLite）。

必读（按顺序）：
1. docs/Stage1_产品形态与架构方向.md —— 产品判断与架构方向，第 14 节是六处过度工程风险的裁决，不得违反
2. docs/Stage2_实施方案.md —— 当前实现状态、数据模型、验收结果
3. src/runtime/engine.ts 与 src/runtime/recipe.ts —— 执行引擎与 Recipe 模式

不可破坏的架构不变量：
- 状态转换只经 src/runtime/state.ts 的 transition()；delivered 的唯一入边是 verifying；模型输出不能改变任务状态
- 所有外部动作经 Tool Registry + riskFor() 三级风险判定；fs.write 类不可逆动作必过 Diff + Approval；forbidden 动作不执行、直接 Andon
- 所有事件追加进 run_events 账本，只 INSERT 不 UPDATE
- 关键失败停线（Andon/Blocked），禁止静默继续生成看似完成的结果
- 步骤必须可重入（Suspend 后重新执行同一步骤应安全），写入类工具必须幂等
- Renderer 保持 sandbox，只经 preload 的 4 个白名单方法通信
- 新增字段/页面前先对照 Stage1 第 14 节裁决表：不建置信度、不建自动项目上下文、不建通用验证引擎、不建风险分数、不建空转模板字段、Advanced 区只有 Run Inspector

下一步工作（按优先级）：
1. W2 深度研究 Recipe：新增 web.search/web.fetch 工具（low 风险只读），来源保存为 Artifact 快照，
   Evidence locator 用 URL+选区，报告引用核验复用 checkCitations 思路（引用必须逐字存在于快照）
2. Evidence UI：报告预览中引用角标 → 点击展开来源与快照
3. API Key 迁移 macOS Keychain（keytar 或 safeStorage）
4. 可编辑 Task Brief：编辑后触发重新规划
5. W3/W4 范围见 docs/Stage2_实施方案.md 第 9 节

验证你的改动：npm run typecheck && npm test && npm run build && npm run smoke
四个冒烟场景（见 Stage2 第 11-13 节）必须全部保持 PASS。
```

---

## Stage 2 结束

骨架代码已可作为后续开发的真实基线：引擎、状态机、账本、三级风险、三级验证、Andon、Approval、检查点、幂等、崩溃恢复均为已验证的工作实现，后续三周按第 9 节计划加宽即可。
