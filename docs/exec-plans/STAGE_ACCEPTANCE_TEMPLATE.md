---
record_type: stage-acceptance
plan_id: replace-with-plan-id
phase_id: P0
prepared_at: YYYY-MM-DD
evidence_cutoff: YYYY-MM-DDTHH:mm:ssZ
code_status: not_started
test_status: not_run
smoke_status: not_run
review_status: not_run
engineering_acceptance: pending
user_acceptance: pending
release_readiness: not_applicable
shipping_status: not_shipped
---

# 阶段验收记录：计划名称 / 阶段

> 使用说明：复制本模板生成阶段验收记录。所有状态都必须由下方证据支持；空表、计划、README 或聊天中的“看起来完成”不能作为完成证据。

## 1. 验收对象与证据截止点

| 字段 | 内容 |
|---|---|
| Plan ID |  |
| 阶段 / Checkpoint |  |
| 验收范围 |  |
| 明确非目标 |  |
| 基线提交 / 工作树状态 |  |
| Schema / 数据版本 |  |
| 被验证产物 | 源码 / 开发态应用 / `.app` / ZIP / 其他；填写绝对可识别版本或 hash |
| 证据截止时间 |  |
| 验收环境 | OS、架构、Node/Electron、Runtime/Provider 等与结论相关的环境 |

证据截止时间之后发生的代码、配置、依赖、数据或产物变化不会自动继承本记录结论，必须刷新相关证据。

## 2. 状态面板

| 状态 | 允许值 | 当前值 | 证据或阻塞 |
|---|---|---|---|
| Code complete | `not_started / in_progress / complete / blocked` |  |  |
| Tests pass | `not_run / partial / pass / fail / blocked` |  |  |
| Smoke pass | `not_run / partial / pass / fail / blocked` |  |  |
| Review pass | `not_run / pass / changes_requested / blocked` |  |  |
| Engineering accepted | `pending / accepted / rejected / blocked` |  |  |
| User accepted | `pending / accepted / rejected` |  |  |
| Release ready | `not_applicable / not_ready / ready / blocked` |  |  |
| Shipped | `not_shipped / shipped / rolled_back` |  |  |

### 状态解释

1. `Code complete`：约定范围的实现和文档已经落盘，不代表测试通过。
2. `Tests pass`：列出的自动化检查对指定源码和环境通过，不代表真实用户路径或最终产物通过。
3. `Smoke pass`：Smoke Ledger 中约定的真实路径对指定产物通过，不代表代码评审、用户验收或发布完成。
4. `Review pass`：范围、代码、风险和证据完成独立复核，不替代测试。
5. `Engineering accepted`：本阶段工程门禁全部满足；不能由单个绿色命令自动推导。
6. `User accepted`：用户对指定产物和范围明确回复“验收通过”或同等明确表述。批准开始、回复“继续”、未提出异议均不算验收。
7. `Release ready`：只有存在明确分发目标，且签名、公证、升级、回滚、发布说明等适用门禁通过时才可为 `ready`。
8. `Shipped`：产物已实际发布到目标渠道并可由目标用户获取，且版本、hash、地址和发布时间可核验；本地打包不等于 Shipped。

任何后置状态都不能反向证明前置状态；也不能用前置状态替代后置状态。某阶段不涉及发行时，`release_readiness` 使用 `not_applicable`，`shipping_status` 保持 `not_shipped`。

## 3. 工程范围与变更

### 已完成

-

### 未完成或移出范围

-

### 变更文件

| 文件 | 变更目的 | 风险级别 |
|---|---|---|
|  |  |  |

## 4. 自动化验证证据

| 时间 | 检查 ID | 命令 / 动作 | 被测对象 | 结果 | 关键输出 | 证据位置 |
|---|---|---|---|---|---|---|
|  |  |  |  | `pass / fail / blocked` |  |  |

记录规则：

- 命令必须可复现，结果必须来自实际读取的输出；
- 测试清单存在不等于测试已运行；
- 开发态结果、E2E 结果和 packaged binary 结果分别记录；
- 失败后重跑必须保留第一次失败、修复内容与最终结果；
- 涉及用户数据时使用隔离数据根，禁止在证据中写入密钥、私人路径或真实数据正文。

## 5. Smoke Ledger

| 时间 | 场景 ID | 产物 / commit | 环境 | Fixture / 凭据来源 | 操作 | 预期 | 实际 | 结果 | 证据 | 未测边界 |
|---|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  | `pass / fail / blocked` |  |  |

Smoke Ledger 必须回答“谁对哪个产物、在什么环境、使用什么数据来源、执行了什么、看到了什么”。截图或日志只作为证据附件，不能替代表内结论。随机故障测试必须记录 seed、场景 ID、注入点和预期结果；阶段门禁优先使用固定、可复现的故障矩阵。

## 6. Review 结论

| Finding ID | 严重级别 | 结论 | 处置 | 证据 |
|---|---|---|---|---|
|  | `P0 / P1 / P2 / P3` |  | `fixed / accepted-risk / deferred / open` |  |

- Reviewer：
- Review 范围：
- Review 结论：
- 尚未关闭的 P0/P1：

存在未关闭 P0/P1 时，`review_status` 和 `engineering_acceptance` 不得标记通过。

## 7. 未测边界与未知

| ID | 未测内容 | 原因 | 潜在影响 | 当前缓解 | 补证条件 / 后续任务 |
|---|---|---|---|---|---|
| U-01 |  |  |  |  |  |

“未测”不是“无风险”。无法复现、缺少账号/证书/历史 fixture、仅在开发态验证等情况必须明确记录，不得从其他测试结果外推。

## 8. 回滚与恢复说明

| 字段 | 内容 |
|---|---|
| 回滚触发条件 |  |
| 可回滚范围 | 代码 / 配置 / 数据 / 产物 / 发布 |
| 回滚方法 |  |
| 数据保护与备份 |  |
| 不可逆变化 |  |
| 回滚后验证 |  |
| 预计恢复时间 |  |
| 负责人 |  |

Schema 变更必须区分代码回退、向前修复和数据库备份恢复；没有 downgrade migration 时不得承诺自动降级。发布回滚必须说明旧产物是否仍可获取，以及新版本写入的数据能否被旧版本读取。

## 9. 用户验收记录

> 本节只能记录真实发生的用户验收，不能预填“通过”。

| 字段 | 内容 |
|---|---|
| 提交验收时间 |  |
| 用户验证的产物 / hash |  |
| 用户验证的场景 |  |
| 用户反馈 |  |
| 验收决定 | `pending / accepted / rejected` |
| 明确表述与时间 |  |
| 附加条件 |  |

用户验收为 `accepted` 后，才允许关闭阶段；若验收对象随后变化，状态回退为 `pending` 并重新验收。

## 10. 发行与交付证据

> 不涉及对外分发时填写 `not_applicable`，不要删除本节。

| 字段 | 内容 |
|---|---|
| 分发决策 | 本机自用 / 小范围测试 / 正式外发 / 不适用 |
| Release candidate 版本 / hash |  |
| 签名 / 公证 / Gatekeeper |  |
| 升级与回滚验证 |  |
| 发布渠道与权限 |  |
| 实际发布时间 |  |
| 可获取地址 |  |
| 发布产物 checksum |  |
| 发布后 smoke |  |

只有实际发布证据齐全时才能设置 `shipping_status: shipped`。

## 11. 最终裁决

- 工程裁决：
- 用户裁决：
- 发行裁决：
- 阶段是否允许关闭：
- 下一阶段是否允许开始：
- 裁决人 / 时间：

## 12. 状态变更日志

| 时间 | 字段 | 原值 | 新值 | 原因与证据 |
|---|---|---|---|---|
|  |  |  |  |  |
