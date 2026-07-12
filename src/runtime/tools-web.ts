import { ToolError, type ToolDefinition } from './tool-types'
import { createHash } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15000
const FETCH_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
}

export function htmlToText(html: string): { title: string; text: string } {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const titleMatch = stripped.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : ''
  const bodyMatch = stripped.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodySource = bodyMatch ? bodyMatch[1] : stripped
  const text = decodeEntities(bodySource.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  return { title, text }
}

export function decodeDdgHref(href: string): string {
  let h = href.trim()
  if (h.startsWith('//')) h = 'https:' + h
  try {
    const u = new URL(h, 'https://duckduckgo.com')
    const uddg = u.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    return u.toString()
  } catch {
    return href
  }
}

export function parseDdgResults(
  html: string,
  limit: number
): { title: string; url: string }[] {
  const anchorRe = /<a\s+[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/gi
  const out: { title: string; url: string }[] = []
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) && out.length < limit) {
    const fullTag = m[0]
    const hrefMatch = fullTag.match(/href="([^"]*)"/i)
    if (!hrefMatch) continue
    const url = decodeDdgHref(decodeEntities(hrefMatch[1]))
    const title = decodeEntities(m[1].replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim()
    if (url && title) out.push({ title, url })
  }
  return out
}

async function readBodyCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const body = res.body
  if (!body) return Buffer.from(await res.arrayBuffer())
  const reader = body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new ToolError(`响应体超过 ${maxBytes} 字节上限`, false)
      }
      chunks.push(Buffer.from(value))
    }
  }
  return Buffer.concat(chunks)
}

const MOCK_RESULTS: { title: string; url: string }[] = [
  { title: 'AI Agent 桌面应用的兴起与现状', url: 'https://mock.local/a' },
  { title: '桌面级 AI 工作伙伴的技术路线对比', url: 'https://mock.local/b' },
  { title: 'AI Agent 落地桌面场景的挑战与展望', url: 'https://mock.local/c' }
]

const MOCK_SOURCES: Record<string, { title: string; text: string }> = {
  'https://mock.local/a': {
    title: 'AI Agent 桌面应用的兴起与现状',
    text:
      '近一年来，桌面端 AI Agent 应用迎来密集发布期。与聊天窗口不同，这类应用强调持续在后台执行多步骤任务，例如整理文件、检索资料、生成报告。' +
      '它们普遍采用本地优先的设计，把模型调用、工具执行和状态管理放在独立的运行时进程中，即使界面崩溃，任务也能继续运行。' +
      '业内普遍认为，桌面 AI Agent 的核心竞争力不在于模型本身，而在于任务执行的可靠性。' +
      '能否在出错时停止而不是编造结果，能否在长任务中恢复检查点，能否让用户随时看清每一步发生了什么，这些能力共同构成了所谓的可控性，' +
      '也是桌面 AI Agent 区别于聊天机器人的关键分水岭。'
  },
  'https://mock.local/b': {
    title: '桌面级 AI 工作伙伴的技术路线对比',
    text:
      '桌面 AI 工作伙伴的技术路线大体分为三类：原生系统框架、跨平台混合框架，以及基于浏览器内核的桌面容器。' +
      '原生框架在系统集成和资源占用上表现最好，但开发速度慢，且难以复用已有的 AI 生态工具链。' +
      '混合框架在两者之间取得平衡。基于浏览器内核的方案开发速度最快，能够直接复用整个前端与 Node 生态，' +
      '但需要额外的工程纪律来避免界面显得像一个网页而不是桌面应用。' +
      '选择哪条路线，最终取决于团队希望把工程投入放在界面打磨上，还是放在任务执行引擎的可靠性上。' +
      '多数从零起步的团队会优先选择后者，把执行引擎的稳定性放在第一位。'
  },
  'https://mock.local/c': {
    title: 'AI Agent 落地桌面场景的挑战与展望',
    text:
      '评估一个 AI Agent 桌面应用是否成熟，有六个可观察的产品行为可以作为标尺。' +
      '第一，任务失败时是否会显性地停下来提示用户，而不是悄悄编造一个看似完成的结果。' +
      '第二，报告或结论中的关键信息是否可以点击回溯到原始来源。' +
      '第三，涉及文件写入等不可逆操作前是否会展示差异并等待批准。' +
      '第四，应用重启后未完成的任务是否可以从检查点恢复，而不是从头开始。' +
      '第五，一次成功的任务流程是否能够被沉淀为可复用的模板。' +
      '第六，任务是否完成应该由系统的验证规则判定，而不是由模型自己宣称已经完成。'
  }
}

function isWebMock(): boolean {
  return process.env.LEANCLAW_WEB_MOCK === '1'
}

export function snapshotFileName(url: string, html: string): string {
  return createHash('sha256').update(url).update('\0').update(html).digest('hex') + '.html'
}

function persistSnapshot(url: string, html: string): string {
  const root = join(process.env.LEANCLAW_DATA_DIR ?? process.cwd(), 'snapshots')
  mkdirSync(root, { recursive: true })
  const path = join(root, snapshotFileName(url, html))
  writeFileSync(path, html, 'utf8')
  return path
}

export const webFetchTool: ToolDefinition = {
  id: 'web.fetch',
  name: '抓取网页',
  version: '1.0.0',
  provider: 'builtin',
  description: '抓取一个网页并提取标题与正文文本，只读动作',
  baseRisk: 'low',
  riskFor: () => 'low',
  async execute(input) {
    const url = String(input.url ?? '')
    if (!/^https?:\/\//i.test(url)) {
      throw new ToolError(`仅支持 http/https 协议: ${url}`, false)
    }
    if (isWebMock()) {
      const fixture = MOCK_SOURCES[url]
      if (!fixture) throw new ToolError(`Mock 模式下未知 URL: ${url}`, false)
      const html = `<!doctype html><html><head><title>${fixture.title}</title></head><body><p>${fixture.text}</p></body></html>`
      return {
        summary: `已获取 ${url}（Mock，${fixture.text.length} 字符）`,
        data: { title: fixture.title, text: fixture.text, url, snapshotPath: persistSnapshot(url, html) }
      }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS })
      if (!res.ok) throw new ToolError(`请求失败: HTTP ${res.status}`, true)
      const buf = await readBodyCapped(res, MAX_BODY_BYTES)
      const html = buf.toString('utf8')
      const { title, text } = htmlToText(html)
      return { summary: `已获取 ${url}（${text.length} 字符）`, data: { title, text, url, snapshotPath: persistSnapshot(url, html) } }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        throw new ToolError(`请求超时（${FETCH_TIMEOUT_MS}ms）: ${url}`, true)
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }
}

export const webSearchTool: ToolDefinition = {
  id: 'web.search',
  name: '联网检索',
  version: '1.0.0',
  provider: 'builtin',
  description: '基于 DuckDuckGo HTML 结果页做联网检索，只读动作',
  baseRisk: 'low',
  riskFor: () => 'low',
  async execute(input) {
    const query = String(input.query ?? '')
    const limit = Number(input.limit ?? 5)
    if (isWebMock()) {
      const results = MOCK_RESULTS.slice(0, limit)
      return { summary: `已检索「${query}」（Mock，${results.length} 条）`, data: { results } }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query)
      const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS })
      if (!res.ok) throw new ToolError(`检索失败: HTTP ${res.status}`, true)
      const html = await res.text()
      const results = parseDdgResults(html, limit)
      return { summary: `已检索「${query}」（${results.length} 条）`, data: { results } }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        throw new ToolError(`检索超时（${FETCH_TIMEOUT_MS}ms）: ${query}`, true)
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }
}
