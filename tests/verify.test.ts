import { describe, expect, it } from 'vitest'
import {
  checkCitations,
  parseDraft,
  parseEvidenceLocator,
  parseRefineInstructions,
  validatePresetInput
} from '../src/shared/verify'

const VALID = JSON.stringify({
  title: '摘要标题',
  summary: '这是一段超过二十个字符的中文摘要内容，用于通过最小长度校验。',
  quotes: ['第一条引用', '第二条引用']
})

describe('parseDraft（Schema 验证）', () => {
  it('接受符合契约的 JSON', () => {
    const r = parseDraft(VALID)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.draft.quotes).toHaveLength(2)
  })

  it('接受包裹在 markdown 代码块中的 JSON', () => {
    expect(parseDraft('```json\n' + VALID + '\n```').ok).toBe(true)
  })

  it('拒绝非 JSON', () => {
    const r = parseDraft('这不是 JSON')
    expect(r.ok).toBe(false)
  })

  it('拒绝缺少 quotes 或少于 2 条的草稿', () => {
    const bad = JSON.stringify({ title: 't', summary: '足够长的摘要内容足够长的摘要内容足够长', quotes: ['只有一条'] })
    expect(parseDraft(bad).ok).toBe(false)
  })

  it('拒绝过短的 summary', () => {
    const bad = JSON.stringify({ title: 't', summary: '太短', quotes: ['a', 'b'] })
    expect(parseDraft(bad).ok).toBe(false)
  })
})

describe('checkCitations（引用存在性验证）', () => {
  const source = '安灯系统允许任何一名工人拉绳停线，这不是权限，而是义务。\n标准作业是改善的基线。'

  it('逐字存在的引用通过', () => {
    const r = checkCitations(source, ['标准作业是改善的基线'])
    expect(r[0].found).toBe(true)
  })

  it('忽略空白差异（跨行引用）', () => {
    const r = checkCitations(source, ['而是义务。\n标准作业'])
    expect(r[0].found).toBe(true)
  })

  it('捏造的引用不通过', () => {
    const r = checkCitations(source, ['这句话在源文件中并不存在'])
    expect(r[0].found).toBe(false)
  })

  it('空引用不通过', () => {
    const r = checkCitations(source, ['   '])
    expect(r[0].found).toBe(false)
  })
})

describe('parseEvidenceLocator（来源定位符解析）', () => {
  it('解析带 web URL 的 locator', () => {
    const r = parseEvidenceLocator('https://example.com/article#quote-2')
    expect(r).toEqual({ source: 'https://example.com/article', index: 2 })
  })

  it('解析带本地文件路径的 locator', () => {
    const r = parseEvidenceLocator('/Users/na/notes.md#quote-1')
    expect(r).toEqual({ source: '/Users/na/notes.md', index: 1 })
  })

  it('无 #quote-N 后缀时 source 为原字符串、index 为 null', () => {
    const r = parseEvidenceLocator('/Users/na/notes.md')
    expect(r).toEqual({ source: '/Users/na/notes.md', index: null })
  })

  it('N 无法解析为整数时 index 为 null', () => {
    const r = parseEvidenceLocator('/Users/na/notes.md#quote-abc')
    expect(r).toEqual({ source: '/Users/na/notes.md', index: null })
  })
})

describe('validatePresetInput（预设保存校验）', () => {
  it('拒绝空名称（含仅空白）', () => {
    const r = validatePresetInput('   ', '一个目标')
    expect(r.ok).toBe(false)
  })

  it('拒绝超过 60 字符的名称', () => {
    const r = validatePresetInput('a'.repeat(61), '一个目标')
    expect(r.ok).toBe(false)
  })

  it('拒绝空 goal', () => {
    const r = validatePresetInput('合法名称', '   ')
    expect(r.ok).toBe(false)
  })

  it('接受合法的名称与 goal', () => {
    const r = validatePresetInput('合法名称', '一个目标')
    expect(r.ok).toBe(true)
  })
})

describe('parseRefineInstructions（增量修改指令解析）', () => {
  it('null 或空串返回空数组', () => {
    expect(parseRefineInstructions(null)).toEqual([])
    expect(parseRefineInstructions('')).toEqual([])
  })

  it('解析合法 JSON 字符串数组并保序', () => {
    expect(parseRefineInstructions('["改第一处","改第二处"]')).toEqual(['改第一处', '改第二处'])
  })

  it('过滤非字符串与空字符串元素', () => {
    expect(parseRefineInstructions('["有效",1,null,"",true]')).toEqual(['有效'])
  })

  it('非法 JSON 或非数组返回空数组', () => {
    expect(parseRefineInstructions('not json')).toEqual([])
    expect(parseRefineInstructions('{"a":1}')).toEqual([])
  })
})
