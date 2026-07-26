import { describe, expect, it } from 'vitest'
import {
  summarizeTaskView,
  summaryStepPhrase
} from '../src/shared/task-summary'
import type { TaskView } from '../src/shared/types'

function step(overrides: Partial<TaskView['steps'][number]>): TaskView['steps'][number] {
  return {
    id: 's',
    idx: 0,
    name: 'read_input',
    title: '读取输入',
    kind: 'tool',
    status: 'pending',
    attempt: 1,
    outputSummary: null,
    estimatedDurationMs: null,
    ...overrides
  }
}

function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 't1',
    goal: '目标',
    brief: '这段 Brief 很长很长，列表不需要它',
    inputPath: '/Users/someone/private/notes.md',
    status: 'step_running',
    userStatus: 'Running',
    recipeId: 'file-edit-summarize',
    projectId: null,
    projectName: null,
    agentId: null,
    agentName: null,
    budgetUsd: 2,
    refineInstructions: ['改这里'],
    queuePosition: null,
    steps: [],
    approvals: [],
    andons: [],
    artifacts: [],
    verifications: [],
    evidence: [],
    metrics: {
      durationMs: 1000,
      modelCalls: 3,
      toolCalls: 4,
      retries: 0,
      interventions: 0,
      tokensIn: 10,
      tokensOut: 20,
      costUsd: 0.5,
      eventCount: 200
    },
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:01:00.000Z',
    ...overrides
  }
}

describe('summarizeTaskView（推送的完整 TaskView → 列表摘要）', () => {
  it('只保留列表需要的字段，丢弃 Brief、输入路径、预算与全部明细集合', () => {
    const summary = summarizeTaskView(task())
    expect(Object.keys(summary).sort()).toEqual(
      [
        'agentId',
        'agentName',
        'createdAt',
        'deliverables',
        'goal',
        'id',
        'lastDoneLabel',
        'modelCalls',
        'projectId',
        'projectName',
        'queuePosition',
        'recipeId',
        'runningStepTitle',
        'status',
        'toolCalls',
        'updatedAt',
        'userStatus'
      ].sort()
    )
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('这段 Brief')
    expect(serialized).not.toContain('/Users/someone/private')
    expect(serialized).not.toContain('改这里')
  })

  it('userStatus 由内部状态映射得出，与完整视图一致', () => {
    expect(summarizeTaskView(task({ status: 'delivered' })).userStatus).toBe('Delivered')
  })

  it('取运行中步骤的标题；没有运行中步骤时取最后一个完成步骤的输出摘要', () => {
    const running = summarizeTaskView(
      task({
        steps: [
          step({ idx: 0, status: 'done', title: '第一步', outputSummary: '已完成第一步' }),
          step({ idx: 1, status: 'running', title: '第二步' })
        ]
      })
    )
    expect(running.runningStepTitle).toBe('第二步')

    const finished = summarizeTaskView(
      task({
        steps: [
          step({ idx: 0, status: 'done', title: '第一步', outputSummary: '已完成第一步' }),
          step({ idx: 1, status: 'done', title: '第二步', outputSummary: '已完成第二步' })
        ]
      })
    )
    expect(finished.runningStepTitle).toBeNull()
    expect(finished.lastDoneLabel).toBe('已完成第二步')
  })

  it('完成步骤没有输出摘要时回退到标题', () => {
    const summary = summarizeTaskView(
      task({ steps: [step({ status: 'done', title: '第一步', outputSummary: null })] })
    )
    expect(summary.lastDoneLabel).toBe('第一步')
  })

  it('计数取自 metrics，但不带出 eventCount 等技术指标', () => {
    const summary = summarizeTaskView(task())
    expect(summary.modelCalls).toBe(3)
    expect(summary.toolCalls).toBe(4)
    expect(JSON.stringify(summary)).not.toContain('200')
  })

  it('交付物只保留 id / 标题 / 版本，不带正文预览', () => {
    const summary = summarizeTaskView(
      task({
        artifacts: [
          {
            id: 'a1',
            type: 'report',
            title: '交付报告',
            version: 2,
            contentPreview: '这是四千字正文预览的开头',
            localPath: null,
            origin: null,
            isDeliverable: true,
            verificationStatus: 'verified',
            createdAt: '2026-07-25T00:00:30.000Z'
          },
          {
            id: 'a2',
            type: 'note',
            title: '中间产物',
            version: 1,
            contentPreview: '中间产物正文',
            localPath: null,
            origin: null,
            isDeliverable: false,
            verificationStatus: 'unverified',
            createdAt: '2026-07-25T00:00:20.000Z'
          }
        ]
      })
    )
    expect(summary.deliverables).toEqual([{ id: 'a1', title: '交付报告', version: 2 }])
    expect(JSON.stringify(summary)).not.toContain('正文预览')
  })
})

describe('summaryStepPhrase（Tasks 与 Home 共用同一句进度文案）', () => {
  it('运行中步骤走 actionPhrase', () => {
    expect(summaryStepPhrase({ runningStepTitle: '读取输入', lastDoneLabel: '旧的' })).toBe(
      '正在读取输入…'
    )
  })

  it('无运行中步骤时回落到最近完成标签，都没有则为空串', () => {
    expect(summaryStepPhrase({ runningStepTitle: null, lastDoneLabel: '已完成第二步' })).toBe(
      '已完成第二步'
    )
    expect(summaryStepPhrase({ runningStepTitle: null, lastDoneLabel: null })).toBe('')
  })
})
