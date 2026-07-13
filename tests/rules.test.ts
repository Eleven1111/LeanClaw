import { describe, expect, it } from 'vitest'
import { checkContentRules, validateRuleSetInput } from '../src/shared/verify'

describe('validateRuleSetInput', () => {
  it('规范化名称、禁用词和必含结构', () => {
    expect(validateRuleSetInput({
      name: ' 发布规则 ', bannedWords: [' 绝对 ', '', '绝对'], minLength: 100,
      maxLength: 1000, mustStartWith: '# ', requiredHeadings: ['## 结论', '## 结论']
    })).toEqual({ ok: true, value: {
      name: '发布规则', bannedWords: ['绝对'], minLength: 100, maxLength: 1000,
      mustStartWith: '# ', requiredHeadings: ['## 结论']
    } })
  })

  it('拒绝空名称、负长度和倒置范围', () => {
    expect(validateRuleSetInput({ name: '', bannedWords: [], minLength: 0, maxLength: 1, mustStartWith: '', requiredHeadings: [] }).ok).toBe(false)
    expect(validateRuleSetInput({ name: 'x', bannedWords: [], minLength: -1, maxLength: 1, mustStartWith: '', requiredHeadings: [] }).ok).toBe(false)
    expect(validateRuleSetInput({ name: 'x', bannedWords: [], minLength: 10, maxLength: 5, mustStartWith: '', requiredHeadings: [] }).ok).toBe(false)
  })
})

describe('必含结构规则', () => {
  it('报告缺少要求标题时失败', () => {
    const result = checkContentRules('# 标题\n\n正文足够长', {
      bannedWords: [], minLength: 0, maxLength: 1000, mustStartWith: '# ', requiredHeadings: ['## 结论']
    })
    expect(result.ok).toBe(false)
    expect(result.problems).toContain('缺少必含结构：## 结论')
  })
})
