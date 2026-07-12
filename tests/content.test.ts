import { describe, expect, it } from 'vitest'
import { checkContentRules, parseOutline, type ContentRules } from '../src/shared/verify'

const VALID = JSON.stringify({
  title: '文章大纲',
  outline: ['引言', '核心论点', '案例分析', '总结']
})

describe('parseOutline（大纲 Schema 验证）', () => {
  it('接受符合契约的 JSON', () => {
    const r = parseOutline(VALID)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.outline.outline).toHaveLength(4)
  })

  it('接受包裹在 markdown 代码块中的 JSON', () => {
    expect(parseOutline('```json\n' + VALID + '\n```').ok).toBe(true)
  })

  it('拒绝非 JSON', () => {
    expect(parseOutline('这不是 JSON').ok).toBe(false)
  })

  it('拒绝缺少非空 title 字段', () => {
    const bad = JSON.stringify({ title: '', outline: ['a', 'b', 'c'] })
    expect(parseOutline(bad).ok).toBe(false)
  })

  it('拒绝少于 3 条的 outline', () => {
    const bad = JSON.stringify({ title: 't', outline: ['a', 'b'] })
    expect(parseOutline(bad).ok).toBe(false)
  })

  it('拒绝多于 6 条的 outline', () => {
    const bad = JSON.stringify({ title: 't', outline: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })
    expect(parseOutline(bad).ok).toBe(false)
  })

  it('拒绝包含空字符串的 outline', () => {
    const bad = JSON.stringify({ title: 't', outline: ['a', '', 'c'] })
    expect(parseOutline(bad).ok).toBe(false)
  })
})

describe('checkContentRules（内容规则核验）', () => {
  const rules: ContentRules = {
    bannedWords: ['史上最', '全网第一', '绝对有效', '100%', '秒杀全场'],
    minLength: 400,
    maxLength: 20000,
    mustStartWith: '# '
  }
  const validBody = '# 标题\n\n' + '正文内容足够长，用于通过最小长度校验。'.repeat(30)

  it('通过符合全部规则的文本', () => {
    const r = checkContentRules(validBody, rules)
    expect(r.ok).toBe(true)
    expect(r.problems).toHaveLength(0)
  })

  it('检测出禁用词', () => {
    const r = checkContentRules(validBody + '本方法史上最有效。', rules)
    expect(r.ok).toBe(false)
    expect(r.problems.some((p) => p.includes('史上最'))).toBe(true)
  })

  it('检测出长度过短', () => {
    const r = checkContentRules('# 标题\n\n太短了', rules)
    expect(r.ok).toBe(false)
    expect(r.problems.some((p) => p.includes('长度不足'))).toBe(true)
  })

  it('检测出长度过长', () => {
    const tooLong = '# 标题\n\n' + 'x'.repeat(20001)
    const r = checkContentRules(tooLong, rules)
    expect(r.ok).toBe(false)
    expect(r.problems.some((p) => p.includes('长度超过'))).toBe(true)
  })

  it('检测出未以一级标题开头', () => {
    const r = checkContentRules(validBody.replace('# ', ''), rules)
    expect(r.ok).toBe(false)
    expect(r.problems.some((p) => p.includes('开头'))).toBe(true)
  })
})
