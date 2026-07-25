# T06：Runtime Overview 服务

> 状态：工程完成  
> 优先级：P0  
> 依赖：无  
> 阻塞：T07

## 1. 目标

聚合当前本机真实可观测状态，形成一个只读、隐私安全、可测试的 Runtime Overview RPC。该任务不做 UI。

## 2. RuntimeOverviewView

建议结构：

```ts
interface RuntimeOverviewView {
  overall: 'ready' | 'busy' | 'degraded' | 'offline'
  runtime: {
    state: 'ready' | 'busy' | 'offline'
    startedAt: string | null
    activeTasks: number
    queuedTasks: number
    maxActiveTasks: number
  }
  providers: Array<{
    id: string
    name: string
    configured: boolean
    defaultModel: string
    lastTestStatus: 'passed' | 'failed' | 'unknown'
    lastTestedAt: string | null
    errorSummary: string | null
  }>
  mcp: Array<{
    id: string
    name: string
    state: 'connected' | 'connecting' | 'error' | 'disabled'
    toolCount: number
    errorSummary: string | null
  }>
  shell: {
    enabled: boolean
    allowPrefixCount: number
    risk: 'forbidden' | 'approval_required'
  }
  usage7d: {
    runs: number
    modelCalls: number
    toolCalls: number
    tokensIn: number
    tokensOut: number
    costUsd: number
  }
}
```

## 3. 状态计算

实现纯函数：

```ts
deriveRuntimeHealth(input): 'ready' | 'busy' | 'degraded' | 'offline'
```

建议规则：

- Runtime 进程不可达：offline；
- Runtime 可达且有 active Task：busy；
- Provider 全未配置、启用 MCP 有 error、或关键配置异常：degraded；
- Shell 关闭不是 degraded，是安全默认；
- 某个未启用 MCP error 不影响 overall；
- 无任务且基础能力正常：ready。

规则应允许后续调整，不写散落 UI 条件。

## 4. Provider 最近测试

当前 `testProvider` 只返回即时结果。首版允许在配置中保存不敏感元数据：

- lastTestStatus；
- lastTestedAt；
- error category/安全摘要。

不得保存：

- API Key；
- 原始响应；
- 请求 body；
- 完整网络错误堆栈。

如为避免 Settings 存储迁移而复杂化，可先返回 `unknown`，但文档和 UI 必须诚实。

## 5. 使用统计

从本地 SQLite 聚合最近 7 日：

- runs；
- model_calls；
- tool_calls；
- tokens；
- cost。

查询要求：

- 单次 RPC 固定数量 SQL；
- 不为每个 Task 做 N+1；
- 空数据库返回 0；
- 已归档事件不影响调用表统计；
- 不扫描 Artifact 正文或 Evidence。

## 6. 预计修改文件

- `src/shared/types.ts`
- `src/shared/runtime-health.ts`（新增）
- `src/runtime/api.ts`
- `src/runtime/views.ts` 或新增 `src/runtime/runtime-overview.ts`
- `src/runtime/config.ts`
- `src/main/index.ts`（仅在需要 Runtime 进程启动时间时）
- `tests/runtime-overview.test.ts`
- `tests/provider.test.ts`

## 7. 实施步骤

1. 为 health truth table 写失败测试；
2. 定义 View 和 RPC；
3. 聚合调度器状态；
4. 复用 Provider、MCP、Shell 现有数据；
5. 实现 7 日 SQL 聚合；
6. 处理 Runtime 启动时间和不可达降级；
7. 扫描输出，确认无敏感字段；
8. 负载验证 1000 Task 时响应可接受。

## 8. 测试要求

- ready/busy/degraded/offline 真值表；
- Shell 关闭不降级；
- 启用 MCP error 降级；
- 禁用 MCP error 不降级；
- Provider 未配置；
- 空数据库；
- 7 日边界；
- tokens/cost 合计；
- 无 N+1；
- 输出 JSON 不包含 key、env、private path、prompt、artifact content；
- Runtime 不可达时 Main/Renderer 有安全回退。

## 9. 明确不做

- 不扫描本机 CLI；
- 不连接远程 Runtime；
- 不展示每分钟实时曲线；
- 不做 Prometheus；
- 不提供工具直接执行入口；
- 不新增图表依赖。

## 10. 完成判据

一个 RPC 能诚实回答当前本机是否可执行、哪里异常、最近使用多少，且不泄漏用户任务内容或密钥。

## 11. 实测结果（2026-07-23）

- 已完成 Runtime、Provider、MCP、Shell、WIP 与七日使用量安全聚合、offline 缓存和固定超时；证据见审计记录 AN。
- T10 在 1000 Task/100 Agent/20 万 RunEvent/50 Schedule/20 MCP 数据下反复调用 Overview，单次约 0.4–0.9 ms；响应与缓存均未命中密钥、路径、Prompt 或 Artifact 正文。
- 未测边界：Provider 最近测试结果没有跨启动持久化；不扫描 CLI、不连接远程 Runtime、不提供 Prometheus。
