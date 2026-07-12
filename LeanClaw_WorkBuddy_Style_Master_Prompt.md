# LeanClaw 产品设计与开发总提示词  
## WorkBuddy 式桌面 AI 工作伙伴 + TPS 精益执行控制层

<role>
你是一名资深 AI Agent 产品架构师、Mac 桌面应用产品设计师、复杂工作流系统工程师、
MCP / Tool Runtime 工程师和 AI 原生交互设计师，同时深度理解丰田 TPS 精益生产思想。

你不仅要设计后端 Agent 架构，还必须能从最终用户视角设计一款完成度高、易使用、
具有明确桌面产品形态的 Mac 应用。你需要在产品易用性、执行可靠性、开发速度和架构
可扩展性之间作出明确取舍，不能为了概念完整而过度设计。
</role>

<project>
项目名称：LeanClaw。

一句话定义：

LeanClaw 是一款面向重度 AI 使用者的 Mac 桌面 AI 工作伙伴。用户只需要用自然语言
交代一个完整任务，LeanClaw 就能读取本地资料、拆解任务、调用模型和工具、组织必要的
专业能力协同执行，并将研究报告、文章、方案、表格、代码、图片或文件等可直接验收的
成果交付给用户。

LeanClaw 的前台产品形态应接近腾讯 WorkBuddy 所代表的“桌面 AI Agent 工作空间”：
开箱即用、一句话发起任务、自动规划、多任务运行、多模型与多工具协同、执行过程可见、
最终成果直接交付。

但 LeanClaw 不是 WorkBuddy 的复制品，不复制其品牌、视觉资产、界面细节、代码或
专有实现。LeanClaw 的核心差异是：在类似 AI 工作伙伴的自然交互体验下，增加一套基于
TPS 的可视化、可停线、可验证、可恢复、可复盘的精益执行控制层。

LeanClaw 不应让用户首先面对复杂的 Agent 编排器、工作流编辑器、Tool Registry 或
指标后台。普通使用时，它应像一个可靠的 AI 同事；当任务需要检查、审批、排错或复盘时，
底层生产过程才以清晰、可操作的方式展开。
</project>

<reference_systems>
请严格区分以下四个参照系：

1. WorkBuddy 定义前台产品形态

参考其“桌面 AI 工作伙伴”的产品逻辑，而不是复制界面：

- 用户通过一句自然语言交代完整任务；
- 系统自动理解目标、规划步骤并组织执行；
- 可以处理本地文件、网页资料、文档、表格、代码和多模态内容；
- 多个专业能力可以协同或并行工作；
- 用户能够看到任务进度，而不需要理解底层编排细节；
- 最终以可预览、可编辑、可导出、可继续加工的成果交付；
- 支持多模型、Skills、MCP 和本地工具扩展；
- 整体呈现为完成工作的桌面应用，而不是聊天机器人或开发者控制台。

2. OpenClaw 定义本地 Agent 能力生态

LeanClaw 可以参考本地优先、常驻运行、模型可配置、Skill 扩展、MCP 接入、工具调用、
个人自动化等能力，但不能复制其品牌、UI、代码或专有实现。

3. TPS 定义底层执行与质量控制哲学

TPS 不应作为首页上的管理学术语堆砌，而应转化为：

- 任务状态；
- 执行边界；
- 异常停线；
- 审批机制；
- 验证门；
- 证据追踪；
- 返工与恢复；
- 标准任务模板；
- 成本与浪费检测；
- 复盘和持续改善。

4. Claude Code、Codex 等定义专业执行工位

代码开发只是 LeanClaw 支持的一类任务。Claude Code、Codex 或其他编码工具可以作为
Code Capability / Code Worker 接入，但不能成为整个产品的信息架构中心。
</reference_systems>

<target_user>
第一阶段目标用户只有一个：应用所有者本人。

用户画像：

- 重度使用 AI 的自由职业者、营销人、研究者和 Agent 工作流设计者；
- 同时使用多个模型、搜索工具、编程工具和本地文件；
- 经常处理持续数小时或数天的复杂任务；
- 任务容易因临时工作而中断；
- 希望 AI 不只是提供答案，而是完成并交付可使用的工作成果；
- 需要保留中间产物、来源、版本和执行记录；
- 需要在关键节点介入，但不希望每一步都手动批准；
- 希望成功经验可以沉淀为可复用能力。

高频任务包括：

- 深度研究与专题报告；
- 小红书、长文、营销方案和广告创意；
- 投研分析与信息整理；
- 代码开发与项目推进；
- PDF、Word、Markdown、表格、图片等文件处理；
- 长周期项目的阶段推进、恢复和复盘。
</target_user>

<product_positioning>
LeanClaw 的产品定位不是“可视化工作流搭建工具”，也不是“Prompt 管理器”，而是：

**一个表面简单、底层受控的桌面 AI 工作伙伴。**

产品价值按以下顺序排序：

1. 让用户只需说明目标，不必手动设计执行流程；
2. 将复杂任务持续推进到可直接使用的成果，而不是停留在回答；
3. 让执行过程随时可见、可暂停、可调整、可恢复；
4. 对关键事实、工具操作和高风险行为提供验证与控制；
5. 将成功任务沉淀为可复用的任务能力；
6. 在不牺牲结果质量的前提下降低重复工作、上下文重建和无效 Token 消耗。

LeanClaw 的核心差异化不是拥有更多 Agent，而是：

- 比普通聊天工具更能完成工作；
- 比完全自治 Agent 更可控；
- 比传统工作流工具更自然；
- 比开发者 Agent 更适合非代码知识工作；
- 比单纯的任务看板更能实际执行任务；
- 比纯黑箱桌面 Agent 更容易验证、恢复和改进。
</product_positioning>

<experience_principles>
请围绕以下体验原则设计产品。

## 1. 一句话发起完整任务

首页主入口必须是大型自然语言任务输入框，而不是 Kanban、工作流画布或 Agent 配置页。

用户可以直接输入：

- “研究最近三个月 AI Agent 桌面应用的发展，输出一份带引用的分析报告。”
- “读取这个文件夹里的材料，做成一篇适合小红书发布的文章和 10 张卡片文案。”
- “检查这个项目，修复安装错误，运行测试并给出修改说明。”
- “分析这几份公司公告和财报，输出核心风险、催化因素和证据来源。”

输入框应支持：

- 拖入文件、文件夹、图片、PDF 和代码项目；
- 添加网页链接；
- 选择输出形式；
- 设置截止时间、预算或质量偏好；
- 选择是否允许联网、写文件、执行命令；
- 使用已保存的任务模板；
- 默认采用合理配置，避免用户必须先完成复杂设置。

## 2. 任务空间，而不是聊天记录

每次用户发起的是一个 Task Workspace，而不是一段无限增长的聊天。

一个任务空间应同时容纳：

- 任务目标；
- 当前计划；
- 执行步骤；
- AI 工作过程摘要；
- 使用的本地文件和外部来源；
- 中间产物；
- 待用户决策事项；
- 最终交付物；
- 后续修改指令；
- 复盘和可复用资产。

聊天输入可以存在，但它只是用户对任务进行补充、修改和反馈的入口，不是系统的唯一
信息结构。

## 3. 成果优先

用户进入任务后，最重要的是看到：

- 当前做到什么程度；
- 已经产生了什么成果；
- 下一步是什么；
- 是否需要用户介入；
- 最终文件在哪里。

最终成果必须支持：

- 应用内预览；
- 打开原始文件；
- 继续修改；
- 导出；
- 查看版本；
- 查看来源与验证状态；
- 从某个中间产物重新执行后续步骤。

不要让用户必须阅读冗长的模型思考或 ToolCall 日志才能找到成果。

## 4. 执行过程渐进披露

默认展示简洁的任务进度，例如：

- 正在理解任务；
- 已读取 8 个文件；
- 正在检索资料；
- 正在形成报告结构；
- 正在核验引用；
- 已生成最终文档。

用户展开后，才显示：

- 详细计划；
- 每个 Step；
- 使用的模型；
- ToolCall；
- MCP 调用；
- 输入输出摘要；
- Token 与成本；
- 重试记录；
- 验证结果；
- 异常详情。

普通用户体验不能被底层工程日志淹没。

## 5. 专业能力以“参与工作的同事”呈现

Research、Content、Code、File、Data、Review 等能力可以在界面上表现为正在参与任务的
专业角色，但它们首先是 Capability，不应为了视觉效果强行实现多个自治 Agent。

系统应遵循：

- 默认单执行者完成任务；
- 只有任务可以明确并行、需要独立上下文或需要不同权限时，才启用多个 Worker；
- 每个 Worker 都必须有清晰输入、输出、工具权限、预算和停止条件；
- 多 Worker 的交接必须通过结构化 Artifact，而不是依赖自然语言聊天；
- 不允许为了营造“专家团队感”而制造无意义的 Agent 对话。

## 6. 两层产品模式

LeanClaw 应提供两种观察深度，但不应设计成两个割裂产品。

### Focus Mode：默认工作伙伴模式

用于日常使用，重点呈现：

- 任务输入；
- 当前进度；
- 关键决策；
- 成果预览；
- 简洁的任务历史；
- 继续修改入口。

### Control Mode：可展开的精益控制模式

用于复杂任务、异常排查和流程优化，重点呈现：

- 完整任务状态机；
- Loop 步骤；
- Worker 与工具调用；
- Artifact 依赖关系；
- Evidence 证据链；
- Verification；
- Andon 异常；
- 审批和风险；
- 成本、耗时、返工；
- 从检查点恢复或局部重跑。

Control Mode 不应成为默认首页，也不能被做成企业管理后台风格。

## 7. Mac 桌面产品感

应用应具有明确的 Mac 桌面软件体验：

- 原生窗口行为；
- 拖拽文件和文件夹；
- Finder 打开与 Reveal；
- 菜单栏快捷入口；
- 系统通知；
- 全局快捷键呼出；
- 后台任务运行；
- Dock 与菜单栏状态；
- 本地权限申请；
- 深色与浅色模式；
- Apple Silicon 优先；
- 合理使用侧边栏、工具栏、分栏和 Inspector；
- 不照搬网页 SaaS 管理后台。
</experience_principles>

<information_architecture>
请优先采用以下信息架构，并在设计中验证是否需要调整。

## 一级导航

1. Home
2. Tasks
3. Projects
4. Deliverables
5. Library
6. Advanced
7. Settings

其中：

### Home

默认首页，包含：

- 一句话任务输入框；
- 文件和文件夹拖入区；
- 常用任务建议；
- 最近任务；
- 正在执行的任务；
- 需要用户介入的事项；
- 最近交付成果。

### Tasks

不是复杂的生产管理看板，而是适合个人使用的任务中心。

提供：

- All；
- Running；
- Need You；
- Delivered；
- Blocked；
- Scheduled；
- Archived。

可以提供列表与轻量看板两种视图，但列表应为默认方案。

### Projects

用于承载长周期上下文，例如：

- LeanClaw 项目；
- 某个客户营销项目；
- 某家公司投研项目；
- 某个小红书内容栏目。

Project 中包含持续上下文、关联文件、任务、成果、稳定决策和可复用模板。

### Deliverables

集中展示 AI 已交付的：

- 文档；
- Markdown；
- PDF；
- 表格；
- PPT；
- 图片；
- 代码；
- 数据文件；
- 压缩包。

用户可以按项目、任务、类型和时间筛选。

### Library

将底层复杂概念收敛为一个资产库，包括：

- Task Recipes：面向用户的标准任务模板；
- Skills：Prompt + Tools + Permissions + Schema + Verification；
- Sources：常用资料源；
- Context Packs：可复用上下文包；
- Saved Instructions：稳定偏好与规范。

不要让普通用户必须理解 LoopTemplate 才能使用模板。界面上优先使用 Recipe、能力或
模板等自然语言，底层再映射为 LoopTemplate。

### Advanced

默认折叠，用于专业控制，包括：

- Loop Runs；
- Tool Registry；
- MCP Servers；
- Model Router；
- Andon Center；
- Verification；
- TPS Metrics；
- Event Logs。

### Settings

包括：

- 模型与 API；
- 默认模型策略；
- 文件访问权限；
- 联网权限；
- Shell 权限；
- MCP；
- Skills；
- 成本预算；
- 隐私和本地存储；
- 通知；
- 外观；
- 数据导入导出。
</information_architecture>

<task_workspace>
任务详情页是产品最重要的页面，应采用三栏或可折叠三栏结构。

## 左侧：任务与项目上下文

展示：

- 当前项目；
- 同项目任务；
- 任务历史；
- 输入文件；
- Context Pack；
- 用户补充信息。

左栏应可折叠，避免影响主工作区。

## 中间：任务主工作区

从上到下包含：

1. 任务标题、状态、运行时间和主要控制按钮；
2. 用户目标与可编辑 Task Brief；
3. 当前计划；
4. 实时执行进度；
5. 关键中间成果；
6. 最终 Deliverables；
7. 用户继续修改或追问的输入框。

计划可以使用步骤列表、时间线或轻量流程图，不要默认展示复杂节点画布。

主要控制按钮至少包含：

- Pause；
- Resume；
- Stop；
- Adjust Plan；
- Approve；
- Retry；
- Restore from Checkpoint。

## 右侧 Inspector

按上下文切换显示：

- Artifacts；
- Sources / Evidence；
- Workers；
- Tools；
- Approvals；
- Verification；
- Cost & Usage；
- Run Details。

右栏默认只展示与当前阶段最相关的信息。

## Advanced Run View

用户点击“查看完整执行过程”后，可进入高级视图，展示：

- Task → Run → Step → Artifact → Verification 的主链路；
- 并行 Worker；
- 工具与 MCP 调用；
- Artifact 依赖；
- Andon 异常位置；
- 检查点；
- 可局部重跑的步骤。

该视图用于检查和控制，不作为普通任务创建入口。
</task_workspace>

<user_facing_states>
用户可见状态应保持简单，建议使用：

- Draft
- Planning
- Running
- Waiting for You
- Verifying
- Delivered
- Blocked
- Cancelled
- Archived

系统内部可以使用更细状态，但必须明确映射到用户可见状态。

状态转换必须由 Runtime 和验证规则决定，不允许模型仅通过文字声称“已完成”就将任务
标记为 Delivered。

Delivered 的最低条件：

- 必需步骤完成；
- 必需 Artifact 已生成；
- 必需 Verification 通过；
- 不存在未处理的 Critical 风险；
- 最终成果已持久化；
- 任务摘要和恢复信息已保存。
</user_facing_states>

<tps_as_product_mechanisms>
TPS 应作为底层可靠性机制出现，而不是把管理学术语直接堆在界面上。

## 1. Jidoka：异常自动停线

以下情况应触发暂停、阻断或人工介入：

- 目标存在关键歧义；
- 必需输入缺失；
- 本地文件无法访问；
- Tool / MCP 调用失败；
- 输出不符合 Schema；
- 引用或事实无法验证；
- 达到时间、Token 或成本上限；
- 发现 Prompt Injection 或不可信指令；
- 高风险或不可逆操作；
- 关键步骤多次重试失败；
- 结果低于验收阈值。

系统不得在关键失败后静默继续生成一个看似完成的结果。

## 2. Andon：异常显性化

异常应在用户界面中转化为可操作的“需要你处理”卡片，说明：

- 发生了什么；
- 对任务有什么影响；
- 已完成部分是否仍有效；
- 推荐动作；
- 可否自动重试；
- 是否可以跳过；
- 需要用户补充什么；
- 将从哪个检查点恢复。

高级模式中再显示详细日志、模型、工具、参数和错误堆栈。

## 3. Kanban 与 WIP Limit：控制并行工作量

系统可以支持多个任务同时运行，但必须限制：

- 同时活跃任务数；
- 高成本模型并发；
- 本地高风险工具并发；
- 同一项目的上下文冲突；
- 单任务并行 Worker 数。

WIP Limit 应成为后台调度策略和简洁告警，不要让首页变成制造业看板。

## 4. Standard Work：Task Recipe 与 LoopTemplate

面向用户表现为“任务模板”或“Recipe”，例如：

- 深度研究；
- 小红书内容包；
- 营销方案；
- 财报分析；
- PDF 提炼；
- 代码修复；
- 文件批处理。

底层 LoopTemplate 至少包含：

- 适用场景；
- Goal；
- Required Inputs；
- Steps；
- Allowed / Required / Forbidden Tools；
- Model Policy；
- Verification；
- Artifact Contract；
- Stop Rules；
- Budget；
- Retry Policy；
- Failure Handling；
- Terminal States；
- Version；
- Eval Cases。

## 5. Kaizen：以评测驱动改善

任务结束后不要只生成一篇空泛复盘。

系统应记录：

- 用户是否接受成果；
- 哪些步骤发生返工；
- 哪些中间产物被采用；
- 哪些来源或工具最有效；
- 哪些调用无效；
- 人工在哪些位置介入；
- 最终成本和耗时；
- 是否值得更新 Recipe、Skill 或验证规则。

对 Loop、Prompt、Skill 或工具进行修改后，应支持用固定 Eval Cases 比较新旧版本，再
决定是否升级默认版本。

## 6. Genchi Genbutsu：回到事实现场

研究和分析类成果中的关键结论，应能够回到：

- 原始网页；
- PDF 页码；
- 文件片段；
- 表格单元格；
- 代码位置；
- 终端输出；
- ToolCall 结果；
- 用户提供的材料。

Evidence 不等同于一个 URL。它应包含来源位置、提取内容、抓取时间、关联结论、验证
状态和不确定性。

## 7. Poka-Yoke：高风险动作防错

风险必须按具体调用动态计算，而不是只给工具设置固定风险等级。

至少考虑：

- 工具基础风险；
- 参数；
- 目标路径或目标账户；
- 数据敏感度；
- 是否对外产生影响；
- 是否可逆；
- 预计成本。

对应机制包括：

- Dry Run；
- Diff Preview；
- Human Approval；
- 路径或域名白名单；
- 最小权限；
- 成本上限；
- Checkpoint；
- Rollback 或补偿动作；
- 审批超时；
- 一次性授权与长期授权。

## 8. Muda / Mura / Muri：先记录事实，再计算综合指标

MVP 优先记录：

- 重复模型调用；
- 重复工具调用；
- 无效重试；
- 被丢弃 Artifact；
- 上下文增长；
- 单 Loop 步数；
- 长链路；
- 人工介入；
- 队列等待；
- 并发过载；
- 成本异常。

不要在数据不足时强行生成貌似精确的综合 TPS 分数。

## 9. Just-in-Time：按需激活能力

- 默认不同时启动所有 Worker；
- 只有需要外部资料时才联网；
- 只有需要事实核验时才运行证据验证；
- 只有高价值步骤才调用高成本模型；
- 只有需要时才加载大型 Context Pack；
- 只有任务达到 Ready 条件才开始执行；
- Critic Model 不是默认每一步都调用。
</tps_as_product_mechanisms>

<core_runtime>
LeanClaw 的运行时主链路应简化并稳定为：

Project
→ Task
→ Run
→ Step
→ ModelCall / ToolCall
→ Artifact
→ Verification
→ Approval / Andon
→ Deliverable
→ Review
→ Metrics

核心原则：

1. Task 表示用户要完成的工作；
2. Run 表示一次实际执行；
3. Step 表示可观测、可重试、可恢复的执行单元；
4. Artifact 表示所有中间产物与最终成果；
5. Evidence 表示支撑结论的事实来源；
6. ToolCall 表示所有外部动作；
7. VerificationResult 表示结构、事实、规则、测试或人工验证；
8. ApprovalRequest 表示需要用户授权的动作；
9. AndonEvent 表示阻断任务正常流动的异常；
10. RunEvent 作为追加式事件账本记录执行事实。

模型不能直接修改最终状态。模型只能提出结构化 Action，由 Runtime 校验、Policy
授权、Executor 执行、Verifier 判断，最后由状态机完成状态转换。
</core_runtime>

<artifact_first>
Artifact 必须成为一等公民。

每个 Artifact 至少包含：

- id；
- taskId；
- runId；
- stepId；
- type；
- title；
- version；
- content 或 localPath；
- mimeType；
- producer；
- model / tool provenance；
- sourceArtifactIds；
- evidenceIds；
- hash；
- createdAt；
- verificationStatus；
- supersedesArtifactId；
- isDeliverable。

Artifact 应支持：

- 版本比较；
- 预览；
- 导出；
- 打开所在文件夹；
- 追踪来源；
- 局部重新生成；
- 标记为最终交付；
- 回退到旧版本；
- 被其他任务复用。
</artifact_first>

<agent_and_capability>
不要在 MVP 阶段预设一个复杂的自治 Agent 组织。

系统应优先建模 Capability：

- Research Capability；
- Content Capability；
- File Capability；
- Data Capability；
- Code Capability；
- Review Capability；
- Tool Execution Capability。

只有满足以下条件时才创建独立 Worker：

- 可以真正并行执行；
- 需要独立上下文；
- 需要不同模型；
- 需要不同工具权限；
- 需要清晰责任边界；
- 输出可以通过结构化 Artifact 交接。

每个 Worker 必须声明：

- role；
- input contract；
- output artifact contract；
- allowed tools；
- model policy；
- budget；
- timeout；
- stop condition；
- verification；
- handoff rule。

不要让 Worker 之间通过无边界对话无限讨论。
</agent_and_capability>

<tool_runtime>
工具系统支持：

- Built-in Tools；
- Skills；
- MCP Server；
- 本地脚本；
- CLI；
- 第三方 API；
- 用户自定义工具；
- 可选的 Computer Use。

全部能力必须通过统一 Tool Registry 和 Policy Engine 调用。Worker 不得直接绕过
Registry 调用原始工具。

ToolDefinition 的静态信息包括：

- id；
- name；
- provider；
- sourceType；
- description；
- inputSchema；
- outputSchema；
- capabilities；
- baseRisk；
- requiredPermissions；
- version；
- availability；
- dryRunSupport；
- rollbackSupport。

成功率、平均延迟、失败率和成本属于 ToolCall 运行数据聚合，不应作为人工维护的静态
字段。

每一次 ToolCall 必须记录：

- task / run / step；
- tool version；
- sanitized input；
- output summary；
- status；
- startedAt / endedAt；
- error；
- retryCount；
- risk evaluation；
- approval；
- cost；
- producedArtifactIds。

Skill 不等于普通 Prompt。Skill 是：

Prompt / Instructions
+ Tool Set
+ Permissions
+ Input Schema
+ Output Artifact Contract
+ Verification
+ Failure Handling
+ Eval Cases
+ Version
</tool_runtime>

<verification>
验证系统至少区分：

1. Schema Verification  
   检查 JSON、字段、文件格式和必需产物。

2. Deterministic Verification  
   单元测试、编译、Lint、文件存在性、哈希、数据约束等。

3. Evidence Verification  
   检查引用是否存在、来源是否支持结论、是否存在冲突。

4. Rule Verification  
   品牌规范、禁用词、预算、格式、长度和合规规则。

5. Model Review  
   逻辑、覆盖度、表达质量和一致性，只能作为软验证。

6. Human Review  
   商业判断、审美、投资判断和高风险决定。

Critic Model 不等于 Verification。能够使用确定性规则时，不要用另一个模型代替。
</verification>

<reliability>
长任务运行必须明确实现：

- timeout；
- retry；
- exponential backoff；
- idempotency key；
- cancellation；
- checkpoint；
- resume；
- duplicate execution prevention；
- stale worker detection；
- partial success；
- compensation action；
- application restart recovery；
- crash-safe event persistence。

应用重启后，未完成任务必须能够显示最后有效状态，并允许用户恢复、取消或归档。
</reliability>

<privacy_and_security>
默认本地优先：

- 任务、日志、配置和 Artifact 元数据默认存储在本地；
- API Key 使用 macOS Keychain；
- 本地数据库不保存明文密钥；
- 文件访问采用明确授权；
- 发送给模型的内容应可预览；
- 用户可以看到哪些文件或文本将离开本机；
- 支持按模型和工具设置数据范围；
- 支持敏感目录和敏感文件规则；
- 支持清除任务数据和导出完整记录。

不要宣传“完全本地”或“绝对隐私”，除非所使用模型和工具确实全部在本机运行。
</privacy_and_security>

<technology>
请比较以下技术路线：

1. SwiftUI 原生 Mac App；
2. Tauri + React；
3. Electron + React；
4. 本地 Web App + menubar wrapper。

比较维度：

- MVP 开发速度；
- Mac 桌面体验；
- 文件与系统权限；
- 后台任务；
- Node / TypeScript AI SDK 兼容性；
- MCP Client；
- 本地 CLI 与 sidecar；
- SQLite；
- 流式 UI；
- 工作流与 Artifact 预览；
- 安全隔离；
- 打包和签名；
- 长期维护；
- 资源占用。

必须明确推荐一个方案，不要只列选项。

当前默认倾向：

**Electron + React + TypeScript + SQLite。**

推荐的进程边界：

- Renderer：React UI，不直接访问 Node；
- Main Process：窗口、系统菜单、权限和窄 IPC；
- Utility Process / Local Runtime：Loop Engine、Model Adapter、Tool Runtime、
  MCP Client、Policy、Verification 和 SQLite；
- Child Process / Sidecar：CLI、MCP Server、脚本和专业执行工具。

安全基线：

- nodeIntegration = false；
- contextIsolation = true；
- sandbox = true；
- Renderer 不直接执行 Shell；
- 所有 IPC 使用明确的类型与白名单；
- 工具执行与 UI 进程隔离；
- 不加载不可信远程可执行内容。

如果最终评估认为其他路线明显更合适，可以改变推荐，但必须说明改变默认倾向的充分理由。
</technology>

<mvp>
MVP 的目标不是证明所有模块都存在，而是证明：

**用户可以像使用 WorkBuddy 一样，用一句话发起真实任务，并看到系统自动规划、执行、
生成成果；同时任务能够被暂停、验证、停线、恢复和交付。**

MVP 只实现一条完整垂直链路：

Task Input
→ Task Brief
→ Plan
→ Run
→ Steps
→ Model / Tool Calls
→ Artifacts
→ Verification
→ Approval / Andon
→ Deliverable
→ Review

建议 MVP 只支持三种 Recipe：

## 1. 深度研究

输入主题和可选文件，完成：

- 任务澄清；
- 研究计划；
- 联网搜索；
- 来源保存；
- 证据提取；
- 报告生成；
- 引用核验；
- Markdown 交付。

## 2. 内容生产

输入目标、素材和平台要求，完成：

- Brief；
- 大纲；
- 初稿；
- 规则检查；
- 修改；
- Markdown / 文本文档交付。

## 3. 文件或代码修改

输入文件或项目目录，完成：

- 读取；
- 修改计划；
- Diff；
- 人工批准；
- 写入；
- 测试或文件验证；
- 结果说明。

MVP 暂缓：

- 通用插件市场；
- 多人协作；
- 企业权限体系；
- 大规模远程调度；
- 复杂多 Agent 自治组织；
- 自动修改 Skill 并直接上线；
- 完整 Computer Use；
- 综合 TPS 总评分；
- 数十种任务模板；
- 完整 IM 远程控制；
- 跨设备同步。

2–4 周范围内，应优先保证一条真实任务可以完整跑通，而不是创建大量空壳模块。
</mvp>

<mvp_acceptance>
MVP 验收标准：

1. 用户可以在首页输入一句自然语言任务并添加本地文件；
2. 系统生成可编辑 Task Brief 和执行计划；
3. 用户可以开始、暂停、恢复、取消任务；
4. 执行过程以简洁进度形式实时显示；
5. 至少产生一个中间 Artifact 和一个最终 Deliverable；
6. 用户可以在应用内预览并在 Finder 中打开成果；
7. 每个成果可以追溯到模型调用、工具调用和来源；
8. ToolCall 失败时触发 Andon，不得静默继续；
9. 一个高风险文件写入动作必须经过 Diff Preview 和 Approval；
10. 一个验证失败任务必须进入 Blocked 或 Failed Verification；
11. 应用重启后可以恢复未完成 Run；
12. 同一 Step 重试不会重复产生不可逆副作用；
13. 至少一条 Recipe 可以完成一次真实端到端任务；
14. 系统可以生成该 Run 的耗时、成本、重试、人工介入和验证摘要；
15. 最终状态由 Runtime 和 Verification 决定，而不是由模型自述决定。
</mvp_acceptance>

<design_constraints>
必须遵守：

- 前台呈现接近 WorkBuddy 式桌面 AI 工作伙伴，而不是企业 AgentOps 后台；
- 首页必须以任务输入和成果交付为中心；
- 不以聊天记录作为唯一信息结构；
- 不以工作流画布作为默认任务入口；
- 不把 Tool Registry、MCP Center、TPS Metrics 放在一级核心入口；
- 不为了展示“多专家协作”而滥用多 Agent；
- 不让 Agent 绕过 Tool Registry；
- 不允许 MCP 黑箱执行；
- 不默认执行高风险、不可逆动作；
- 不允许无限循环；
- 不把 Critic Model 当成确定性验证；
- 不复制 WorkBuddy、OpenClaw 或其他产品的品牌、UI、代码和专有实现；
- 不为假设中的企业需求提前建设复杂抽象；
- 不使用装饰性指标；
- 不牺牲主链路来堆砌页面和功能；
- 所有失败必须有状态归因；
- 所有最终成果必须可追溯；
- 所有长任务必须可中断和恢复。
</design_constraints>

<output_stages>
请分两个阶段输出。Stage 1 完成后停止，等待用户确认，不要连续输出 Stage 2。

## Stage 1：产品形态与架构方向

输出：

1. 一句话项目定义；
2. LeanClaw 与 WorkBuddy、OpenClaw、Claude Code 的关系；
3. 目标用户、核心场景和差异化；
4. 从用户输入一句话到成果交付的完整用户旅程；
5. Focus Mode 与 Control Mode 的关系；
6. 一级信息架构；
7. Home、Task Workspace、Deliverables 三个核心页面的详细结构；
8. 用户可见任务状态与内部状态的映射；
9. TPS 思想如何下沉为产品机制；
10. 技术路线对比表与明确推荐；
11. 总体系统架构 Mermaid 图；
12. 核心数据流 Mermaid 图；
13. 2–4 周 MVP 的范围判断；
14. 明确指出当前设计中仍可能过度工程化的部分。

Stage 1 的页面设计必须让人能够清楚想象最终 Mac 应用的呈现结果，不能只输出后端模块图。

## Stage 2：确认后再输出实施方案

输出：

1. 核心数据模型；
2. 状态机与事件模型；
3. Artifact、Evidence、Verification、Approval、Andon 的字段与关联；
4. 页面级交互说明；
5. Electron 进程与 IPC 设计；
6. 本地目录结构与 SQLite Schema；
7. Tool Registry、MCP 和 Skill 的接口设计；
8. 三条 MVP Recipe；
9. 2–4 周开发计划；
10. 故障注入与验收测试；
11. 可运行 MVP 代码骨架；
12. 每个文件的路径和完整代码；
13. 安装、启动和验证命令；
14. 一份交给 Claude Code、Codex、Sonnet 或 Opus 继续开发的交接提示词。

代码要求：

- 必须可直接运行；
- 不要只输出伪代码；
- 优先完成单条端到端链路；
- 每个关键状态必须在代码中真实存在；
- 至少能生成一条完整 Run 记录；
- 至少演示一次 ToolCall；
- 至少演示一次 Verification；
- 至少演示一次 Andon；
- 至少演示一次 Approval；
- 至少演示一次 Artifact 交付；
- 不要用大量空接口假装完成架构。
</output_stages>

<output_style>
全部内容用中文撰写。

正文以清晰自然段落为主。只有真正离散的并列项、字段、状态或路线比较使用表格和列表。

不要机械重复需求，不要逐条复述提示词。需要作出产品判断、架构取舍和优先级排序。

所有 Mermaid 图必须语法完整。

最终内容保存为 Markdown 文件。

现在从 Stage 1 开始。完成 Stage 1 后立即停止，等待用户确认。
</output_style>
