export interface DraftSchema {
  title: string
  summary: string
  quotes: string[]
}

export type ParseResult = { ok: true; draft: DraftSchema } | { ok: false; detail: string }

export function parseDraft(raw: string): ParseResult {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch (e) {
    return { ok: false, detail: 'JSON 解析失败: ' + (e as Error).message }
  }
  const d = obj as Partial<DraftSchema>
  if (typeof d.title !== 'string' || d.title.trim().length === 0) {
    return { ok: false, detail: '缺少非空 title 字段' }
  }
  if (typeof d.summary !== 'string' || d.summary.trim().length < 20) {
    return { ok: false, detail: 'summary 缺失或短于 20 字符' }
  }
  if (
    !Array.isArray(d.quotes) ||
    d.quotes.length < 2 ||
    !d.quotes.every((q) => typeof q === 'string' && q.trim().length > 0)
  ) {
    return { ok: false, detail: 'quotes 必须包含至少 2 条非空引用' }
  }
  return { ok: true, draft: { title: d.title, summary: d.summary, quotes: d.quotes as string[] } }
}

export interface ReportSection {
  heading: string
  content: string
}

export interface ReportCitation {
  quote: string
  url: string
}

export interface ReportSchema {
  title: string
  sections: ReportSection[]
  citations: ReportCitation[]
}

export type ReportParseResult =
  | { ok: true; report: ReportSchema }
  | { ok: false; detail: string }

export function parseReport(raw: string): ReportParseResult {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch (e) {
    return { ok: false, detail: 'JSON 解析失败: ' + (e as Error).message }
  }
  const d = obj as Partial<ReportSchema>
  if (typeof d.title !== 'string' || d.title.trim().length === 0) {
    return { ok: false, detail: '缺少非空 title 字段' }
  }
  if (
    !Array.isArray(d.sections) ||
    d.sections.length < 2 ||
    !d.sections.every(
      (s) =>
        s &&
        typeof s.heading === 'string' &&
        s.heading.trim().length > 0 &&
        typeof s.content === 'string' &&
        s.content.trim().length > 0
    )
  ) {
    return { ok: false, detail: 'sections 必须包含至少 2 个含 heading/content 的节' }
  }
  if (
    !Array.isArray(d.citations) ||
    d.citations.length < 2 ||
    !d.citations.every(
      (c) =>
        c &&
        typeof c.quote === 'string' &&
        c.quote.trim().length > 0 &&
        typeof c.url === 'string' &&
        c.url.trim().length > 0
    )
  ) {
    return { ok: false, detail: 'citations 必须包含至少 2 条含 quote/url 的引用' }
  }
  return {
    ok: true,
    report: {
      title: d.title,
      sections: d.sections as ReportSection[],
      citations: d.citations as ReportCitation[]
    }
  }
}

export interface OutlineSchema {
  title: string
  outline: string[]
}

export type OutlineParseResult =
  | { ok: true; outline: OutlineSchema }
  | { ok: false; detail: string }

export function parseOutline(raw: string): OutlineParseResult {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch (e) {
    return { ok: false, detail: 'JSON 解析失败: ' + (e as Error).message }
  }
  const d = obj as Partial<OutlineSchema>
  if (typeof d.title !== 'string' || d.title.trim().length === 0) {
    return { ok: false, detail: '缺少非空 title 字段' }
  }
  if (
    !Array.isArray(d.outline) ||
    d.outline.length < 3 ||
    d.outline.length > 6 ||
    !d.outline.every((o) => typeof o === 'string' && o.trim().length > 0)
  ) {
    return { ok: false, detail: 'outline 必须包含 3-6 条非空字符串' }
  }
  return { ok: true, outline: { title: d.title, outline: d.outline as string[] } }
}

export interface ContentRules {
  bannedWords: string[]
  minLength: number
  maxLength: number
  mustStartWith: string
  requiredHeadings?: string[]
}

export interface RuleSetInput extends ContentRules { name: string }
export type RuleSetValidationResult =
  | { ok: true; value: RuleSetInput }
  | { ok: false; detail: string }

export function validateRuleSetInput(input: RuleSetInput): RuleSetValidationResult {
  const name = input.name.trim()
  if (!name) return { ok: false, detail: '规则集名称不能为空' }
  if (name.length > 80) return { ok: false, detail: '规则集名称不能超过 80 字符' }
  if (!Number.isInteger(input.minLength) || input.minLength < 0) return { ok: false, detail: '最小长度必须是非负整数' }
  if (!Number.isInteger(input.maxLength) || input.maxLength < input.minLength) return { ok: false, detail: '最大长度必须不小于最小长度' }
  if (input.maxLength > 1_000_000) return { ok: false, detail: '最大长度不能超过 1000000' }
  const normalize = (items: string[]): string[] => [...new Set(items.map((item) => item.trim()).filter(Boolean))]
  return { ok: true, value: {
    name,
    bannedWords: normalize(input.bannedWords),
    minLength: input.minLength,
    maxLength: input.maxLength,
    mustStartWith: input.mustStartWith,
    requiredHeadings: normalize(input.requiredHeadings ?? [])
  } }
}

export interface ContentRuleResult {
  ok: boolean
  problems: string[]
}

export function checkContentRules(text: string, rules: ContentRules): ContentRuleResult {
  const problems: string[] = []
  for (const word of rules.bannedWords) {
    if (text.includes(word)) problems.push(`包含禁用词「${word}」`)
  }
  if (text.length < rules.minLength) {
    problems.push(`长度不足 ${rules.minLength} 字符（实际 ${text.length}）`)
  }
  if (text.length > rules.maxLength) {
    problems.push(`长度超过 ${rules.maxLength} 字符（实际 ${text.length}）`)
  }
  if (!text.startsWith(rules.mustStartWith)) {
    problems.push(`未以「${rules.mustStartWith}」开头`)
  }
  for (const heading of rules.requiredHeadings ?? []) {
    if (!text.includes(heading)) problems.push(`缺少必含结构：${heading}`)
  }
  return { ok: problems.length === 0, problems }
}

export interface EvidenceLocator {
  source: string
  index: number | null
}

const QUOTE_MARKER = '#quote-'

export function parseEvidenceLocator(locator: string): EvidenceLocator {
  const i = locator.lastIndexOf(QUOTE_MARKER)
  if (i === -1) return { source: locator, index: null }
  const source = locator.slice(0, i)
  const suffix = locator.slice(i + QUOTE_MARKER.length)
  const idx = Number(suffix)
  return { source, index: suffix.trim() !== '' && Number.isInteger(idx) ? idx : null }
}

export type PresetValidationResult = { ok: true } | { ok: false; detail: string }

export function validatePresetInput(name: string, goal: string): PresetValidationResult {
  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, detail: '预设名称不能为空' }
  if (trimmedName.length > 60) return { ok: false, detail: '预设名称不能超过 60 字符' }
  if (!goal.trim()) return { ok: false, detail: '目标不能为空' }
  return { ok: true }
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export interface OpenAiCompatParsed {
  text: string
  tokensIn: number
  tokensOut: number
}

export function parseOpenAiCompatResponse(data: unknown): OpenAiCompatParsed {
  const d = (data ?? {}) as {
    choices?: { message?: { content?: unknown } }[]
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
  }
  const rawContent = d.choices?.[0]?.message?.content
  const text = typeof rawContent === 'string' ? rawContent : ''
  const toInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return { text, tokensIn: toInt(d.usage?.prompt_tokens), tokensOut: toInt(d.usage?.completion_tokens) }
}

export interface ValidatedProvider {
  name: string
  kind: 'anthropic' | 'openai-compat'
  baseUrl: string
  defaultModel: string
  inputPricePerM: number | null
  outputPricePerM: number | null
}

export type ProviderValidationResult =
  | { ok: true; value: ValidatedProvider }
  | { ok: false; detail: string }

function validatePrice(
  v: unknown,
  label: string
): { ok: true; value: number | null } | { ok: false; detail: string } {
  if (v === undefined || v === null || v === '') return { ok: true, value: null }
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return { ok: false, detail: `${label}必须是不小于 0 的数字` }
  return { ok: true, value: n }
}

export function validateProvider(input: {
  name?: unknown
  kind?: unknown
  baseUrl?: unknown
  defaultModel?: unknown
  inputPricePerM?: unknown
  outputPricePerM?: unknown
}): ProviderValidationResult {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) return { ok: false, detail: '服务商名称不能为空' }
  if (name.length > 40) return { ok: false, detail: '服务商名称不能超过 40 字符' }
  if (input.kind !== 'anthropic' && input.kind !== 'openai-compat') {
    return { ok: false, detail: '未知的适配器类型' }
  }
  const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : ''
  if (!/^https?:\/\//.test(baseUrl)) {
    return { ok: false, detail: 'baseUrl 必须以 http:// 或 https:// 开头' }
  }
  const defaultModel = typeof input.defaultModel === 'string' ? input.defaultModel.trim() : ''
  if (!defaultModel) return { ok: false, detail: '默认模型不能为空' }
  if (defaultModel.length > 128) return { ok: false, detail: '默认模型名不能超过 128 字符' }
  const inPrice = validatePrice(input.inputPricePerM, '输入价格')
  if (!inPrice.ok) return inPrice
  const outPrice = validatePrice(input.outputPricePerM, '输出价格')
  if (!outPrice.ok) return outPrice
  return {
    ok: true,
    value: {
      name,
      kind: input.kind,
      baseUrl,
      defaultModel,
      inputPricePerM: inPrice.value,
      outputPricePerM: outPrice.value
    }
  }
}

export interface ValidatedMcpServer {
  name: string
  command: string
  args: string[]
  enabled: boolean
  env?: Record<string, string>
}

export type McpServerValidationResult =
  | { ok: true; value: ValidatedMcpServer }
  | { ok: false; detail: string }

export function validateMcpServerInput(input: {
  name?: unknown
  command?: unknown
  args?: unknown
  enabled?: unknown
  env?: unknown
}): McpServerValidationResult {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) return { ok: false, detail: 'MCP Server 名称不能为空' }
  if (name.length > 40) return { ok: false, detail: 'MCP Server 名称不能超过 40 字符' }
  const command = typeof input.command === 'string' ? input.command.trim() : ''
  if (!command) return { ok: false, detail: '启动命令不能为空' }
  if (!Array.isArray(input.args) || !input.args.every((a) => typeof a === 'string')) {
    return { ok: false, detail: '参数必须是字符串数组' }
  }
  const args = (input.args as string[]).map((a) => a)
  const enabled = input.enabled !== false
  const value: ValidatedMcpServer = { name, command, args, enabled }
  if (input.env !== undefined && input.env !== null) {
    if (typeof input.env !== 'object' || Array.isArray(input.env)) {
      return { ok: false, detail: '环境变量必须是键值对象' }
    }
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(input.env as Record<string, unknown>)) {
      if (!k.trim()) return { ok: false, detail: '环境变量的键不能为空' }
      if (typeof v !== 'string') return { ok: false, detail: `环境变量「${k}」的值必须是字符串` }
      env[k] = v
    }
    value.env = env
  }
  return { ok: true, value }
}

export function parseRefineInstructions(raw: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  } catch {
    return []
  }
}

export type ProjectValidationResult = { ok: true } | { ok: false; detail: string }

export function validateProjectInput(
  name: string,
  description: string,
  savedInstructions: string
): ProjectValidationResult {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, detail: '项目名称不能为空' }
  if (trimmed.length > 80) return { ok: false, detail: '项目名称不能超过 80 字符' }
  if (description.length > 2000) return { ok: false, detail: '项目说明不能超过 2000 字符' }
  if (savedInstructions.length > 4000) return { ok: false, detail: '固定要求不能超过 4000 字符' }
  return { ok: true }
}

export interface CitationResult {
  quote: string
  found: boolean
}

export function checkCitations(source: string, quotes: string[]): CitationResult[] {
  const norm = (s: string): string => s.replace(/\s+/g, '')
  const normalizedSource = norm(source)
  return quotes.map((q) => ({
    quote: q,
    found: q.trim().length > 0 && normalizedSource.includes(norm(q))
  }))
}
