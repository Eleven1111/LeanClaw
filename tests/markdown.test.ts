import { describe, expect, it } from 'vitest'
import { parseMarkdown, safeLinkTarget, suggestedExportName } from '../src/shared/markdown'

describe('parseMarkdown（安全富预览）', () => {
  it('解析标题、段落、列表、引用、代码块和表格', () => {
    const blocks = parseMarkdown(`# 标题

正文 **加粗** 与 \`code\` [1]

- 一
- 二

> 引用

\`\`\`ts
const x = 1
\`\`\`

| 名称 | 数值 |
| --- | ---: |
| A | 1 |`)

    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'blockquote',
      'code',
      'table'
    ])
    expect(blocks[1]).toMatchObject({ type: 'paragraph' })
    expect(blocks[5]).toMatchObject({ type: 'table', headers: ['名称', '数值'], rows: [['A', '1']] })
  })

  it('把原始 HTML 当普通文本，不生成 HTML 节点', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>')
    expect(blocks).toEqual([{ type: 'paragraph', content: '<script>alert(1)</script>' }])
  })

  it('空内容返回空块列表', () => {
    expect(parseMarkdown('  \n')).toEqual([])
  })

  it('未闭合代码块和 CRLF 不会崩溃或执行内容', () => {
    expect(parseMarkdown('```html\r\n<script>boom()</script>')).toEqual([
      { type: 'code', language: 'html', content: '<script>boom()</script>' }
    ])
  })
})

describe('safeLinkTarget', () => {
  it('只允许 http/https 链接', () => {
    expect(safeLinkTarget('https://example.com/a')).toBe('https://example.com/a')
    expect(safeLinkTarget('http://example.com')).toBe('http://example.com')
    expect(safeLinkTarget('javascript:alert(1)')).toBeNull()
    expect(safeLinkTarget('file:///etc/passwd')).toBeNull()
    expect(safeLinkTarget('data:text/html,x')).toBeNull()
    expect(safeLinkTarget('https://example.com\njavascript:alert(1)')).toBeNull()
  })
})

describe('suggestedExportName', () => {
  it('移除路径字符并保留目标扩展名', () => {
    expect(suggestedExportName('季度/研究:报告?.md', 'md')).toBe('季度-研究-报告-.md')
    expect(suggestedExportName('报告.md', 'pdf')).toBe('报告.pdf')
  })
})
