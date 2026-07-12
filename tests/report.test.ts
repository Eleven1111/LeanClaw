import { describe, expect, it } from 'vitest'
import { parseReport } from '../src/shared/verify'

const VALID = JSON.stringify({
  title: '研究报告标题',
  sections: [
    { heading: '概述', content: '这是概述部分的内容，足够长。' },
    { heading: '关键发现', content: '这是关键发现部分的内容。' }
  ],
  citations: [
    { quote: '第一条引用', url: 'https://mock.local/a' },
    { quote: '第二条引用', url: 'https://mock.local/b' }
  ]
})

describe('parseReport（研究报告 Schema 验证）', () => {
  it('接受符合契约的 JSON', () => {
    const r = parseReport(VALID)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.report.sections).toHaveLength(2)
      expect(r.report.citations).toHaveLength(2)
    }
  })

  it('接受包裹在 markdown 代码块中的 JSON', () => {
    expect(parseReport('```json\n' + VALID + '\n```').ok).toBe(true)
  })

  it('拒绝非 JSON', () => {
    expect(parseReport('这不是 JSON').ok).toBe(false)
  })

  it('拒绝缺少非空 title 字段', () => {
    const bad = JSON.stringify({
      title: '',
      sections: [
        { heading: 'h1', content: 'c1' },
        { heading: 'h2', content: 'c2' }
      ],
      citations: [
        { quote: 'q1', url: 'u1' },
        { quote: 'q2', url: 'u2' }
      ]
    })
    expect(parseReport(bad).ok).toBe(false)
  })

  it('拒绝少于 2 节的 sections', () => {
    const bad = JSON.stringify({
      title: 't',
      sections: [{ heading: 'h', content: 'c' }],
      citations: [
        { quote: 'q1', url: 'u1' },
        { quote: 'q2', url: 'u2' }
      ]
    })
    expect(parseReport(bad).ok).toBe(false)
  })

  it('拒绝少于 2 条的 citations', () => {
    const bad = JSON.stringify({
      title: 't',
      sections: [
        { heading: 'h1', content: 'c1' },
        { heading: 'h2', content: 'c2' }
      ],
      citations: [{ quote: 'q1', url: 'u1' }]
    })
    expect(parseReport(bad).ok).toBe(false)
  })

  it('拒绝 citations 缺少 url 字段', () => {
    const bad = JSON.stringify({
      title: 't',
      sections: [
        { heading: 'h1', content: 'c1' },
        { heading: 'h2', content: 'c2' }
      ],
      citations: [
        { quote: 'q1', url: '' },
        { quote: 'q2', url: 'u2' }
      ]
    })
    expect(parseReport(bad).ok).toBe(false)
  })
})
