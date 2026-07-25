# T03：Task 与 Automation 的 Agent 绑定

> 状态：工程完成  
> 优先级：P0  
> 依赖：T01  
> 阻塞：T04、T09

## 1. 目标

让 Agent 真正成为任务的执行归属：创建任务时可选 Agent，固化名称和指令快照，并在模型调用时安全注入。Schedule 同样可绑定 Agent。

## 2. 产品契约

- Agent 可选，不创建 Agent 也能沿用“默认执行器”；
- 选择 Agent 后带出默认 Recipe 和预算；
- 用户手动修改 Recipe/预算后，不再被 Agent 默认值覆盖；
- 创建时固化 Agent 名称和指令；
- 后续编辑 Agent 不影响旧任务；
- 停用 Agent 不影响已存在 Task；
- 新任务不能选择已停用 Agent；
- Task 列表、看板、详情展示 Agent；
- Schedule 触发时继续使用保存时绑定的 Agent，并在创建 Task 时固化当时的 Agent 指令；
- 启用中的 Schedule 会阻止其 Agent 被停用；
- 已停用 Agent 关联的暂停 Schedule 不能重新启用，直到 Agent 被重新启用或 Schedule 完成改绑。

## 3. Runtime 行为

### 创建任务

扩展 `createTask`：

```ts
{ method: 'createTask', ..., agentId?: string }
```

验证并写入：

- agent ID；
- name snapshot；
- instructions snapshot；
- effective Recipe；
- effective budget。

### 指令注入顺序

模型输入建议按以下边界组装：

1. 系统和 Recipe 指令；
2. Project Saved Instructions snapshot；
3. Agent Instructions snapshot；
4. Task goal / brief / refine instructions；
5. 当前 Step 输入。

Agent 指令不能覆盖系统安全规则；使用清晰 XML 标签隔离。

### 并发

首版只在 `requestRun` 入队/认领时执行 Agent 并发限制。全局 WIP 上限仍优先：

```text
可运行 = 未超过全局 WIP 且未超过该 Agent max_concurrent_runs
```

无 Agent 的任务只受全局 WIP 限制。

## 4. 预计修改文件

- `src/shared/types.ts`
- `src/runtime/api.ts`
- `src/runtime/model.ts`
- `src/runtime/scheduler.ts`
- `src/runtime/views.ts`
- `src/renderer/src/Home.tsx`
- `src/renderer/src/Tasks.tsx`
- `src/renderer/src/TaskWorkspace.tsx`
- `src/renderer/src/Schedules.tsx`
- `src/shared/project.ts` 或新增 `src/shared/instructions.ts`
- 相关单测、E2E、smoke

## 5. 实施步骤

1. 先写 Agent 默认值、指令拼装和并发纯函数测试；
2. 扩展 RPC 与 TaskView/ScheduleView；
3. 实现创建时验证和快照；
4. 在模型边界注入；
5. 调度器增加 Agent 并发约束；
6. Home 加 Agent 选择器和默认值带出；
7. Task 卡片和详情展示 Agent；
8. Schedule 保存并触发 Agent；
9. 增加 Agent snapshot smoke；
10. 回归无 Agent 旧路径。

## 6. 测试要求

至少覆盖：

- 未选 Agent 的旧路径；
- Agent 默认 Recipe/预算；
- 用户覆盖默认值；
- 停用 Agent 不能用于新任务；
- Agent 更新后旧 Task 快照不变；
- Project 与 Agent 指令顺序；
- 指令中包含 XML 特殊字符时仍安全分隔；
- 同一 Agent 并发上限；
- 两个 Agent 各自可并发；
- Schedule 绑定与触发；
- 启用 Schedule 阻止 Agent 停用；
- 已停用 Agent 阻止 Schedule 重新启用；
- 任务列表和详情展示 snapshot 而非实时名称。

## 7. 新增冒烟

建议 s17：

1. 创建 Agent A，指令含唯一标记；
2. 创建 Task 并绑定 A；
3. 修改 Agent A；
4. 启动并交付 Task；
5. 断言任务快照仍为旧指令；
6. 断言 Agent ID、名称、Recipe 和预算正确；
7. 断言状态机、Approval 和 Verification 未绕过。

## 8. 明确不做

- 不做 Agent 自动选任务；
- 不做 Agent 间委派；
- 不做每 Agent Provider/工具权限；
- 不恢复已交付任务为新 Run；
- 不改变 Task / Run 现有含义。

## 9. 完成判据

Agent 身份贯穿创建、调度、模型输入、Task 展示和 Schedule，同时所有安全门与旧任务兼容性保持不变。

## 10. 实测结果（2026-07-23）

- 已完成 Task/Schedule Agent 绑定、名称与指令快照、默认 Recipe/预算带出及指令安全注入；证据见审计记录 AK。
- s17 最终输出 `snapshot=true`、三类互锁 `true/true/true`、Approval 与 Verification 均为 true；旅程 B 证明修改/停用 Agent 不污染旧 Task。
- 未测边界：不做 Agent 自动选任务、Agent 间委派或每 Agent Provider/工具权限。
