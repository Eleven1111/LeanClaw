import { useEffect, useState } from 'react'
import type { DeliverableDetailView, InternalStatus, RpcRequest, TaskView, UserStatus } from '../../shared/types'
import { parseEvidenceLocator } from '../../shared/verify'
import { RichDeliverablePreview } from './RichDeliverablePreview'
import { VersionCompare } from './VersionCompare'

const BRIEF_EDITABLE_STATUSES: InternalStatus[] = [
  'draft',
  'paused_by_user',
  'awaiting_approval',
  'andon_open',
  'verification_failed'
]

const REFINE_ALLOWED_STATUSES: InternalStatus[] = [
  'delivered',
  'verification_failed',
  'paused_by_user'
]

const CITATION_MARKER = /\[\d+\]/

const EVIDENCE_PANEL_ID = 'evidence-panel'

const STATUS_COLOR: Record<UserStatus, string> = {
  Draft: 'gray',
  Planning: 'blue',
  Running: 'blue',
  'Waiting for You': 'orange',
  Verifying: 'purple',
  Delivered: 'green',
  Blocked: 'red',
  Cancelled: 'gray',
  Archived: 'gray'
}

export function StatusChip({ s }: { s: UserStatus }): React.JSX.Element {
  return <span className={`chip chip-${STATUS_COLOR[s]}`}>{s}</span>
}

export const STEP_ICON: Record<string, string> = {
  pending: '○',
  running: '●',
  done: '✓',
  failed: '⚠'
}

const REVIEW_STATUSES: UserStatus[] = ['Delivered', 'Cancelled', 'Blocked']

export function TaskWorkspace({
  task,
  onBack,
  onOpenInspector
}: {
  task: TaskView
  onBack: () => void
  onOpenInspector: (taskId: string) => void
}): React.JSX.Element {
  const [error, setError] = useState('')
  const [editingBrief, setEditingBrief] = useState(false)
  const [briefDraft, setBriefDraft] = useState('')
  const [briefBusy, setBriefBusy] = useState(false)
  const [briefError, setBriefError] = useState('')
  const [presetOpen, setPresetOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetBusy, setPresetBusy] = useState(false)
  const [presetError, setPresetError] = useState('')
  const [presetSaved, setPresetSaved] = useState(false)
  const [budgetTopUp, setBudgetTopUp] = useState('')
  const [budgetTopUpBusy, setBudgetTopUpBusy] = useState(false)
  const [budgetTopUpError, setBudgetTopUpError] = useState('')
  const [refineInput, setRefineInput] = useState('')
  const [refineBusy, setRefineBusy] = useState(false)
  const [refineError, setRefineError] = useState('')
  const [deliverableDetail, setDeliverableDetail] = useState<DeliverableDetailView | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const exec = (req: RpcRequest): void => {
    setError('')
    window.api.rpc(req).catch((e: Error) => setError(e.message))
  }

  const submitBudgetTopUp = async (): Promise<void> => {
    setBudgetTopUpBusy(true)
    setBudgetTopUpError('')
    try {
      await window.api.rpc({
        method: 'updateBudget',
        taskId: task.id,
        budgetUsd: Number(budgetTopUp)
      })
      setBudgetTopUp('')
    } catch (e) {
      setBudgetTopUpError((e as Error).message)
    } finally {
      setBudgetTopUpBusy(false)
    }
  }

  const refineAllowed = REFINE_ALLOWED_STATUSES.includes(task.status)

  const submitRefine = async (): Promise<void> => {
    const instruction = refineInput.trim()
    if (!instruction) return
    setRefineBusy(true)
    setRefineError('')
    try {
      await window.api.rpc({ method: 'refineTask', taskId: task.id, instruction })
      setRefineInput('')
    } catch (e) {
      setRefineError((e as Error).message)
    } finally {
      setRefineBusy(false)
    }
  }

  const pendingApproval = task.approvals.find((a) => a.status === 'pending')
  const openAndon = task.andons.find((a) => a.status === 'open')
  const deliverable = task.artifacts
    .filter((a) => a.isDeliverable)
    .sort((a, b) => b.version - a.version)[0]
  const failedVerifications = task.verifications.filter((v) => v.status === 'failed')
  const briefEditable = BRIEF_EDITABLE_STATUSES.includes(task.status)
  const verifiedEvidenceCount = task.evidence.filter((e) => e.verificationStatus === 'verified').length
  const isReviewState = REVIEW_STATUSES.includes(task.userStatus)
  const approvedCount = task.approvals.filter((a) => a.status === 'approved').length
  const andonResolvedCount = task.andons.filter((a) => a.status === 'resolved').length
  const passedVerificationsCount = task.verifications.filter((v) => v.status === 'passed').length
  const budgetNearLimit =
    task.budgetUsd !== null && task.budgetUsd > 0 && task.metrics.costUsd / task.budgetUsd >= 0.8
  const isBudgetAndon = Boolean(openAndon && openAndon.reason.includes('预算'))

  useEffect(() => {
    if (!deliverable) {
      setDeliverableDetail(null)
      return
    }
    void window.api.rpc({ method: 'getDeliverable', artifactId: deliverable.id })
      .then((result) => setDeliverableDetail(result as DeliverableDetailView))
  }, [deliverable?.id])

  const openPresetForm = (): void => {
    setPresetName(task.goal.slice(0, 30))
    setPresetError('')
    setPresetOpen(true)
  }

  const savePreset = async (): Promise<void> => {
    setPresetBusy(true)
    setPresetError('')
    try {
      await window.api.rpc({
        method: 'savePreset',
        name: presetName,
        goal: task.goal,
        recipeId: task.recipeId,
        inputPath: task.inputPath
      })
      setPresetOpen(false)
      setPresetSaved(true)
    } catch (e) {
      setPresetError((e as Error).message)
    } finally {
      setPresetBusy(false)
    }
  }

  const startEditBrief = (): void => {
    setBriefDraft(task.brief ?? '')
    setBriefError('')
    setEditingBrief(true)
  }

  const saveBrief = async (): Promise<void> => {
    setBriefBusy(true)
    setBriefError('')
    try {
      await window.api.rpc({ method: 'updateBrief', taskId: task.id, brief: briefDraft })
      setEditingBrief(false)
    } catch (e) {
      setBriefError((e as Error).message)
    } finally {
      setBriefBusy(false)
    }
  }

  const controls: React.JSX.Element[] = []
  if (task.userStatus === 'Running') {
    if (task.status === 'paused_by_user') {
      controls.push(
        <button key="resume" className="primary" onClick={() => exec({ method: 'resumeTask', taskId: task.id })}>
          继续
        </button>
      )
    } else {
      controls.push(
        <button key="pause" onClick={() => exec({ method: 'pauseTask', taskId: task.id })}>
          暂停
        </button>
      )
    }
  }
  if (['Planning', 'Running', 'Verifying', 'Waiting for You', 'Blocked'].includes(task.userStatus)) {
    controls.push(
      <button key="stop" onClick={() => exec({ method: 'stopTask', taskId: task.id })}>
        停止
      </button>
    )
  }

  return (
    <div className="workspace">
      <header>
        <button className="ghost" onClick={onBack}>
          ← 返回
        </button>
        <div className="head-main">
          <h2>{task.goal}</h2>
          <div className="head-meta">
            <StatusChip s={task.userStatus} />
            {task.status === 'paused_by_user' && <span className="chip chip-gray">已暂停</span>}
            {task.queuePosition !== null && (
              <span className="queue-badge">排队中 · 第 {task.queuePosition} 位</span>
            )}
            <span className="meta">
              {(task.metrics.durationMs / 1000).toFixed(1)}s · {task.metrics.modelCalls} 次模型调用 ·{' '}
              {task.metrics.toolCalls} 次工具调用 · ${task.metrics.costUsd.toFixed(4)}
            </span>
            {budgetNearLimit && (
              <span className="budget-warning">
                预算 ${task.metrics.costUsd.toFixed(4)}/${(task.budgetUsd as number).toFixed(2)}
              </span>
            )}
          </div>
        </div>
        <div className="controls">{controls}</div>
      </header>

      {error && <div className="error">{error}</div>}

      {(task.brief || briefEditable) && (
        <section className="card brief">
          <div className="brief-head">
            <h3>Task Brief</h3>
            {briefEditable && !editingBrief && (
              <button className="ghost" onClick={startEditBrief}>
                编辑
              </button>
            )}
          </div>
          {editingBrief ? (
            <>
              <textarea
                value={briefDraft}
                onChange={(e) => setBriefDraft(e.target.value)}
                rows={6}
                placeholder="描述目标、范围与交付契约…"
              />
              {briefError && <div className="error">{briefError}</div>}
              <div className="actions">
                <button className="primary" disabled={briefBusy} onClick={() => void saveBrief()}>
                  {briefBusy ? '保存中…' : '保存并重新规划'}
                </button>
                <button disabled={briefBusy} onClick={() => setEditingBrief(false)}>
                  取消
                </button>
              </div>
            </>
          ) : (
            <pre>{task.brief}</pre>
          )}
          {task.refineInstructions.length > 0 && (
            <div className="refine-history">
              <span className="refine-history-label">历史修改指令</span>
              <ol>
                {task.refineInstructions.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {openAndon && (
        <section className="card andon">
          <h3>需要你处理</h3>
          <p>{openAndon.reason}</p>
          <p className="muted">{openAndon.impact}</p>
          <div className="actions">
            {openAndon.recommendedActions.includes('retry') && (
              <button
                className="primary"
                onClick={() => exec({ method: 'resolveAndon', andonId: openAndon.id, action: 'retry' })}
              >
                重试
              </button>
            )}
            <button onClick={() => exec({ method: 'resolveAndon', andonId: openAndon.id, action: 'cancel' })}>
              取消任务
            </button>
          </div>
          {isBudgetAndon && (
            <div className="budget-topup-row">
              <input
                type="number"
                min={0}
                step="0.01"
                value={budgetTopUp}
                onChange={(e) => setBudgetTopUp(e.target.value)}
                placeholder="追加预算 USD"
              />
              <button
                disabled={budgetTopUpBusy || !budgetTopUp.trim()}
                onClick={() => void submitBudgetTopUp()}
              >
                {budgetTopUpBusy ? '提交中…' : '追加预算'}
              </button>
              {budgetTopUpError && <div className="error">{budgetTopUpError}</div>}
            </div>
          )}
        </section>
      )}

      {pendingApproval && (
        <section className="card approval">
          <h3>待批准：{pendingApproval.actionDesc}</h3>
          <pre className="diff">{pendingApproval.diff}</pre>
          <div className="actions">
            <button
              className="primary"
              onClick={() =>
                exec({ method: 'resolveApproval', approvalId: pendingApproval.id, decision: 'approved' })
              }
            >
              批准
            </button>
            <button
              onClick={() =>
                exec({ method: 'resolveApproval', approvalId: pendingApproval.id, decision: 'rejected' })
              }
            >
              拒绝
            </button>
          </div>
        </section>
      )}

      {task.status === 'verification_failed' && (
        <section className="card blocked">
          <h3>任务被验证门拦下</h3>
          <p className="muted">
            {failedVerifications.map((v) => v.detail).join('；') || '存在未通过的验证'}
          </p>
          <div className="actions">
            <button className="primary" onClick={() => exec({ method: 'retryFromCheckpoint', taskId: task.id })}>
              从检查点重试
            </button>
            <button onClick={() => exec({ method: 'stopTask', taskId: task.id })}>取消任务</button>
          </div>
        </section>
      )}

      <div className="columns">
        <section className="main-col">
          <div className="section-head">
            <h3>执行计划</h3>
            <button className="ghost small" onClick={() => onOpenInspector(task.id)}>
              查看完整执行过程 →
            </button>
          </div>
          <ol className="steps">
            {task.steps.map((s) => (
              <li key={s.id} className={`step step-${s.status}`}>
                <span className="icon">{STEP_ICON[s.status] ?? '○'}</span>
                <span className="step-title">{s.title}</span>
                {s.attempt > 1 && <span className="retry">第 {s.attempt} 次尝试</span>}
                {s.outputSummary && <span className="summary">{s.outputSummary}</span>}
              </li>
            ))}
          </ol>

          {deliverable && (
            <section className="deliverable">
              <h3>最终交付</h3>
              <div className="deliv-head">
                <strong>{deliverable.title}</strong>
                <span className="chip chip-gray">v{deliverable.version}</span>
                <button disabled={deliverable.version < 2} onClick={() => setCompareOpen((open) => !open)}>
                  版本对比
                </button>
                {deliverable.localPath && (
                  <button onClick={() => void window.api.reveal(deliverable.localPath as string)}>
                    在 Finder 中显示
                  </button>
                )}
              </div>
              <RichDeliverablePreview
                content={deliverableDetail?.content ?? deliverable.contentPreview}
                onCitation={(index) => {
                  document.getElementById(`evidence-${index}`)?.scrollIntoView({ behavior: 'smooth' })
                }}
              />
              {CITATION_MARKER.test(deliverable.contentPreview) && (
                <div
                  className="hint-bar"
                  onClick={() =>
                    document.getElementById(EVIDENCE_PANEL_ID)?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  {verifiedEvidenceCount} 条引用已核验，点击右侧 Evidence 查看来源
                </div>
              )}
            </section>
          )}
          {deliverable && compareOpen && (
            <VersionCompare artifactId={deliverable.id} onClose={() => setCompareOpen(false)} />
          )}

          {isReviewState && (
            <section className="card review">
              <h3>复盘</h3>
              <div className="review-grid">
                <div className="review-item">
                  <span className="review-label">总耗时</span>
                  <span className="review-value">{(task.metrics.durationMs / 1000).toFixed(1)}s</span>
                </div>
                <div className="review-item">
                  <span className="review-label">模型调用</span>
                  <span className="review-value">
                    {task.metrics.modelCalls} 次 · {task.metrics.tokensIn + task.metrics.tokensOut} tokens
                  </span>
                </div>
                <div className="review-item">
                  <span className="review-label">成本</span>
                  <span className="review-value">${task.metrics.costUsd.toFixed(4)}</span>
                </div>
                <div className="review-item">
                  <span className="review-label">工具调用</span>
                  <span className="review-value">{task.metrics.toolCalls} 次</span>
                </div>
                <div className="review-item">
                  <span className="review-label">重试</span>
                  <span className="review-value">{task.metrics.retries} 次</span>
                </div>
                <div className="review-item">
                  <span className="review-label">人工介入</span>
                  <span className="review-value">
                    批准 {approvedCount} 次 · Andon 处理 {andonResolvedCount} 次
                  </span>
                </div>
                <div className="review-item">
                  <span className="review-label">验证记录</span>
                  <span className="review-value">
                    通过 {passedVerificationsCount} 项 · 失败 {failedVerifications.length} 项
                  </span>
                </div>
              </div>
              <button className="ghost" onClick={() => onOpenInspector(task.id)}>
                查看完整执行过程 →
              </button>

              {task.userStatus === 'Delivered' && (
                <div className="preset-save-row">
                  {presetSaved ? (
                    <span className="chip chip-green">已存为预设 ✓</span>
                  ) : presetOpen ? (
                    <div className="preset-inline-row">
                      <input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="预设名称"
                      />
                      <button className="primary" disabled={presetBusy} onClick={() => void savePreset()}>
                        {presetBusy ? '保存中…' : '保存'}
                      </button>
                      <button disabled={presetBusy} onClick={() => setPresetOpen(false)}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <button className="ghost" onClick={openPresetForm}>
                      存为预设
                    </button>
                  )}
                  {presetError && <div className="error">{presetError}</div>}
                </div>
              )}
            </section>
          )}
        </section>

        <aside className="inspector">
          <h3>Verification</h3>
          {task.verifications.length === 0 ? (
            <p className="muted">尚无验证记录</p>
          ) : (
            <ul>
              {task.verifications.map((v) => (
                <li key={v.id} className={v.status}>
                  {v.status === 'passed' ? '✓' : '✗'} [{v.kind}] {v.detail}
                </li>
              ))}
            </ul>
          )}

          <div id={EVIDENCE_PANEL_ID}>
            <h3>Evidence</h3>
            {task.evidence.length === 0 ? (
              <p className="muted">尚无证据记录</p>
            ) : (
              <ul>
                {task.evidence.map((e) => {
                  const { source } = parseEvidenceLocator(e.locator)
                  const isWeb = /^https?:\/\//.test(source)
                  return (
                    <li
                      key={e.id}
                      id={`evidence-${task.evidence.indexOf(e) + 1}`}
                      tabIndex={-1}
                      className={`evidence-item ${e.verificationStatus === 'verified' ? 'passed' : 'failed'}`}
                    >
                      <div className="evidence-excerpt">
                        {e.verificationStatus === 'verified' ? '✓' : '✗'} {e.excerpt}
                      </div>
                      <div className="evidence-source muted">
                        {e.snapshotPath ? (
                          <button className="link" onClick={() => void window.api.reveal(e.snapshotPath as string)}>
                            打开抓取快照
                          </button>
                        ) : isWeb ? (
                          <a
                            href="#"
                            onClick={(ev) => {
                              ev.preventDefault()
                              void window.api.openExternal(source)
                            }}
                          >
                            {source}
                          </a>
                        ) : (
                          <>
                            <span>{source}</span>{' '}
                            <button className="link" onClick={() => void window.api.reveal(source)}>
                              在 Finder 中显示
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <h3>Artifacts</h3>
          {task.artifacts.length === 0 ? (
            <p className="muted">尚无产物</p>
          ) : (
            <ul>
              {task.artifacts.map((a) => (
                <li key={a.id}>
                  {a.title}
                  <span className="muted">
                    {' '}
                    · v{a.version} · {a.verificationStatus}
                    {a.isDeliverable ? ' · 交付物' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3>账本</h3>
          <p className="muted">
            {task.metrics.eventCount} 条 RunEvent · 重试 {task.metrics.retries} 次 · 人工介入{' '}
            {task.metrics.interventions} 次
          </p>
        </aside>
      </div>

      {refineAllowed && (
        <div className="refine-bar">
          <input
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submitRefine()
              }
            }}
            placeholder="继续修改：描述你想调整的地方，⌘↩ 提交…"
            disabled={refineBusy}
          />
          <button
            className="primary"
            disabled={refineBusy || !refineInput.trim()}
            onClick={() => void submitRefine()}
          >
            {refineBusy ? '提交中…' : '提交修改'}
          </button>
          {refineError && <div className="error">{refineError}</div>}
        </div>
      )}
    </div>
  )
}
