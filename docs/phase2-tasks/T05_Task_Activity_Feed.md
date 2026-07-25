# T05：Task Activity Feed

> 状态：工程完成  
> 优先级：P0  
> 依赖：T04  
> 阻塞：T10

## 1. 目标

在 Task Workspace 中提供普通用户可读的活动时间线，让用户不打开 Run Inspector 也能理解任务主过程、等待原因和最近结果。

## 2. 页面位置

Task Workspace 中栏建议顺序：

1. 标题与状态；
2. Need You 决策卡；
3. Deliverable（已交付时）；
4. 当前计划与进度；
5. **Activity**；
6. Task Brief、Evidence 等现有区域按当前布局保留。

Activity 默认显示最近 20 条，支持“加载更早活动”。

## 3. 组件

新增：

- `TaskActivityFeed`
- `ActivityRow`
- `ActivityActorBadge`

每行显示：

- actor 首字母或 System 标记；
- title；
- 可选 detail；
- 相对时间 + 可访问的完整时间；
- tone 状态；
- 可选“查看步骤/查看批准/查看验证/查看交付物”。

## 4. 交互

- 点击 Step 活动进入 Run Inspector 并定位到 step；
- Approval/Andon 活动滚动到任务页现有卡片；已处理时只定位，不重复动作；
- Deliverable 活动滚动到交付物；
- Verification 活动进入对应 Inspector Step；
- 键盘 Enter/Space 可激活可点击活动；
- 加载失败不阻断 Task 主内容。

## 5. 状态

- 加载中：局部骨架或紧凑文本；
- 空：说明“任务开始后，关键活动会出现在这里”；
- 错误：可重试，不替换整个页面；
- 归档：显示压缩摘要和“原始明细已按数据治理规则归档”；
- 活跃更新：Task push 后增量刷新，保持滚动位置。

## 6. 预计修改文件

- `src/renderer/src/TaskWorkspace.tsx`
- `src/renderer/src/TaskActivityFeed.tsx`（新增）
- `src/renderer/src/styles.css`
- `src/shared/types.ts`
- `tests/e2e/activity-feed.spec.ts`（新增）

## 7. 实施步骤

1. 写 E2E，旧 Task 页因缺少 Activity 明确 RED；
2. 实现加载和分页；
3. 实现 actor 与 tone；
4. 实现窄跳转；
5. 接入 push 刷新；
6. 覆盖归档摘要；
7. 做长 Activity、长中英文和 900×600；
8. 检查 reduced-motion、键盘和读屏名称。

## 8. E2E 场景

至少覆盖：

1. 正常任务：创建 → 开始 → Approval → 交付；
2. Andon：失败 → 打开 → 重试/取消；
3. 验证失败 → 从检查点重试；
4. 预算预警/停线；
5. Agent 改名后旧 Activity 显示 snapshot；
6. 点击 Step Activity 定位 Run Inspector；
7. 归档后显示摘要；
8. 加载更早活动无重复；
9. 无 console/page error。

## 9. 视觉验收

- 时间线在高密度页面中不过度抢眼；
- warning/danger 不滥用整行红底；
- actor、动作、对象三层可快速扫读；
- 不只用颜色表达状态；
- 200 条事件通过分页而不是一次渲染；
- 稳定帧视觉评分目标 ≥ 90。

## 10. 明确不做

- 不提供评论输入框；
- 不把 Tool/Model 每次调用逐条展开；
- 不做跨任务 Activity 首页；
- 不复制 Run Inspector；
- 不做搜索和筛选。

## 11. 完成判据

对一条正常任务和三条异常任务，首次使用者只阅读 Feed 就能正确说出：谁触发、当前在哪一步、为何等待、下一步是什么。

## 12. 实测结果（2026-07-23）

- 已完成 Task Workspace 最近 20 条 Activity、游标加载、actor、跳转、实时 push、预算/Andon/验证/交付和归档摘要；证据见审计记录 AM。
- 最终旅程 A 与四类故障 E2E 均在 Feed 中验证对应用户文案；分页无重复，归档后不伪造技术明细。
- 未测边界：按范围不做评论、搜索、筛选或全局 Feed；Tool/Model 技术细节继续留在 Run Inspector。
