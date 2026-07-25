# LeanClaw 产品 Phase 2：Agent 协作与运行可见性

> 版本：v0.1  
> 日期：2026-07-23  
> 状态：**✅ 已通过用户最终验收，Product Phase 2 关闭**  
> 验收日期：2026-07-24  
> 产品范围：本机单用户版  
> 前置基线：[Stage1_产品形态与架构方向.md](Stage1_产品形态与架构方向.md)、[Stage2_实施方案.md](Stage2_实施方案.md)、[产品开发文档_v1.md](产品开发文档_v1.md)、[审计与交接.md](审计与交接.md)

---

## 0. 文档定位

仓库中已有的 `Stage2_实施方案.md` 是 2026-07-10 的工程骨架历史文档，描述已经完成的 Runtime、状态机、账本、验证、Approval 和 Andon，不得覆盖或改写。

本文定义的是 **MVP 主干完成后的第二个产品阶段（Product Phase 2）**。它吸收 Multica 的一等 Agent、统一活动时间线、Runtime 控制台、行动收件箱和自动化运行历史等产品思路，但保持 LeanClaw 的本机单用户定位、TPS 控制层和隐私边界。

本文曾作为实现前验收门；2026-07-23 已按 [phase2-tasks/00_任务总览.md](phase2-tasks/00_任务总览.md) 的依赖顺序完成 T01–T10 工程实现与验证，2026-07-24 经用户明确验收通过后正式关闭。本次验收不代表自动进入下一阶段。

## 1. 当前可信基线

截至 2026-07-23，仓库已经具备：

- Electron + React + TypeScript + SQLite 本机架构；
- Task → Run → Step → 调用/产物/验证的执行主链；
- 14 个内部状态与 9 个用户可见状态；
- WIP 调度、预算、Approval、Andon、检查点、故障转移和崩溃恢复；
- 三条内置 Recipe、规则集、自定义线性 Recipe、Projects、Deliverables；
- 定时任务、富预览、版本对比、命令面板、全局快速输入；
- Provider、模型分层路由、MCP、受控 Shell；
- 本机日志、隐私安全诊断包、ad-hoc `.app` / DMG / ZIP；
- 高密度 Tasks 列表/看板和新的桌面工作台壳层；
- Schema v12、326 个单元测试、43 条 Electron E2E，以及 s1–s18 冒烟基线。

本阶段不重复建设以上能力。

## 2. 问题定义

LeanClaw 已经能可靠地“执行任务”，但用户目前仍需要从多个页面和技术名词中推断以下问题：

1. **是谁在做？**  
   任务只有 Recipe、Provider、模型和 Project，没有稳定的执行者身份。用户无法把一组指令、默认能力和预算理解为一个可复用的 Agent。

2. **刚才发生了什么？**  
   `run_events` 已经完整记账，但主要暴露在 Run Inspector。普通任务页没有一条面向用户的统一活动时间线。

3. **本机现在能不能做？**  
   Provider、MCP、Shell、调度器和 Runtime 进程状态分散在设置页、日志和侧栏状态点，缺少一眼可判断的运行时总览。

4. **现在最需要我处理什么？**  
   Approval、Andon、验证失败和预算停线都有真实数据，但缺少一个跨任务的行动收件箱。

5. **自动化最近是否正常？**  
   Schedule 能按时触发，但缺少集中页面、运行历史、最近结果和“立即运行”。

## 3. 阶段目标

本阶段完成后，用户应能在 30 秒内回答：

- 我有哪些 Agent，它们各自擅长什么、使用哪套默认能力？
- 某个任务由谁执行、当前在做什么、最近发生了什么？
- 哪些事项正在等我批准或处理？
- 本机 Provider、MCP、Shell、调度器是否可用？
- 每个自动化最近一次是否成功，下次什么时候运行？

产品体验从“可靠的任务执行器”升级为“可管理、可解释的本机 Agent 工作台”。

## 4. 非目标

以下能力明确不进入 Product Phase 2：

- 多用户 Workspace、组织、成员角色和权限系统；
- 聊天、评论、@mention、订阅和社交式动态；
- Squad、多 Agent 自动委派和 Agent 互相创建任务；
- 云 Runtime、远程机器管理和第三方托管执行；
- 自动扫描 Claude Code、Codex 等本机 CLI；
- webhook 入站触发；
- Agent Marketplace、在线 Skill 商店；
- 自定义头像上传、拟人动画和无功能意义的员工化装饰；
- 通用策略 DSL、风险评分、工作流画布；
- 正式签名、公证、自动更新和跨平台支持。

这些能力只有在本阶段真实使用数据证明需要后，才进入下一阶段评估。

## 5. 产品原则

### 5.1 Agent 是执行配置，不是虚构人格

Agent 是一组稳定、可复用、可审计的执行偏好：

- 名称与用途；
- 稳定指令；
- 默认 Recipe；
- 默认预算；
- 最大并发；
- 启用状态。

首版不让 Agent 覆盖全局工具风险和 Provider 密钥，不把它包装成聊天角色。

### 5.2 Task 与 Run 继续使用现有语义

- **Task**：用户持续验收和修改的工作目标；
- **Run**：Task 的一次执行上下文；
- **Step**：Run 内的确定性步骤；
- **Activity**：已有事件账本的人类可读投影。

不为模仿其他产品新建 Issue 表，也不复制一套并行状态机。

### 5.3 同一事实只保存一次

- Activity Feed 读取 `run_events`，不另建动态表；
- Need You 收件箱从 Task、Approval、Andon、Verification 投影；
- 自动化历史从 `tasks.schedule_id` 和现有 Run 数据投影；
- Runtime 中心聚合现有 Provider、MCP、Shell、调度和进程健康数据。

除 Agent 身份与事件 actor 元数据外，不复制已有数据。

### 5.4 本机优先和安全边界不后退

- API Key、MCP env 继续加密且不回显；
- Renderer 继续 sandbox；
- Agent 指令不能绕过 Tool Registry、Approval、Andon、预算或验证；
- Agent 删除不能破坏历史任务；
- Runtime 页面不得展示密钥、完整命令输出、任务正文或私有路径。

### 5.5 可见性服务于行动

页面不追求“监控大屏”。每个状态必须能回答：

- 是否正常；
- 如果不正常，影响什么；
- 用户下一步能做什么；
- 去哪里查看证据。

## 6. 核心对象与语义

### 6.1 Agent

建议字段：

| 字段 | 语义 |
|---|---|
| id | 稳定 ID |
| name | 1–40 字符，唯一 |
| description | 用途说明，最多 240 字符 |
| instructions | 稳定执行指令，最多 10,000 字符 |
| default_recipe_id | 默认 Recipe，可为空 |
| default_budget_usd | 默认预算，可为空 |
| max_concurrent_runs | 1–3，默认 1 |
| enabled | 是否可被新任务选择 |
| created_at / updated_at | 审计时间 |

任务创建时写入：

- `tasks.agent_id`：历史归属；
- `tasks.agent_name_snapshot`：Agent 改名或删除后仍可解释；
- `tasks.agent_instructions_snapshot`：执行使用创建时快照。

规则：

- 旧任务迁移后 `agent_id = NULL`，显示“默认执行器”；
- Agent 指令在模型调用边界注入，位置在 Project Saved Instructions 之后、用户目标之前；
- Agent 后续修改不改变已创建任务；
- 被任务或 Schedule 引用的 Agent 不物理删除；
- 停用 Agent 不出现在新任务选择器，但历史 Task 可继续运行和回看；
- 如果仍有启用中的 Automation 引用 Agent，停用操作必须被拒绝，并提示用户先暂停或改绑这些 Automation；
- 已停用 Agent 关联的暂停 Automation 不能重新启用，直到 Agent 被重新启用或 Automation 完成改绑；
- Agent 默认 Recipe、预算只是创建表单默认值，用户可在单次任务中覆盖。

### 6.2 Activity

Activity 不是新实体，是 `run_events` 的产品投影。建议只给事件补充可选 actor：

| 字段 | 语义 |
|---|---|
| actor_type | `user` / `agent` / `system` |
| actor_id | Agent ID，可为空 |
| actor_name_snapshot | 事件发生时显示名 |

旧事件没有 actor 时按事件映射为 `system` 或“你”，不得伪造某个 Agent。

首版 Feed 展示：

- 任务创建、开始、暂停、继续、停止、归档；
- Brief 编辑、增量修改；
- Agent 开始执行；
- Step 开始/完成/失败；
- Approval 请求与处理；
- Andon 打开与处理；
- 模型 fallback、预算预警/停线；
- 验证通过/失败；
- Deliverable 交付。

原始 payload、模型调用和工具输出继续留在 Run Inspector；Feed 只展示摘要和窄入口。

### 6.3 Runtime Overview

Runtime 中心只描述当前本机，不创建虚假机器列表。首版分为：

- **本机 Runtime**：ready / busy / degraded / offline；
- **任务调度**：活跃数、WIP 上限、排队数；
- **Provider**：是否配置、默认模型、最近测试结果；
- **MCP**：连接状态、工具数、错误摘要；
- **Shell**：关闭 / 需批准 / 白名单数量；
- **近 7 日使用**：Run 数、模型调用、工具调用、tokens、成本。

状态规则必须由纯函数计算并测试，UI 不自行猜测。

### 6.4 Need You Item

Need You 是只读投影，不建 inbox 表。类型：

- `approval`：待批准写入或工具动作；
- `andon`：可在应用内选择恢复动作；
- `verification_failed`：需从检查点重试或取消；
- `blocked`：需要界面外处理后回来重试；
- `budget`：预算不足，可追加预算。

每项必须包含：任务、类型、原因、发生时间、主要动作和查看任务入口。

### 6.5 Automation

沿用 `schedules`：

- Automation 是用户可见名称；
- Schedule 是内部数据结构；
- 每次触发仍创建普通 Task，并经过相同的 Agent、WIP、预算、Approval、Andon 和 Verification；
- 历史由 `tasks.schedule_id` 关联，不新建 run-history 表。

首版新增：

- 独立 Automation 页面；
- 最近一次状态与最近五次任务；
- “立即运行”；
- 下次运行时间；
- 启用、暂停、编辑、删除；
- 失败时进入 Need You；
- Agent 停用前必须先暂停或改绑引用它的 Automation。

## 7. 信息架构

建议侧边栏：

```text
工作区
├── 发起任务
├── 任务
├── 需要你处理
├── 项目
├── Agent
└── 自动化

资料与交付
├── 交付物
└── 能力库

系统
├── 运行时
├── 运行检查
└── 设置
```

规则：

- “需要你处理”显示真实待办数量；
- “Agent”只显示启用数量或不显示计数，不显示虚假在线状态；
- “运行时”显示一个健康圆点；
- Settings 保留配置入口；Runtime 负责状态观察，不复制编辑表单；
- Home 继续优先展示少量 Need You 和进行中任务，不变成仪表盘。

## 8. 核心用户流程

### 8.1 创建 Agent 并发起任务

1. 用户进入 Agent Center；
2. 创建 Agent，填写名称、用途、稳定指令、默认 Recipe、预算和并发；
3. 回到“发起任务”，选择 Agent；
4. 表单自动带出默认 Recipe 和预算，用户可覆盖；
5. 创建 Task 时固化 Agent 快照；
6. Task 卡片、详情和 Activity Feed 显示执行者。

健康标准：Agent 只减少重复配置，不增加启动任务的必填项。未创建 Agent 时原路径必须继续可用。

### 8.2 从 Activity Feed 理解一次任务

1. 用户打开 Task；
2. 首屏看到当前状态、执行者和最近活动；
3. Activity 解释“何时开始、正在做什么、为何等待”；
4. 点击 Step/Approval/Verification 活动跳到对应 Focus 卡或 Run Inspector；
5. 需要原始技术数据时再进入 Run Inspector。

健康标准：用户不打开 Inspector 也能理解主过程；Feed 不泄漏 prompt、密钥和完整工具输出。

### 8.3 处理 Need You

1. 侧边栏出现待办数量；
2. 用户进入收件箱；
3. 默认按紧迫度和时间排序；
4. 在列表内直接批准、拒绝、重试、追加预算或取消；
5. 处理后该项退出列表，Task 正常恢复；
6. 双击或“查看任务”进入完整上下文。

健康标准：所有动作复用现有 RPC 和状态机，不从 UI 直接改状态。

### 8.4 检查 Runtime

1. 用户看到侧边栏 Runtime 健康点异常；
2. 打开 Runtime 中心；
3. 页面指出是 Provider、MCP、Shell、调度还是 Runtime 进程问题；
4. 可执行的动作只有“测试连接”“前往设置”“查看诊断”；
5. 页面不提供绕过风险等级或直接执行工具的入口。

### 8.5 检查自动化

1. 用户进入 Automation；
2. 看到启用状态、下次运行、最近结果；
3. 点击“立即运行”产生一条普通 Task；
4. 从历史进入 Task 查看 Activity、证据和交付；
5. 失败项同时出现在 Need You。

## 9. 功能范围

### P2-F1 Agent 基础与 Agent Center（P0）

- Agent CRUD、停用、历史引用保护；
- Agent 指令与默认值；
- 任务 Agent 选择器与快照；
- Task 列表、看板、详情显示 Agent；
- Schedule 可选择 Agent；
- 旧数据兼容默认执行器。

### P2-F2 Activity Feed（P0）

- actor 元数据；
- 事件 → 活动摘要投影；
- Task 详情时间线；
- Activity 到 Focus/Inspector 的窄入口；
- 归档事件显示摘要，不恢复已压缩明细。

### P2-F3 Runtime Center（P0）

- 本机 Runtime 状态；
- 调度、Provider、MCP、Shell 总览；
- 近 7 日本机使用摘要；
- 测试连接、前往设置、导出诊断入口；
- 侧边栏健康指示。

### P2-F4 Need You Inbox（P0）

- 聚合 Approval、Andon、验证失败、Blocked、预算；
- 直接处理；
- 侧边栏计数；
- Home 复用同一投影；
- 空状态和并发更新。

### P2-F5 Automation Center（P1）

- 独立页面；
- 运行历史与最近结果；
- 立即运行；
- Agent 绑定；
- 失败进入 Need You；
- 旧 Home Schedule 管理区迁移后只保留快捷入口。

## 10. 工程边界

### 10.1 允许的 Schema 变化

建议迁移：

- v9：`agents` 表；
- v10：`tasks` 增加 Agent ID 与快照字段，`schedules` 增加 `agent_id`；
- v11：`run_events` 与 `run_events_archive` 增加可选 actor 字段。

实现时可合并相邻迁移，但必须：

- 版本严格递增；
- 旧数据库原地升级；
- 新装数据库直接得到相同最终 Schema；
- 迁移可重复检查，不依赖手工数据修复；
- 不修改历史事件含义。

### 10.2 RPC 边界

建议新增窄 RPC：

- `listAgents`
- `saveAgent`
- `setAgentEnabled`
- `deleteAgent`（仅无历史引用时允许）
- `getTaskActivity`
- `getRuntimeOverview`
- `listNeedYouItems`
- `triggerScheduleNow`
- `getScheduleHistory`

现有 Approval、Andon、预算和 Provider 测试 RPC 必须复用。

### 10.3 推送

首版继续使用任务快照推送。只有 Runtime Overview 或待办计数无法通过任务推送及时更新时，才允许扩展判别联合：

- `{ type: 'runtime'; overview }`
- `{ type: 'inbox'; count }`

不得引入通用事件总线协议。

## 11. 视觉与交互要求

- 延续现有暖灰工作台、细边框、低饱和状态色和 270px 看板列；
- Agent 头像首版只用首字母 + 稳定色，不上传图片、不使用 emoji；
- 活动时间线默认紧凑，技术详情折叠；
- Runtime Center 使用状态列表和小型指标卡，不做大面积装饰图表；
- Need You 的主要动作必须键盘可达；
- 所有状态不能只用颜色表达，必须有文字或图形标签；
- 支持 900×600 最小窗口；
- 支持 `prefers-reduced-motion`；
- 新页面必须有空状态、加载态、错误态和不可用态。

## 12. 隐私、安全与数据治理

- Agent instructions 属于任务敏感内容，进入数据库但不进入诊断包；
- Activity payload 必须经过类型化摘要，禁止直接渲染原始 JSON；
- Runtime Overview 不显示 API Key、MCP env 值、完整私有路径或命令输出；
- 使用统计只在本机聚合，不接遥测；
- Agent 指令必须经过现有模型输入拼装函数注入，不允许 Renderer 拼 prompt；
- “立即运行”必须复用正常创建/启动链，不能绕过调度器；
- 任何删除必须先检查 Task/Schedule 引用；
- 归档任务只展示现有事件摘要，不为 Feed 复制恢复原始事件。

## 13. 成功标准

本阶段不使用在线遥测。验收以可复现实验为准：

1. 新建 Agent → 发起任务 → Approval → Delivered 全链路通过；
2. 修改 Agent 后，旧 Task 仍显示并使用旧快照；
3. 停用 Agent 后不能用于新任务，但历史不丢；
4. Task Activity 能完整解释主路径和三条异常路径；
5. Need You 能处理 Approval、Andon、验证失败和预算停线；
6. Runtime Center 能区分 Provider 未配置、MCP 错误、Shell 关闭和正常状态；
7. 自动化“立即运行”和定时触发均走同一任务链；
8. 旧数据库升级后原任务、交付物、事件和 Schedule 不丢；
9. 900×600 下所有新页面可操作；
10. 现有 326 单测、43 E2E、s1–s18 与打包契约不回退。

## 14. 里程碑与依赖

```text
M1 Agent 身份
  T01 Agent 领域与迁移
  T02 Agent Center
  T03 Task / Schedule 绑定

M2 可解释活动
  T04 Activity 数据契约
  T05 Task Activity Feed

M3 运行与行动
  T06 Runtime Overview
  T07 Runtime Center
  T08 Need You Inbox

M4 自动化与收口
  T09 Automation Center
  T10 集成回归与文档收口
```

允许并行：

- T02 与 T03 在 T01 后可分开实现，但共同修改 `shared/types.ts` 时必须串行合并；
- T06 可与 T04/T05 并行；
- T08 只依赖 T03，可与 T04–T07 并行；
- T09 在 T03 完成 Schedule Agent 绑定后开始。

## 15. 阶段验收门

每个任务必须单独通过：

- 先写失败测试，再实现；
- `npm run typecheck`
- `npm test`
- `npm run build`
- 相关 Electron E2E；
- 受影响的 s1–s18 冒烟；
- 新 UI 的稳定帧截图与最小窗口检查；
- 无 Renderer console error / page error；
- 文档记录实测结果和未测边界。

阶段最终门：

- 全量单测、全量 E2E、s1–s18、本机打包契约通过；`npm audit` 剩余 2 个仅影响 Windows `serve-static` 的 moderate 传递依赖告警，未采用会强制降级 MCP SDK 的 `--force` 修复；
- 新增至少 5 条 Electron E2E：Agent、Activity、Runtime、Need You、Automation；
- 新增至少 2 条冒烟：Agent 快照、立即运行；
- 数据库从 v8 真实升级一次；
- `.app` 本机启动与核心路径复验；
- 用户完成产品验收。

## 16. 主要风险与控制

| 风险 | 控制 |
|---|---|
| Agent 变成另一套 Provider/权限系统 | 首版只保存指令、默认 Recipe、预算和并发；权限继续全局统一 |
| Activity Feed 复制账本造成两套事实 | Feed 只投影 `run_events` |
| actor 回填伪造历史 | 旧事件没有证据时显示 System/你，不指认 Agent |
| Runtime 中心滑向虚假监控 | 只展示可从本机读取的状态，不画云机器 |
| Need You 直接改状态 | 所有动作复用现有 RPC |
| Schedule “立即运行”绕过安全链 | 复用 `createTask → startTask → scheduler.requestRun` |
| 新导航让侧栏过密 | 分三组，任务/行动/系统按频率排序，最小窗口实测 |
| Multica 许可证和界面相似风险 | 只吸收产品抽象，独立设计与实现，不复制源码、品牌或资产 |

## 17. 本阶段的产品裁决

以下裁决作为用户验收重点：

1. Agent 首版是执行配置，不是聊天人格；
2. 沿用现有 Task / Run，不新建 Issue；
3. Runtime Center 只管理当前本机；
4. Need You 是实时投影，不建消息数据库；
5. Automation 首版不含 webhook；
6. 多用户、聊天、@mention、Squad、云 Runtime 全部延期；
7. 本阶段先完成可靠性和可解释性，不增加联网服务。

## 18. 任务文档

具体任务、依赖、修改范围、测试和验收标准见：

- [00 任务总览](phase2-tasks/00_任务总览.md)
- [T01 Agent 领域模型与数据库迁移](phase2-tasks/T01_Agent领域模型与数据库迁移.md)
- [T02 Agent Center 页面](phase2-tasks/T02_Agent_Center页面.md)
- [T03 Task 与 Automation 的 Agent 绑定](phase2-tasks/T03_Task与Automation的Agent绑定.md)
- [T04 Activity 数据契约与投影](phase2-tasks/T04_Activity数据契约与投影.md)
- [T05 Task Activity Feed](phase2-tasks/T05_Task_Activity_Feed.md)
- [T06 Runtime Overview 服务](phase2-tasks/T06_Runtime_Overview服务.md)
- [T07 Runtime Center 页面](phase2-tasks/T07_Runtime_Center页面.md)
- [T08 Need You Inbox](phase2-tasks/T08_Need_You_Inbox.md)
- [T09 Automation Center](phase2-tasks/T09_Automation_Center.md)
- [T10 集成回归与阶段收口](phase2-tasks/T10_集成回归与阶段收口.md)
