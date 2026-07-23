import { describe, expect, it } from 'vitest'
import {
  agentColorIndex,
  agentDeleteBlocker,
  agentDisableBlocker,
  validateAgentInput
} from '../src/shared/agent'

const validInput = {
  name: 'Research Agent',
  description: '负责带引用的研究任务',
  instructions: '优先核验一手来源。',
  defaultRecipeId: 'deep-research',
  defaultBudgetUsd: 2,
  maxConcurrentRuns: 1
}

describe('validateAgentInput', () => {
  it('只规范化名称，并保留有效的可选默认值', () => {
    expect(validateAgentInput({ ...validInput, name: '  Research Agent  ' })).toEqual({
      ok: true,
      value: validInput
    })
  })

  it.each([
    ['', /名称必须为 1–40 字符/],
    ['   ', /名称必须为 1–40 字符/],
    ['a'.repeat(41), /名称必须为 1–40 字符/]
  ])('拒绝非法名称 %#', (name, expected) => {
    expect(validateAgentInput({ ...validInput, name })).toEqual({
      ok: false,
      detail: expect.stringMatching(expected)
    })
  })

  it('接受 description 和 instructions 的长度边界', () => {
    const result = validateAgentInput({
      ...validInput,
      description: 'd'.repeat(240),
      instructions: 'i'.repeat(10_000)
    })
    expect(result.ok).toBe(true)
  })

  it.each([
    [{ description: 'd'.repeat(241) }, /用途说明不能超过 240 字符/],
    [{ instructions: 'i'.repeat(10_001) }, /稳定指令不能超过 10000 字符/]
  ])('拒绝超长文本 %#', (patch, expected) => {
    expect(validateAgentInput({ ...validInput, ...patch })).toEqual({
      ok: false,
      detail: expect.stringMatching(expected)
    })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '拒绝非法预算 %s',
    (defaultBudgetUsd) => {
      expect(validateAgentInput({ ...validInput, defaultBudgetUsd })).toEqual({
        ok: false,
        detail: '默认预算必须为空或正数'
      })
    }
  )

  it.each([null, undefined, 0.01, 3])('接受空值或正数预算 %s', (defaultBudgetUsd) => {
    expect(validateAgentInput({ ...validInput, defaultBudgetUsd }).ok).toBe(true)
  })

  it('将空的默认 Recipe 选择规范化为未选择', () => {
    expect(validateAgentInput({ ...validInput, defaultRecipeId: '  ' })).toMatchObject({
      ok: true,
      value: { defaultRecipeId: null }
    })
  })

  it.each([0, 4, 1.5])('拒绝非法并发数 %s', (maxConcurrentRuns) => {
    expect(validateAgentInput({ ...validInput, maxConcurrentRuns })).toEqual({
      ok: false,
      detail: '最大并发必须是 1–3 的整数'
    })
  })

  it.each([1, 3])('接受并发边界 %s', (maxConcurrentRuns) => {
    expect(validateAgentInput({ ...validInput, maxConcurrentRuns }).ok).toBe(true)
  })
})

describe('Agent 引用保护', () => {
  it('Task 或 Schedule 有引用时禁止物理删除', () => {
    expect(agentDeleteBlocker({ taskCount: 1, scheduleCount: 0 })).toMatch(/任务/)
    expect(agentDeleteBlocker({ taskCount: 0, scheduleCount: 1 })).toMatch(/定时计划/)
    expect(agentDeleteBlocker({ taskCount: 0, scheduleCount: 0 })).toBeNull()
  })

  it('只有启用中的 Schedule 引用才阻止停用', () => {
    expect(agentDisableBlocker(1)).toMatch(/暂停或改绑/)
    expect(agentDisableBlocker(0)).toBeNull()
  })
})

describe('Agent 视觉标识', () => {
  it('颜色只由稳定 ID 决定并落在固定色板范围', () => {
    expect(agentColorIndex('agent-stable-id', 6)).toBe(agentColorIndex('agent-stable-id', 6))
    expect(agentColorIndex('agent-stable-id', 6)).toBeGreaterThanOrEqual(0)
    expect(agentColorIndex('agent-stable-id', 6)).toBeLessThan(6)
  })
})
