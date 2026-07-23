import { describe, expect, it } from 'vitest'
import {
  projectNeedYouCandidate,
  sortNeedYouItems,
  type NeedYouCandidate
} from '../src/shared/need-you'

const BASE: Omit<NeedYouCandidate, 'id' | 'type'> = {
  taskId: 'task-1',
  taskGoal: '完成交付',
  agentName: '研究 Agent',
  detail: '需要用户决定下一步',
  createdAt: '2026-07-23T10:00:00.000Z',
  sourceId: 'source-1',
  recommendedActions: []
}

describe('Need You 投影', () => {
  it.each([
    {
      type: 'approval' as const,
      title: '待批准的受控操作',
      urgency: 2,
      primaryAction: 'approve',
      secondaryActions: ['reject', 'open_task']
    },
    {
      type: 'andon' as const,
      title: '任务已停线',
      urgency: 2,
      primaryAction: 'retry',
      secondaryActions: ['cancel', 'open_task'],
      recommendedActions: ['retry', 'cancel']
    },
    {
      type: 'budget' as const,
      title: '预算不足',
      urgency: 2,
      primaryAction: 'add_budget',
      secondaryActions: ['cancel', 'open_task'],
      recommendedActions: ['retry', 'cancel']
    },
    {
      type: 'verification_failed' as const,
      title: '验证门拦截',
      urgency: 3,
      primaryAction: 'retry_checkpoint',
      secondaryActions: ['cancel', 'open_task']
    },
    {
      type: 'blocked' as const,
      title: '任务已阻塞',
      urgency: 3,
      primaryAction: 'open_task',
      secondaryActions: []
    }
  ])(
    '$type 生成安全动作矩阵',
    ({ type, title, urgency, primaryAction, secondaryActions, recommendedActions = [] }) => {
      const item = projectNeedYouCandidate({
        ...BASE,
        id: `${type}:1`,
        type,
        recommendedActions
      })
      expect(item).toMatchObject({
        id: `${type}:1`,
        type,
        title,
        urgency,
        primaryAction,
        secondaryActions,
        taskId: BASE.taskId,
        taskGoal: BASE.taskGoal,
        agentName: BASE.agentName,
        sourceId: BASE.sourceId
      })
    }
  )

  it('不可重试的 Andon 只提供打开任务和允许的取消动作', () => {
    expect(
      projectNeedYouCandidate({
        ...BASE,
        id: 'andon:no-retry',
        type: 'andon',
        recommendedActions: ['cancel']
      })
    ).toMatchObject({
      primaryAction: 'open_task',
      secondaryActions: ['cancel']
    })
  })

  it('达到重试上限的预算停线不能再提供追加预算并重试', () => {
    expect(
      projectNeedYouCandidate({
        ...BASE,
        id: 'budget:retry-limit',
        type: 'budget',
        recommendedActions: ['cancel']
      })
    ).toMatchObject({
      primaryAction: 'open_task',
      secondaryActions: ['cancel']
    })
  })

  it('限制原因长度并为缺失字段安全降级', () => {
    const item = projectNeedYouCandidate({
      ...BASE,
      id: 'blocked:broken',
      type: 'blocked',
      taskGoal: '   ',
      detail: 'x'.repeat(800),
      agentName: '   ',
      sourceId: null
    })
    expect(item.taskGoal).toBe('未命名任务')
    expect(item.agentName).toBeNull()
    expect(item.detail.length).toBeLessThanOrEqual(280)
    expect(item.detail.endsWith('…')).toBe(true)
  })
})

describe('Need You 排序', () => {
  it('高紧迫度优先，同级按最早发生时间，最终以稳定 id 打破并列', () => {
    const items = [
      projectNeedYouCandidate({
        ...BASE,
        id: 'approval:later',
        type: 'approval',
        createdAt: '2026-07-23T12:00:00.000Z'
      }),
      projectNeedYouCandidate({
        ...BASE,
        id: 'blocked:b',
        type: 'blocked',
        createdAt: '2026-07-23T09:00:00.000Z'
      }),
      projectNeedYouCandidate({
        ...BASE,
        id: 'blocked:a',
        type: 'blocked',
        createdAt: '2026-07-23T09:00:00.000Z'
      }),
      projectNeedYouCandidate({
        ...BASE,
        id: 'budget:early',
        type: 'budget',
        createdAt: '2026-07-23T08:00:00.000Z'
      })
    ]
    expect(sortNeedYouItems(items).map((item) => item.id)).toEqual([
      'blocked:a',
      'blocked:b',
      'budget:early',
      'approval:later'
    ])
    expect(items[0].id).toBe('approval:later')
  })
})
