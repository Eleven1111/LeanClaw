import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ActivityTone, ActivityView, EventActorType } from '../../shared/types'

const PAGE_SIZE = 20
const REQUEST_SIZE = 50

const TONE_PRESENTATION: Record<ActivityTone, { icon: string; label: string }> = {
  neutral: { icon: '•', label: '记录' },
  info: { icon: '→', label: '进展' },
  success: { icon: '✓', label: '成功' },
  warning: { icon: '!', label: '注意' },
  danger: { icon: '×', label: '异常' }
}

const ACTION_LABEL: Partial<Record<NonNullable<ActivityView['target']>, string>> = {
  step: '查看步骤',
  approval: '查看批准',
  andon: '查看待处理项',
  verification: '查看验证',
  deliverable: '查看交付物'
}

const ACTION_ARIA_LABEL: Partial<Record<NonNullable<ActivityView['target']>, string>> = {
  step: '定位活动步骤',
  approval: '定位决策卡',
  andon: '定位待处理卡',
  verification: '定位验证步骤',
  deliverable: '定位交付区域'
}

export type ActivityFocusTarget = 'approval' | 'andon' | 'deliverable'

interface TaskActivityFeedProps {
  taskId: string
  refreshToken?: string | number
  onOpenInspector: (taskId: string, stepId?: string) => void
  onFocusTarget: (target: ActivityFocusTarget) => boolean
}

function deduplicate(items: ActivityView[]): ActivityView[] {
  return [...new Map(items.map((item) => [item.id, item])).values()].sort(
    (left, right) => left.seq - right.seq
  )
}

function compactFeedItems(items: ActivityView[]): ActivityView[] {
  const lowSignal = items.filter((item) => {
    if (item.title === '任务状态已更新') return false
    return ![
      '完成了工具调用',
      '完成了模型调用',
      '生成了中间产物'
    ].some((suffix) => item.title.endsWith(suffix))
  })
  const terminalStepIds = new Set(
    lowSignal
      .filter(
        (item) =>
          item.kind === 'step' &&
          item.stepId &&
          (item.tone === 'success' || item.tone === 'danger')
      )
      .map((item) => item.stepId as string)
  )
  return lowSignal.filter(
    (item) =>
      !(
        item.kind === 'step' &&
        item.tone === 'info' &&
        item.stepId &&
        terminalStepIds.has(item.stepId)
      )
  )
}

function isArchiveSummary(items: ActivityView[]): boolean {
  if (items.length !== 1 || items[0].kind !== 'archive') return false
  const item = items[0]
  return item.title.includes('压缩') || item.detail?.includes('原始事件') === true
}

function actorMark(type: EventActorType, name: string): string {
  if (type === 'system') return 'S'
  if (type === 'user') return '你'
  return Array.from(name.trim())[0]?.toLocaleUpperCase('zh-CN') ?? 'A'
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '时间未知'
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSeconds < 60) return '刚刚'
  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

export function ActivityActorBadge({
  actorType,
  actorName
}: {
  actorType: EventActorType
  actorName: string
}): React.JSX.Element {
  return (
    <span
      className={`activity-actor activity-actor-${actorType}`}
      aria-label={`${actorName}，${actorType === 'system' ? '系统' : actorType === 'user' ? '用户' : 'Agent'}`}
      title={actorName}
    >
      {actorMark(actorType, actorName)}
    </span>
  )
}

export function ActivityRow({
  activity,
  onOpenInspector,
  onFocusTarget
}: {
  activity: ActivityView
  onOpenInspector: (taskId: string, stepId?: string) => void
  onFocusTarget: (target: ActivityFocusTarget) => boolean
}): React.JSX.Element {
  const tone = TONE_PRESENTATION[activity.tone]
  const actionLabel = activity.target ? ACTION_LABEL[activity.target] : undefined
  const actionable = Boolean(actionLabel)

  const activate = (): void => {
    if (activity.target === 'step' || activity.target === 'verification') {
      onOpenInspector(activity.taskId, activity.stepId ?? undefined)
      return
    }
    if (
      activity.target === 'approval' ||
      activity.target === 'andon' ||
      activity.target === 'deliverable'
    ) {
      if (!onFocusTarget(activity.target)) {
        onOpenInspector(activity.taskId, activity.stepId ?? undefined)
      }
    }
  }

  const content = (
    <>
      <ActivityActorBadge actorType={activity.actorType} actorName={activity.actorName} />
      <span className={`activity-tone activity-tone-${activity.tone}`} aria-label={tone.label}>
        {tone.icon}
      </span>
      <span className="activity-copy">
        <span className="activity-title">{activity.title}</span>
        {activity.detail && <span className="activity-detail">{activity.detail}</span>}
        <span className="activity-meta">
          <span className="activity-actor-name">{activity.actorName}</span>
          <time dateTime={activity.createdAt} title={formatDateTime(activity.createdAt)}>
            {formatRelativeTime(activity.createdAt)}
          </time>
          {actionLabel && <span className="activity-action-label">{actionLabel} →</span>}
        </span>
      </span>
    </>
  )

  if (actionable) {
    return (
      <li className={`activity-item activity-item-${activity.tone}`}>
        <button
          type="button"
          className="activity-row activity-row-actionable"
          data-seq={activity.seq}
          data-target={activity.target}
          onClick={activate}
          aria-label={activity.target ? ACTION_ARIA_LABEL[activity.target] : undefined}
        >
          {content}
        </button>
      </li>
    )
  }

  return (
    <li className={`activity-item activity-item-${activity.tone}`}>
      <div className="activity-row" data-seq={activity.seq} data-target={activity.target ?? undefined}>
        {content}
      </div>
    </li>
  )
}

export function TaskActivityFeed({
  taskId,
  refreshToken,
  onOpenInspector,
  onFocusTarget
}: TaskActivityFeedProps): React.JSX.Element {
  const [items, setItems] = useState<ActivityView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const contextRef = useRef<{ taskId: string; refreshToken: string | number | undefined } | null>(
    null
  )
  const taskEpochRef = useRef(0)
  const archiveCompressedRef = useRef(false)
  const historyExpandedRef = useRef(false)
  const oldestFetchedSeqRef = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pendingPrependHeightRef = useRef<number | null>(null)

  const applyRecent = (recentRaw: ActivityView[], replace: boolean): void => {
    const recent = compactFeedItems(recentRaw)
    const compressed = isArchiveSummary(recent)
    if (compressed) archiveCompressedRef.current = true
    if (archiveCompressedRef.current && !compressed) return
    setItems((current) => {
      if (compressed) {
        oldestFetchedSeqRef.current = null
        return recent
      }
      if (replace) {
        const visible = recent.slice(-PAGE_SIZE)
        oldestFetchedSeqRef.current = visible[0]?.seq ?? recentRaw[0]?.seq ?? null
        return visible
      }
      const merged = compactFeedItems(deduplicate([...current, ...recent]))
      if (historyExpandedRef.current) return merged
      const visible = merged.slice(-PAGE_SIZE)
      oldestFetchedSeqRef.current = visible[0]?.seq ?? recentRaw[0]?.seq ?? null
      return visible
    })
  }

  const requestRecent = async (replace: boolean): Promise<void> => {
    const epoch = taskEpochRef.current
    const requestTaskId = taskId
    replace ? setLoading(true) : setRefreshing(true)
    setError('')
    try {
      const recent = (await window.api.rpc({
        method: 'getTaskActivity',
        taskId: requestTaskId,
        limit: REQUEST_SIZE
      })) as ActivityView[]
      if (epoch !== taskEpochRef.current || requestTaskId !== taskId) return
      applyRecent(recent, replace)
      if (replace) setHasMore(recent.length === REQUEST_SIZE && !isArchiveSummary(recent))
      else if (!isArchiveSummary(recent) && recent.length === REQUEST_SIZE) setHasMore(true)
    } catch (caught) {
      if (epoch === taskEpochRef.current && requestTaskId === taskId) {
        setError((caught as Error).message)
      }
    } finally {
      if (epoch === taskEpochRef.current && requestTaskId === taskId) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    const previous = contextRef.current
    const taskChanged = previous?.taskId !== taskId
    const tokenChanged = previous ? !Object.is(previous.refreshToken, refreshToken) : false
    contextRef.current = { taskId, refreshToken }

    if (taskChanged) {
      taskEpochRef.current += 1
      archiveCompressedRef.current = false
      historyExpandedRef.current = false
      oldestFetchedSeqRef.current = null
      pendingPrependHeightRef.current = null
      setItems([])
      setHasMore(false)
      setError('')
      void requestRecent(true)
    } else if (tokenChanged) {
      void requestRecent(false)
    }
  }, [taskId, refreshToken])

  useLayoutEffect(() => {
    const previousHeight = pendingPrependHeightRef.current
    const list = listRef.current
    if (previousHeight === null || !list) return
    list.scrollTop += list.scrollHeight - previousHeight
    pendingPrependHeightRef.current = null
  }, [items])

  const loadOlder = async (): Promise<void> => {
    const oldestSeq = oldestFetchedSeqRef.current
    if (oldestSeq === null || loadingOlder || archiveCompressedRef.current) return
    const epoch = taskEpochRef.current
    const requestTaskId = taskId
    setLoadingOlder(true)
    setError('')
    try {
      const older = (await window.api.rpc({
        method: 'getTaskActivity',
        taskId: requestTaskId,
        limit: REQUEST_SIZE,
        beforeSeq: oldestSeq
      })) as ActivityView[]
      if (epoch !== taskEpochRef.current || requestTaskId !== taskId) return
      if (isArchiveSummary(older)) {
        archiveCompressedRef.current = true
        setItems(older)
        setHasMore(false)
        return
      }
      if (listRef.current) pendingPrependHeightRef.current = listRef.current.scrollHeight
      historyExpandedRef.current = true
      oldestFetchedSeqRef.current = older[0]?.seq ?? oldestFetchedSeqRef.current
      setItems((current) => compactFeedItems(deduplicate([...older, ...current])))
      setHasMore(older.length === REQUEST_SIZE)
    } catch (caught) {
      if (epoch === taskEpochRef.current && requestTaskId === taskId) {
        setError((caught as Error).message)
      }
    } finally {
      if (epoch === taskEpochRef.current && requestTaskId === taskId) setLoadingOlder(false)
    }
  }

  return (
    <section
      className="activity-feed task-activity-feed"
      aria-labelledby={`activity-title-${taskId}`}
    >
      <div className="activity-feed-head">
        <div>
          <h3 id={`activity-title-${taskId}`}>Activity</h3>
          <p>任务的重要进展与待处理节点</p>
        </div>
        {refreshing && (
          <span className="activity-refreshing" role="status">
            正在更新…
          </span>
        )}
      </div>

      {loading ? (
        <div className="activity-loading" role="status">
          正在加载活动…
        </div>
      ) : (
        <>
          {hasMore && (
            <button
              type="button"
              className="activity-load-more"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              {loadingOlder ? '正在加载…' : '加载更早活动'}
            </button>
          )}

          {items.length === 0 && !error ? (
            <p className="activity-empty">任务开始后，关键活动会出现在这里。</p>
          ) : (
            <div className="activity-list-scroll" ref={listRef}>
              <ol className="activity-list">
                {items.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    onOpenInspector={onOpenInspector}
                    onFocusTarget={onFocusTarget}
                  />
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {items.length === 1 && isArchiveSummary(items) && (
        <p className="activity-archive-note">
          原始明细已按数据治理规则归档。
        </p>
      )}

      {error && (
        <div className="activity-error" role="alert">
          <span>活动加载失败：{error}</span>
          <button type="button" className="ghost small" onClick={() => void requestRecent(items.length === 0)}>
            重试
          </button>
        </div>
      )}
    </section>
  )
}
