import type {
  ActivityKind,
  ActivityTone,
  ActivityView,
  EventActorType
} from './types'

export const ACTIVITY_EVENT_TYPES = [
  'task-created',
  'run-started',
  'paused-by-user',
  'resumed-by-user',
  'brief-edited',
  'refine-requested',
  'budget-updated',
  'task-cancelled',
  'task-archived',
  'retry-from-checkpoint',
  'step-started',
  'step-completed',
  'step-error',
  'approval-requested',
  'approval-resolved',
  'andon-opened',
  'andon-resolved',
  'budget-warning',
  'budget-exhausted',
  'model-fallback',
  'verification',
  'verification-blocked',
  'delivered',
  'events-archived',
  'tool-call',
  'model-call',
  'artifact-created',
  'status-changed',
  'recovered-after-restart',
  'tool-forbidden'
] as const

export interface ActivityProjectionInput {
  seq: number
  type: string
  payload: string | null
  taskId: string
  runId: string | null
  stepId: string | null
  actorType: EventActorType | null
  actorId: string | null
  actorNameSnapshot: string | null
  createdAt: string
}

type ActivityTarget = ActivityView['target']

function parsePayload(payload: string | null): Record<string, unknown> {
  if (!payload) return {}
  try {
    const parsed = JSON.parse(payload) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function actorOf(event: ActivityProjectionInput): {
  type: EventActorType
  id: string | null
  name: string
} {
  if (
    event.actorType !== 'user' &&
    event.actorType !== 'agent' &&
    event.actorType !== 'system'
  ) {
    return { type: 'system', id: null, name: '系统' }
  }
  const type: EventActorType = event.actorType
  const fallback = type === 'user' ? '你' : type === 'agent' ? 'Agent' : '系统'
  return {
    type,
    id: type === 'system' ? null : event.actorId,
    name: event.actorNameSnapshot?.trim() || fallback
  }
}

function safeStepName(payload: Record<string, unknown>): string | null {
  const name = typeof payload.name === 'string' ? payload.name : ''
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name)) return null
  return name.replaceAll('_', ' ')
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeActivityLimit(limit: number | undefined): number {
  if (limit === undefined) return 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Activity limit 必须是 1–200 的整数')
  }
  return limit
}

export function projectRunEventToActivity(
  event: ActivityProjectionInput
): ActivityView | null {
  const payload = parsePayload(event.payload)
  const actor = actorOf(event)
  const stepName = safeStepName(payload)
  const base = (
    kind: ActivityKind,
    tone: ActivityTone,
    title: string,
    target: ActivityTarget,
    detail: string | null = null
  ): ActivityView => ({
    id: `run-event-${event.seq}`,
    seq: event.seq,
    kind,
    tone,
    actorType: actor.type,
    actorId: actor.id,
    actorName: actor.name,
    title,
    detail,
    taskId: event.taskId,
    runId: event.runId,
    stepId: event.stepId,
    target,
    createdAt: event.createdAt
  })

  switch (event.type) {
    case 'task-created':
      return base('task', 'info', `${actor.name}创建了任务`, 'task')
    case 'run-started':
      return base('run', 'info', `${actor.name}开始执行`, 'task')
    case 'paused-by-user':
      return base('task', 'neutral', `${actor.name}暂停了任务`, 'task')
    case 'resumed-by-user':
      return base('task', 'info', `${actor.name}继续了任务`, 'task')
    case 'brief-edited':
      return base('task', 'info', `${actor.name}更新了 Brief`, 'task')
    case 'refine-requested':
      return base('task', 'info', `${actor.name}提出了修改`, 'task')
    case 'budget-updated':
      return base('budget', 'info', `${actor.name}更新了预算`, 'task')
    case 'task-cancelled':
      return base('task', 'danger', `${actor.name}停止了任务`, 'task')
    case 'task-archived':
      return base('archive', 'neutral', `${actor.name}归档了任务`, 'task')
    case 'retry-from-checkpoint':
      return base('run', 'info', `${actor.name}从检查点重试`, 'task')
    case 'step-started':
      return base(
        'step',
        'info',
        stepName ? `${actor.name}正在执行「${stepName}」` : `${actor.name}正在执行步骤`,
        'step'
      )
    case 'step-completed':
      return base(
        'step',
        'success',
        stepName ? `${actor.name}完成了「${stepName}」` : `${actor.name}完成了步骤`,
        'step'
      )
    case 'step-error': {
      const attempt = safeNumber(payload.attempt)
      return base(
        'step',
        'danger',
        stepName ? `${actor.name}执行失败「${stepName}」` : `${actor.name}执行步骤失败`,
        'step',
        attempt === null ? null : `第 ${attempt} 次尝试未成功，系统将按重试或停线规则处理。`
      )
    }
    case 'approval-requested':
      return base('approval', 'warning', `${actor.name}请求你批准动作`, 'approval')
    case 'approval-resolved': {
      const decision = payload.decision
      if (decision !== 'approved' && decision !== 'rejected') {
        return base('approval', 'neutral', `${actor.name}处理了批准请求`, 'approval')
      }
      const approved = decision === 'approved'
      return base(
        'approval',
        approved ? 'success' : 'danger',
        `${actor.name}${approved ? '批准了动作' : '拒绝了动作'}`,
        'approval'
      )
    }
    case 'andon-opened':
      return base('andon', 'warning', '任务需要处理', 'andon')
    case 'andon-resolved': {
      const action = payload.action
      if (action !== 'retry' && action !== 'cancel') {
        return base('andon', 'neutral', `${actor.name}处理了停线事项`, 'andon')
      }
      const retry = action === 'retry'
      return base(
        'andon',
        retry ? 'info' : 'danger',
        `${actor.name}${retry ? '选择了重试' : '选择了取消'}`,
        'andon'
      )
    }
    case 'budget-warning': {
      const after = safeNumber(payload.after)
      const budget = safeNumber(payload.budget)
      const detail =
        after !== null && budget !== null
          ? `已使用 $${after.toFixed(4)} / $${budget.toFixed(2)}`
          : null
      return base('budget', 'warning', '预算接近上限', 'task', detail)
    }
    case 'budget-exhausted':
      return base('budget', 'danger', '预算不足，任务已停线', 'task')
    case 'model-fallback':
      return base('run', 'warning', '模型已切换到备选模型', 'step')
    case 'verification': {
      const status = payload.status
      if (status !== 'passed' && status !== 'failed') {
        return base('verification', 'neutral', '验证已完成', 'verification')
      }
      const passed = status === 'passed'
      return base(
        'verification',
        passed ? 'success' : 'danger',
        passed ? '验证通过' : '验证失败',
        'verification'
      )
    }
    case 'verification-blocked':
      return base('verification', 'danger', '验证门拦截了交付', 'verification')
    case 'delivered':
      return base('deliverable', 'success', '交付物已生成', 'deliverable')
    case 'events-archived': {
      const count = safeNumber(payload.count)
      return base(
        'archive',
        'neutral',
        '历史活动已压缩',
        'task',
        count === null ? null : `已压缩 ${count} 条原始事件；完整技术明细不在 Feed 中恢复。`
      )
    }
    case 'tool-call':
      return base('step', 'neutral', `${actor.name}完成了工具调用`, 'step')
    case 'model-call':
      return base('step', 'neutral', `${actor.name}完成了模型调用`, 'step')
    case 'artifact-created':
      return base('deliverable', 'neutral', `${actor.name}生成了中间产物`, 'step')
    case 'status-changed':
      return base('run', 'neutral', '任务状态已更新', 'task')
    case 'recovered-after-restart':
      return base('run', 'info', '应用重启后已恢复任务', 'task')
    case 'tool-forbidden':
      return base('andon', 'danger', '策略阻止了不允许的工具调用', 'andon')
    default:
      return null
  }
}
