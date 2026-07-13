import { describe, expect, it } from 'vitest'
import { CONTENT_PIPELINE_STEPS, validateCustomRecipeInput } from '../src/shared/custom-recipe'

describe('validateCustomRecipeInput', () => {
  it('接受已注册步骤的线性内容生产序列', () => {
    const result = validateCustomRecipeInput({ name: '周报', goal: '生成周报', stepIds: [...CONTENT_PIPELINE_STEPS], ruleSetId: 'rules-1' })
    expect(result).toEqual({ ok: true, value: { name: '周报', goal: '生成周报', stepIds: CONTENT_PIPELINE_STEPS, ruleSetId: 'rules-1' } })
  })

  it('拒绝未知步骤、条件表达式和破坏依赖顺序的排列', () => {
    expect(validateCustomRecipeInput({ name: 'x', goal: 'x', stepIds: ['shell.run'], ruleSetId: 'r' }).ok).toBe(false)
    expect(validateCustomRecipeInput({ name: 'x', goal: 'x', stepIds: ['if(foo)'], ruleSetId: 'r' }).ok).toBe(false)
    const reversed = [...CONTENT_PIPELINE_STEPS].reverse()
    expect(validateCustomRecipeInput({ name: 'x', goal: 'x', stepIds: reversed, ruleSetId: 'r' }).ok).toBe(false)
  })

  it('规则核验步骤必须显式选择规则集', () => {
    expect(validateCustomRecipeInput({ name: 'x', goal: 'x', stepIds: [...CONTENT_PIPELINE_STEPS], ruleSetId: '' }).ok).toBe(false)
  })
})
