import { describe, expect, it } from 'vitest'
import {
  normalizeActivityLimit,
  projectRunEventToActivity,
  type ActivityProjectionInput
} from '../src/shared/activity'

function event(
  type: string,
  payload: unknown = null,
  actor: Partial<ActivityProjectionInput> = {}
): ActivityProjectionInput {
  return {
    seq: 42,
    type,
    payload: payload === null ? null : JSON.stringify(payload),
    taskId: 'task-1',
    runId: 'run-1',
    stepId: 'step-1',
    actorType: 'agent',
    actorId: 'agent-1',
    actorNameSnapshot: '研究 Agent',
    createdAt: '2026-07-23T00:00:00.000Z',
    ...actor
  }
}

describe('projectRunEventToActivity', () => {
  it.each([
    ['task-created', null, 'task', 'info', 'task', '研究 Agent创建了任务'],
    ['run-started', null, 'run', 'info', 'task', '研究 Agent开始执行'],
    ['step-started', { name: 'generate_report' }, 'step', 'info', 'step', '正在执行'],
    ['step-completed', { name: 'generate_report' }, 'step', 'success', 'step', '完成了'],
    ['step-error', { name: 'generate_report', attempt: 2 }, 'step', 'danger', 'step', '执行失败'],
    ['approval-requested', null, 'approval', 'warning', 'approval', '请求你批准'],
    ['approval-resolved', { decision: 'approved' }, 'approval', 'success', 'approval', '批准了动作'],
    ['andon-opened', null, 'andon', 'warning', 'andon', '任务需要处理'],
    ['andon-resolved', { action: 'retry' }, 'andon', 'info', 'andon', '选择了重试'],
    ['budget-warning', { after: 8, budget: 10 }, 'budget', 'warning', 'task', '预算接近上限'],
    ['budget-exhausted', null, 'budget', 'danger', 'task', '预算不足'],
    ['model-fallback', null, 'run', 'warning', 'step', '切换到备选模型'],
    ['verification', { status: 'passed' }, 'verification', 'success', 'verification', '验证通过'],
    ['verification-blocked', null, 'verification', 'danger', 'verification', '验证门拦截了交付'],
    ['delivered', null, 'deliverable', 'success', 'deliverable', '交付物已生成'],
    ['events-archived', { count: 18 }, 'archive', 'neutral', 'task', '历史活动已压缩']
  ])(
    '%s 映射为稳定的 kind/tone/target',
    (type, payload, kind, tone, target, title) => {
      const activity = projectRunEventToActivity(event(type, payload))
      expect(activity).toMatchObject({ kind, tone, target })
      expect(activity?.title).toContain(title)
    }
  )

  it.each([
    ['paused-by-user', '暂停了任务'],
    ['resumed-by-user', '继续了任务'],
    ['brief-edited', '更新了 Brief'],
    ['refine-requested', '提出了修改']
  ])('用户动作 %s 使用“你”而不是系统或 Agent', (type, title) => {
    const activity = projectRunEventToActivity(event(type, null, {
      actorType: 'user',
      actorId: null,
      actorNameSnapshot: null
    }))
    expect(activity).toMatchObject({ actorType: 'user', actorName: '你' })
    expect(activity?.title).toBe(`你${title}`)
  })

  it('旧事件 actor 为空时回退为系统，不猜测为用户或 Agent', () => {
    expect(projectRunEventToActivity(event('task-created', null, {
      actorType: null,
      actorId: 'stale-agent',
      actorNameSnapshot: '不可信旧名称'
    }))).toMatchObject({
      actorType: 'system',
      actorId: null,
      actorName: '系统',
      title: '系统创建了任务'
    })
  })

  it('Agent 改名后仍使用事件 actor 快照', () => {
    expect(projectRunEventToActivity(event('run-started'))).toMatchObject({
      actorId: 'agent-1',
      actorName: '研究 Agent',
      title: '研究 Agent开始执行'
    })
  })

  it('payload 缺字段时安全降级且不抛错', () => {
    expect(projectRunEventToActivity(event('step-started', { unexpected: true }))).toMatchObject({
      title: '研究 Agent正在执行步骤',
      detail: null
    })
    expect(projectRunEventToActivity({ ...event('delivered'), payload: '{bad json' })).toMatchObject({
      title: '交付物已生成'
    })
    expect(projectRunEventToActivity(event('approval-resolved'))).toMatchObject({
      tone: 'neutral',
      title: '研究 Agent处理了批准请求'
    })
    expect(projectRunEventToActivity(event('andon-resolved'))).toMatchObject({
      tone: 'neutral',
      title: '研究 Agent处理了停线事项'
    })
    expect(projectRunEventToActivity(event('verification'))).toMatchObject({
      tone: 'neutral',
      title: '验证已完成'
    })
  })

  it('API Key、私有路径、异常堆栈和 Evidence 正文不会进入 Activity', () => {
    const secret = 'sk-secret-123 /Users/private/customer.txt STACK Evidence 原文'
    const activity = projectRunEventToActivity(event('step-error', {
      name: 'generate_report',
      message: secret,
      detail: secret,
      input: secret,
      excerpt: secret
    }))
    expect(JSON.stringify(activity)).not.toContain(secret)
    expect(JSON.stringify(activity)).not.toContain('/Users/private')
    expect(JSON.stringify(activity)).not.toContain('sk-secret')
  })

  it('未知事件不被任意 JSON 投影成 UI', () => {
    expect(projectRunEventToActivity(event('future-secret-event', {
      title: '伪造 Activity',
      detail: 'sk-secret'
    }))).toBeNull()
  })
})

describe('normalizeActivityLimit', () => {
  it('默认 50，并接受 1–200 的整数边界', () => {
    expect(normalizeActivityLimit(undefined)).toBe(50)
    expect(normalizeActivityLimit(1)).toBe(1)
    expect(normalizeActivityLimit(200)).toBe(200)
  })

  it.each([0, 201, 1.5, Number.NaN])('拒绝非法 limit %s', (limit) => {
    expect(() => normalizeActivityLimit(limit)).toThrow(/1–200/)
  })
})
