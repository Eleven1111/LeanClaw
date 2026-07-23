import { useState } from 'react'
import type { NeedYouAction, NeedYouItemView, RpcRequest } from '../../shared/types'

interface NeedYouListProps {
  items: NeedYouItemView[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  onOpenTask: (taskId: string) => void
  compact?: boolean
}

const TYPE_LABEL: Record<NeedYouItemView['type'], string> = {
  approval: '需批准',
  andon: '已停线',
  verification_failed: '验证失败',
  blocked: '已阻塞',
  budget: '预算'
}

const ACTION_LABEL: Record<NeedYouAction, string> = {
  approve: '批准',
  reject: '拒绝',
  retry: '重试',
  retry_checkpoint: '从检查点重试',
  add_budget: '更新预算并重试',
  cancel: '取消任务',
  open_task: '查看任务'
}

function waitingLabel(createdAt: string): string {
  const created = Date.parse(createdAt)
  if (!Number.isFinite(created)) return '等待时间未知'
  const minutes = Math.max(0, Math.floor((Date.now() - created) / 60_000))
  if (minutes < 1) return '刚刚发生'
  if (minutes < 60) return `已等待 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `已等待 ${hours} 小时`
  return `已等待 ${Math.floor(hours / 24)} 天`
}

export function NeedYouList({
  items,
  loading,
  error,
  onRefresh,
  onOpenTask,
  compact = false
}: NeedYouListProps): React.JSX.Element {
  const [busyById, setBusyById] = useState<Record<string, boolean>>({})
  const [errorById, setErrorById] = useState<Record<string, string>>({})
  const [budgetById, setBudgetById] = useState<Record<string, string>>({})
  const [budgetCommittedById, setBudgetCommittedById] = useState<Record<string, boolean>>({})

  const execute = async (item: NeedYouItemView, action: NeedYouAction): Promise<void> => {
    if (action === 'open_task') {
      onOpenTask(item.taskId)
      return
    }
    if (busyById[item.id]) return

    let request: RpcRequest
    if (action === 'approve' || action === 'reject') {
      if (!item.sourceId) return
      request = {
        method: 'resolveApproval',
        approvalId: item.sourceId,
        decision: action === 'approve' ? 'approved' : 'rejected'
      }
    } else if (action === 'retry' || action === 'cancel') {
      if (item.type === 'verification_failed') {
        request = { method: 'stopTask', taskId: item.taskId }
      } else {
        if (!item.sourceId) return
        request = {
          method: 'resolveAndon',
          andonId: item.sourceId,
          action: action === 'retry' ? 'retry' : 'cancel'
        }
      }
    } else if (action === 'retry_checkpoint') {
      request = { method: 'retryFromCheckpoint', taskId: item.taskId }
    } else {
      const value = Number(budgetById[item.id] ?? '')
      if (!(value > 0) || !Number.isFinite(value)) {
        setErrorById((current) => ({
          ...current,
          [item.id]: '请输入大于 0 的总预算。'
        }))
        return
      }
      if (!item.sourceId) return
      setBusyById((current) => ({ ...current, [item.id]: true }))
      setErrorById((current) => ({ ...current, [item.id]: '' }))
      let budgetCommitted = budgetCommittedById[item.id] ?? false
      try {
        if (!budgetCommitted) {
          await window.api.rpc({ method: 'updateBudget', taskId: item.taskId, budgetUsd: value })
          budgetCommitted = true
          setBudgetCommittedById((current) => ({ ...current, [item.id]: true }))
        }
        await window.api.rpc({ method: 'resolveAndon', andonId: item.sourceId, action: 'retry' })
        await onRefresh()
      } catch (caught) {
        setErrorById((current) => ({
          ...current,
          [item.id]: budgetCommitted
            ? `预算已更新，但任务恢复失败；请仅重试恢复。${(caught as Error).message || ''}`
            : (caught as Error).message || '处理失败，请重试。'
        }))
      } finally {
        setBusyById((current) => ({ ...current, [item.id]: false }))
      }
      return
    }

    setBusyById((current) => ({ ...current, [item.id]: true }))
    setErrorById((current) => ({ ...current, [item.id]: '' }))
    try {
      await window.api.rpc(request)
      await onRefresh()
    } catch (caught) {
      setErrorById((current) => ({
        ...current,
        [item.id]: (caught as Error).message || '处理失败，请重试。'
      }))
    } finally {
      setBusyById((current) => ({ ...current, [item.id]: false }))
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="need-you-state" role="status">
        <span className="need-you-state-mark" aria-hidden="true" />
        <div>
          <strong>正在汇总需要你决定的事项…</strong>
          <p>Approval、停线与验证结果会统一显示在这里。</p>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="need-you-state empty" role="status">
        <span className="need-you-state-mark" aria-hidden="true" />
        <div>
          <strong>{error ? '暂时无法读取待处理事项' : '目前没有需要你处理的事项'}</strong>
          <p>{error || '任务会继续在本机运行，有新决定时会出现在这里。'}</p>
        </div>
        {error && <button onClick={() => void onRefresh()}>重新加载</button>}
      </div>
    )
  }

  return (
    <div className={`need-you-list ${compact ? 'compact' : ''}`} aria-busy={loading}>
      {error && (
        <div className="need-you-page-error" role="alert">
          <span>{error}</span>
          <button onClick={() => void onRefresh()}>重试刷新</button>
        </div>
      )}
      {items.map((item) => {
        const busy = busyById[item.id] ?? false
        const actions = [item.primaryAction, ...item.secondaryActions]
        return (
          <article
            className={`need-you-card urgency-${item.urgency}`}
            data-need-you-id={item.id}
            key={item.id}
          >
            <div className="need-you-card-main">
              <div className="need-you-card-topline">
                <span className={`need-you-type ${item.type}`}>{TYPE_LABEL[item.type]}</span>
                <span className="need-you-wait">{waitingLabel(item.createdAt)}</span>
              </div>
              <h3>{item.title}</h3>
              <div className="need-you-task-link">{item.taskGoal}</div>
              <p>{item.detail}</p>
              <div className="need-you-meta">
                <span>{item.agentName ? `Agent · ${item.agentName}` : '默认执行器'}</span>
                <span>紧迫度 {item.urgency}/3</span>
              </div>
            </div>
            <div className="need-you-action-panel">
              {item.primaryAction === 'add_budget' && (
                <label className="need-you-budget">
                  <span>新的总预算</span>
                  <div>
                    <span aria-hidden="true">$</span>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      inputMode="decimal"
                      aria-label="新的总预算 USD"
                      value={budgetById[item.id] ?? ''}
                      onChange={(event) => {
                        setBudgetById((current) => ({
                          ...current,
                          [item.id]: event.target.value
                        }))
                        setBudgetCommittedById((current) => ({
                          ...current,
                          [item.id]: false
                        }))
                      }}
                      disabled={busy}
                      placeholder="0.00"
                    />
                  </div>
                </label>
              )}
              <div className="need-you-actions">
                {actions.map((action) => (
                  <button
                    key={action}
                    className={action === item.primaryAction ? 'primary' : 'ghost'}
                    disabled={busy}
                    onClick={() => void execute(item, action)}
                  >
                    {busy && action === item.primaryAction
                      ? '处理中…'
                      : action === 'add_budget' && budgetCommittedById[item.id]
                        ? '仅重试恢复'
                        : ACTION_LABEL[action]}
                  </button>
                ))}
              </div>
              {errorById[item.id] && (
                <div className="need-you-action-error" role="alert">
                  {errorById[item.id]}
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function NeedYou({
  items,
  loading,
  error,
  onRefresh,
  onOpenTask
}: NeedYouListProps): React.JSX.Element {
  return (
    <main className="home need-you-page">
      <div className="need-you-page-head">
        <div>
          <span className="need-you-eyebrow">ACTION INBOX</span>
          <h1>需要你处理</h1>
          <p className="sub">只汇总真正需要决定的事项；处理动作沿用任务原有安全链。</p>
        </div>
        <div className="need-you-summary" aria-label={`${items.length} 个待处理事项`}>
          <strong>{items.length}</strong>
          <span>待处理</span>
        </div>
      </div>
      <NeedYouList
        items={items}
        loading={loading}
        error={error}
        onRefresh={onRefresh}
        onOpenTask={onOpenTask}
      />
    </main>
  )
}
