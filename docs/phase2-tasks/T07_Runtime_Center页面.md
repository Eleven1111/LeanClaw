# T07：Runtime Center 页面

> 状态：工程完成  
> 优先级：P0  
> 依赖：T06  
> 阻塞：T10

## 1. 目标

让用户在一个页面判断 LeanClaw 当前本机执行环境是否正常，并获得安全、明确的下一步操作。

## 2. 页面结构

### 总览

- 状态：就绪 / 执行中 / 部分异常 / 离线；
- 活跃任务、排队任务、WIP 上限；
- 最近 7 日 Run、模型调用、工具调用、成本。

### Provider

每项显示：

- 名称；
- 是否配置；
- 默认模型；
- 最近测试结果；
- “测试连接”；
- “前往设置”。

### MCP

每项显示：

- 连接状态；
- 工具数；
- 安全错误摘要；
- “前往设置”。

### Shell

- 当前关闭或需批准；
- 白名单数量；
- 风险说明；
- “前往设置”。

### 诊断

- “导出诊断包”；
- 不在页面直接展示日志正文。

## 3. 导航

- 侧边栏系统组新增“运行时”；
- 原侧边栏底部状态点改为 Runtime Overview 的 overall；
- 状态点可点击进入 Runtime Center；
- Settings 继续负责编辑配置；
- “运行检查”继续负责单个 Run 技术检查。

## 4. 预计修改文件

- `src/renderer/src/App.tsx`
- `src/renderer/src/RuntimeCenter.tsx`（新增）
- `src/renderer/src/Settings.tsx`（仅支持定位到某设置区）
- `src/renderer/src/styles.css`
- `src/shared/types.ts`
- `tests/e2e/runtime-center.spec.ts`（新增）

## 5. 实施步骤

1. 先写导航和状态卡 E2E，在旧 UI 上 RED；
2. 增加 Runtime 路由；
3. 实现 overview 加载和错误回退；
4. 接入 Provider 测试；
5. 接入 Settings 深链；
6. 接入诊断包导出；
7. 更新侧边栏健康点；
8. 测试 900×600、长 Provider/MCP 名称；
9. 检查刷新期间布局稳定。

## 6. 交互规则

- 页面默认只读；
- “测试连接”使用现有 `testProvider`；
- 测试中显示进行态且防重复；
- 错误只展示安全摘要；
- Provider 未配置时主要动作是前往设置；
- MCP disabled 不是错误；
- Shell 关闭明确写“安全默认”，不显示红色故障；
- Runtime offline 时其余历史使用统计仍可显示，但当前执行相关操作禁用。

## 7. E2E 场景

- 完全未配置 Provider；
- Provider 配置且测试成功；
- Provider 测试失败；
- MCP connected/error/disabled；
- Shell 关闭/开启；
- active 和 queued Task 计数；
- 侧边栏状态点跳转；
- Settings 深链；
- 诊断包导出入口；
- Runtime Overview RPC 失败时页面可恢复；
- 无 console/page error。

## 8. 视觉与无障碍

- 不做大面积装饰图表；
- 数字卡不超过 6 个；
- 使用文本 + 图形 + 色彩三重表达健康状态；
- 表格/列表在窄窗口可纵向滚动；
- 测试按钮有 loading 和结果可访问通知；
- 稳定帧视觉评分目标 ≥ 90。

## 9. 明确不做

- 不编辑 MCP env；
- 不切换默认 Provider；
- 不显示完整错误堆栈；
- 不扫描或安装 CLI；
- 不显示云 Runtime；
- 不引入图表库。

## 10. 完成判据

当执行失败时，用户能在 Runtime Center 区分“配置未完成”“Provider 失败”“MCP 错误”“Runtime 离线”，并知道下一步去哪里处理。

## 11. 实测结果（2026-07-23）

- 已完成四态健康总览、六项指标、Provider/MCP/Shell/诊断卡片、Settings 深链、超时离线与恢复；证据见审计记录 AO。
- 最终 E2E 覆盖 Provider 成败、MCP 三态、Shell、活跃/排队、SIGSTOP/SIGCONT 和冷启动 offline；九页面矩阵在 900×600 无横向溢出。
- 未测边界：不编辑 MCP env、不展示完整错误栈、不提供云 Runtime 或告警系统。
