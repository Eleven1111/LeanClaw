import type {
  NeedYouAction,
  NeedYouItemType,
  NeedYouItemView
} from './types'

export interface NeedYouCandidate {
  id: string
  type: NeedYouItemType
  taskId: string
  taskGoal: string
  agentName: string | null
  detail: string
  createdAt: string
  sourceId: string | null
  recommendedActions: string[]
}

const COPY: Record<
  NeedYouItemType,
  { title: string; urgency: 2 | 3 }
> = {
  approval: { title: '待批准的受控操作', urgency: 2 },
  andon: { title: '任务已停线', urgency: 2 },
  budget: { title: '预算不足', urgency: 2 },
  verification_failed: { title: '验证门拦截', urgency: 3 },
  blocked: { title: '任务已阻塞', urgency: 3 }
}

function boundedText(value: string | null | undefined, fallback: string, max = 280): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return fallback
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function actionsFor(candidate: NeedYouCandidate): {
  primaryAction: NeedYouAction
  secondaryActions: NeedYouAction[]
} {
  switch (candidate.type) {
    case 'approval':
      return { primaryAction: 'approve', secondaryActions: ['reject', 'open_task'] }
    case 'andon': {
      const canRetry = candidate.recommendedActions.includes('retry')
      const canCancel = candidate.recommendedActions.includes('cancel')
      return {
        primaryAction: canRetry ? 'retry' : 'open_task',
        secondaryActions: [
          ...(canCancel ? (['cancel'] as const) : []),
          ...(canRetry ? (['open_task'] as const) : [])
        ]
      }
    }
    case 'budget': {
      const canRetry = candidate.recommendedActions.includes('retry')
      const canCancel = candidate.recommendedActions.includes('cancel')
      return {
        primaryAction: canRetry ? 'add_budget' : 'open_task',
        secondaryActions: [
          ...(canCancel ? (['cancel'] as const) : []),
          ...(canRetry ? (['open_task'] as const) : [])
        ]
      }
    }
    case 'verification_failed':
      return {
        primaryAction: 'retry_checkpoint',
        secondaryActions: ['cancel', 'open_task']
      }
    case 'blocked':
      return { primaryAction: 'open_task', secondaryActions: [] }
  }
}

export function projectNeedYouCandidate(candidate: NeedYouCandidate): NeedYouItemView {
  const copy = COPY[candidate.type]
  return {
    id: candidate.id,
    type: candidate.type,
    urgency: copy.urgency,
    taskId: candidate.taskId,
    taskGoal: boundedText(candidate.taskGoal, '未命名任务'),
    agentName: boundedText(candidate.agentName, '', 80) || null,
    title: copy.title,
    detail: boundedText(candidate.detail, '该任务需要你决定下一步。'),
    createdAt: candidate.createdAt,
    ...actionsFor(candidate),
    sourceId: candidate.sourceId
  }
}

export function sortNeedYouItems(items: NeedYouItemView[]): NeedYouItemView[] {
  return [...items].sort(
    (a, b) =>
      b.urgency - a.urgency ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id)
  )
}
