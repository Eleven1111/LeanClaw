---
guardrail_id: privacy
status: active
last_verified: 2026-07-29
applies_to: renderer-projection, activity, need-you, diagnostics, secrets, local-paths
---

# Privacy 护栏

## 1. 词汇表

| 术语 | 定义 |
|---|---|
| private roots | 用户 Home、LeanClaw dataDir、Electron userData 等不应原样进入通用 UI/日志的本地根路径。 |
| projection boundary | Runtime/Main 将数据库或执行事实转换为 Renderer 可消费视图的边界。 |
| path redaction | 将绝对本地路径收敛到最小可识别形式；URL 按独立规则处理。 |
| event allowlist | 每类 RunEvent 允许进入 Renderer 的最小字段集合。 |
| capability-bearing path | `inputPath`、`localPath`、`snapshotPath` 等为显式文件动作保留的具名路径字段。 |
| diagnostic bundle | 只包含 allowlisted 日志与 `system.json` 的诊断归档。 |
| safeStorage | Main 进程用于加密 Provider API key 与 MCP 环境变量的系统能力。 |

## 2. 不变量

| 不变量 | 约束 |
|---|---|
| Renderer 不接收密钥 | API key、凭据值和 MCP 环境变量值只在 Main/Runtime 解密使用；Renderer 只接收 `hasKey`、键名或状态。 |
| 通用文本先投影再展示 | Brief、摘要、Approval/Andon、验证详情、错误和事件 payload 必须在 Runtime/Main 投影层收敛，不能把原始数据库对象交给 UI 自行过滤。 |
| RunEvent 默认拒绝 | 只有已登记事件和安全字段可以进入 Renderer；未知事件、畸形 payload 或空投影返回 `null`。 |
| Activity 和 Need You 是投影 | UI 只消费 `ActivityView` / `NeedYouItemView`，不读取原始事件载荷。 |
| 具名路径是窄例外 | Renderer 可能接收为“打开文件/快照”所需的 typed path；不得把它复制到通用文本、日志、Activity 或任意 payload 中。 |
| 路径与 URL 分开处理 | 本地绝对路径需要脱敏或显式动作；URL 不按本地路径规则改写，但外部打开仍须独立校验协议。 |
| 诊断最小披露 | 诊断事件丢弃原始 error message，栈帧和字符串有上限，私有根被替换；归档只允许固定文件。 |
| 原始技术事实可留 SQLite | 为审计保留原始事实不等于可以发送给 Renderer；读取边界始终执行最小披露。 |
| actor 缥缈时不猜身份 | 缺失或无效 actor 只能回退为 `system`，不得伪装成用户或 Agent。 |

## 3. 关键文件与责任

| 文件 | 责任 |
|---|---|
| [`src/shared/privacy.ts`](../../src/shared/privacy.ts) | 私有路径收敛和 RunEvent 字段 allowlist。 |
| [`src/runtime/views.ts`](../../src/runtime/views.ts) | TaskView、RunDetailView 及证据/交付物投影。 |
| [`src/shared/activity.ts`](../../src/shared/activity.ts) | Activity 事件集合、actor 语义和用户视图。 |
| [`src/runtime/activity.ts`](../../src/runtime/activity.ts) | 从数据库读取并投影 Activity。 |
| [`src/runtime/need-you.ts`](../../src/runtime/need-you.ts) | Need You 分类、排序和 detail 脱敏。 |
| [`src/main/settings.ts`](../../src/main/settings.ts) | safeStorage、Provider/MCP 密钥保存与最小设置视图。 |
| [`src/main/diagnostics.ts`](../../src/main/diagnostics.ts) | 诊断序列化、轮转、打包与临时目录清理。 |
| [`src/main/index.ts`](../../src/main/index.ts) | Main privateRoots 和安全导出入口。 |
| [`src/runtime/index.ts`](../../src/runtime/index.ts) | Runtime privateRoots 和诊断入口。 |

## 4. 修改检查表

- [ ] 新增 Renderer 字段前判断：是否必要、是否最小、是否可能含路径/正文/密钥。
- [ ] 新增 Activity 事件时同步更新事件集合、payload allowlist、语义投影和测试。
- [ ] 新增 RunDetail/TaskView 字段时在 `runtime/views.ts` 完成投影，不把净化责任推给组件。
- [ ] 新增 Need You 类型时只暴露用户行动所需 detail、sourceId 和 actions。
- [ ] 新增路径展示时区分本地路径、URL 和 snapshot；优先显式按钮，不复制到通用文案。
- [ ] 新增 evidence/deliverable 字段时审查 `source`、`excerpt`、`contentPreview` 和 locator。
- [ ] 新增诊断字段只能走统一序列化入口；归档内容必须显式 allowlist。
- [ ] 新增 Secret 时只在 Main/Runtime 解密，Renderer 仅获知存在性或键名。
- [ ] 用私有路径、token、任务正文和工具输入 sentinel 做 API、DOM、日志、归档断言。

## 5. 常见踩坑

1. **“Renderer 没有任何路径”不是真实边界。** typed path 为显式文件动作保留；风险在于被复制到通用文本或任意 payload。
2. **相对路径不是当前 redaction 的重点。** 若相对路径本身可识别用户目录，现有规则可能不会处理。
3. **新增事件忘记登记会安全退化为 `null`。** 这不会泄漏，但会造成 UI 信息丢失。
4. **`source`、`excerpt`、`contentPreview`、`taskGoal` 依赖上游净化。** 当前不是所有字段都在视图层二次 redaction。
5. **前端组件不是安全边界。** Activity/Need You/Run Inspector 必须收到已经投影的数据。
6. **URL 被保留不代表可以任意打开。** 协议、来源和外部导航权限是另一道安全边界。
7. **诊断包按文件白名单工作。** 绕过统一日志入口会造成不可控内容或诊断缺失。
8. **历史回归必须持续锁定。** Phase 2 曾发现 Need You 暴露完整 input directory、Run Inspector 暴露 Brief/refine/tool input。

## 6. 测试覆盖映射

| 测试 | 已覆盖 | 当前缺口 |
|---|---|---|
| [`tests/privacy.test.ts`](../../tests/privacy.test.ts) | 绝对路径、Windows 路径、URL、事件 allowlist、未知/畸形 payload | 相对敏感路径与更多 typed path 边界 |
| [`tests/activity.test.ts`](../../tests/activity.test.ts) | actor 回退、私有正文不进入 Activity、字段降级 | 新事件需持续表驱动更新 |
| [`tests/diagnostics.test.ts`](../../tests/diagnostics.test.ts) | 栈帧脱敏、轮转、归档 allowlist | 新日志字段的字段级矩阵 |
| [`tests/e2e/diagnostics.spec.ts`](../../tests/e2e/diagnostics.spec.ts) | 真实归档不含密钥/任务正文 | 依赖平台打包环境 |
| [`tests/e2e/activity.spec.ts`](../../tests/e2e/activity.spec.ts) | 分页、归档、未知事件不泄密 | typed path 不在 Activity 的专项断言 |
| [`tests/e2e/need-you.spec.ts`](../../tests/e2e/need-you.spec.ts) | Need You 投影、排序、动作和 DOM | taskGoal/source 等自由文本 sentinel |
| [`tests/e2e/phase2-ui-matrix.spec.ts`](../../tests/e2e/phase2-ui-matrix.spec.ts) | TaskWorkspace、Run Inspector、Need You 的 API/DOM 隐私 sentinel | 新页面与新增字段必须扩展矩阵 |

## 7. 决策日志

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-07-29 | 以“最小投影 + 具名路径窄例外”描述 Renderer 边界 | 与现有文件打开能力一致，避免虚假的零路径承诺。 |
| 2026-07-29 | 原始审计事实可以保留在 SQLite，但不能原样进入 Renderer | 同时满足本地审计和最小披露。 |
| 2026-07-29 | 把自由文本和 evidence 预览列为持续审查面 | 当前部分字段依赖上游净化，不能宣称已全覆盖。 |
