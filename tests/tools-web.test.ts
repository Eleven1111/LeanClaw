import { describe, expect, it } from 'vitest'
import { decodeDdgHref, htmlToText, parseDdgResults, snapshotFileName } from '../src/runtime/tools-web'

describe('htmlToText（HTML 转文本）', () => {
  it('提取标题并剥离 script/style 与标签', () => {
    const html = `<html><head><title>测试标题</title><style>body{color:red}</style></head>
      <body><script>console.log(1)</script><h1>正文标题</h1><p>第一段  内容。</p></body></html>`
    const { title, text } = htmlToText(html)
    expect(title).toBe('测试标题')
    expect(text).toContain('正文标题')
    expect(text).toContain('第一段 内容。')
    expect(text).not.toContain('console.log')
  })

  it('折叠多余空白', () => {
    const html = '<html><body><p>a   b\n\nc</p></body></html>'
    const { text } = htmlToText(html)
    expect(text).toBe('a b c')
  })

  it('没有 title 标签时返回空字符串', () => {
    const { title } = htmlToText('<html><body><p>内容</p></body></html>')
    expect(title).toBe('')
  })

  it('解码常见 HTML 实体', () => {
    const html = '<html><body><p>A &amp; B &lt;tag&gt; &quot;quoted&quot;</p></body></html>'
    const { text } = htmlToText(html)
    expect(text).toContain('A & B <tag> "quoted"')
  })
})

describe('snapshotFileName', () => {
  it('相同 URL 与 HTML 产生稳定且不可逃逸的文件名', () => {
    const a = snapshotFileName('https://example.com/../../x', '<html>same</html>')
    const b = snapshotFileName('https://example.com/../../x', '<html>same</html>')
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}\.html$/)
    expect(a).not.toContain('/')
  })

  it('内容变化会改变快照文件名', () => {
    expect(snapshotFileName('https://example.com', 'a')).not.toBe(snapshotFileName('https://example.com', 'b'))
  })
})

describe('decodeDdgHref（DuckDuckGo 重定向解码）', () => {
  it('解码 uddg 重定向参数为真实 URL', () => {
    const href = '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=abc'
    expect(decodeDdgHref(href)).toBe('https://example.com/page')
  })

  it('无 uddg 参数时原样返回可解析的 URL', () => {
    expect(decodeDdgHref('https://example.com/x')).toBe('https://example.com/x')
  })

  it('相对路径按 DuckDuckGo 作为 base 解析', () => {
    expect(decodeDdgHref('/l/?uddg=https%3A%2F%2Fexample.com%2Fy')).toBe('https://example.com/y')
  })
})

describe('parseDdgResults（结果页解析）', () => {
  it('解析结果链接与标题', () => {
    const html = `
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Example A</a>
      </div>
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fb">Example B</a>
      </div>
    `
    const results = parseDdgResults(html, 5)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'Example A', url: 'https://example.com/a' })
    expect(results[1]).toEqual({ title: 'Example B', url: 'https://example.com/b' })
  })

  it('限制返回条数', () => {
    const html = Array.from(
      { length: 5 },
      (_, i) => `<a class="result__a" href="https://example.com/${i}">T${i}</a>`
    ).join('\n')
    expect(parseDdgResults(html, 3)).toHaveLength(3)
  })

  it('无匹配结果时返回空数组', () => {
    expect(parseDdgResults('<div>没有结果</div>', 5)).toEqual([])
  })
})
