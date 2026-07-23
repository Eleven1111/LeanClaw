import { getDb, now, uid } from './db'
import { getRuntimeConfig } from './config'
import type { ProviderConfig, TierMap } from './config'
import { normalizeBaseUrl, parseOpenAiCompatResponse } from '../shared/verify'
import type { OutlineSchema } from '../shared/verify'
import type { ModelTier } from '../shared/types'

export interface ModelResult {
  text: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  model: string
}

const SRC_BEGIN = '<<<SOURCE'
const SRC_END = 'SOURCE>>>'

const REFINE_BEGIN = '<<<REFINE_INSTRUCTIONS'
const REFINE_END = 'REFINE_INSTRUCTIONS>>>'

export function buildRefineSection(instructions: string[]): string {
  if (!instructions.length) return ''
  const lines = instructions.map((s, i) => `${i + 1}. ${s}`)
  return [
    REFINE_BEGIN,
    '用户修改要求（按提出顺序，最新在最后，请务必逐条落实）：',
    ...lines,
    REFINE_END
  ].join('\n')
}

export function buildSummaryPrompt(source: string, goal: string, refine: string[] = []): string {
  return [
    '你是一个严谨的文档整理助手。阅读下面的源文件内容，输出严格的 JSON（不要 markdown 代码块），格式为：',
    '{"title": "摘要标题", "summary": "200 字以内的中文摘要", "quotes": ["原文中逐字存在的引用 1", "原文中逐字存在的引用 2"]}',
    'quotes 必须是源文件中逐字连续出现的句子片段，禁止任何改写。',
    `用户目标：${goal}`,
    buildRefineSection(refine),
    SRC_BEGIN,
    source,
    SRC_END
  ]
    .filter((s) => s !== '')
    .join('\n')
}

const RESEARCH_SRC_BEGIN = '<<<SOURCE url='
const RESEARCH_SRC_HEADER_END = '>>>'
const RESEARCH_SRC_END = '<<<END>>>'

export function buildResearchPrompt(
  sources: { url: string; title: string; text: string }[],
  goal: string,
  refine: string[] = []
): string {
  const blocks = sources
    .map((s) => `${RESEARCH_SRC_BEGIN}${s.url}${RESEARCH_SRC_HEADER_END}\n${s.text}\n${RESEARCH_SRC_END}`)
    .join('\n\n')
  return [
    '你是一个严谨的研究分析助手。基于下面提供的多个来源，撰写一份中文研究报告，输出严格的 JSON（不要 markdown 代码块），格式为：',
    '{"title": string, "sections": [{"heading": string, "content": string}]（至少 2 节）, ' +
      '"citations": [{"quote": "逐字引用", "url": "来源 URL"}]（至少 2 条）}',
    'citations 的 quote 必须是对应 url 来源正文中逐字连续出现的句子片段，禁止改写或编造。',
    `研究目标：${goal}`,
    buildRefineSection(refine),
    blocks
  ]
    .filter((s) => s !== '')
    .join('\n\n')
}

const OUTLINE_SRC_BEGIN = '<<<OUTLINE_SOURCE'
const OUTLINE_SRC_END = 'OUTLINE_SOURCE>>>'
const DRAFT_SRC_BEGIN = '<<<DRAFT_SOURCE'
const DRAFT_SRC_END = 'DRAFT_SOURCE>>>'
const DRAFT_OUTLINE_BEGIN = '<<<DRAFT_OUTLINE'
const DRAFT_OUTLINE_END = 'DRAFT_OUTLINE>>>'

export function buildOutlinePrompt(source: string, goal: string): string {
  return [
    '你是一个内容策划助手，负责基于素材整理出适合发布的文章大纲。阅读下面的素材内容，输出严格的 JSON（不要 markdown 代码块），格式为：',
    '{"title": string, "outline": [string]}（outline 需包含 3-6 条，按逻辑顺序覆盖素材要点）',
    `用户目标（含平台要求）：${goal}`,
    OUTLINE_SRC_BEGIN,
    source,
    OUTLINE_SRC_END
  ].join('\n')
}

export function buildDraftPrompt(
  source: string,
  outline: OutlineSchema,
  goal: string,
  refine: string[] = []
): string {
  return [
    '你是一个专业内容创作者。基于下面的素材和已确认的大纲，撰写一篇适合发布的中文文章正文。',
    '直接输出 Markdown 正文（不要输出 JSON、不要代码块包裹），要求：以 "# " 开头的一级标题、按大纲顺序组织为若干小节、全文不少于 600 字。',
    `用户目标（含平台要求）：${goal}`,
    buildRefineSection(refine),
    DRAFT_OUTLINE_BEGIN,
    JSON.stringify(outline),
    DRAFT_OUTLINE_END,
    DRAFT_SRC_BEGIN,
    source,
    DRAFT_SRC_END
  ]
    .filter((s) => s !== '')
    .join('\n')
}

function extractSource(prompt: string): string {
  const i = prompt.indexOf(SRC_BEGIN)
  const j = prompt.lastIndexOf(SRC_END)
  return i >= 0 && j > i ? prompt.slice(i + SRC_BEGIN.length, j).trim() : ''
}

function extractBetween(prompt: string, begin: string, end: string): string {
  const i = prompt.indexOf(begin)
  const j = prompt.lastIndexOf(end)
  return i >= 0 && j > i ? prompt.slice(i + begin.length, j).trim() : ''
}

function extractResearchSources(prompt: string): { url: string; text: string }[] {
  const re = /<<<SOURCE url=(.*?)>>>\n([\s\S]*?)<<<END>>>/g
  const out: { url: string; text: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(prompt))) {
    out.push({ url: m[1].trim(), text: m[2].trim() })
  }
  return out
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？.!?])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
}

function pickSentence(text: string): string {
  const sentences = splitSentences(text)
  return sentences[0] ?? text.slice(0, 20)
}

function isResearchPrompt(prompt: string): boolean {
  return prompt.includes('"citations"') && prompt.includes('"sections"')
}

function isOutlinePrompt(prompt: string): boolean {
  return prompt.includes(OUTLINE_SRC_BEGIN)
}

function isDraftPrompt(prompt: string): boolean {
  return prompt.includes(DRAFT_SRC_BEGIN)
}

function extractLatestRefine(prompt: string): string | null {
  const block = extractBetween(prompt, REFINE_BEGIN, REFINE_END)
  if (!block) return null
  const matches = [...block.matchAll(/^\s*\d+\.\s(.+)$/gm)].map((m) => m[1].trim())
  return matches.length ? matches[matches.length - 1] : null
}

function refineNote(prompt: string): string {
  const latest = extractLatestRefine(prompt)
  return latest ? `（已按修改要求调整：${latest.slice(0, 20)}）` : ''
}

function mockCostUsd(): number {
  return process.env.LEANCLAW_FAULT === 'expensive_model' ? 0.06 : 0
}

async function mockSummaryComplete(prompt: string): Promise<ModelResult> {
  await new Promise((r) => setTimeout(r, 300))
  const source = extractSource(prompt)
  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 8)
  const q1 = lines[0] ?? source.slice(0, 20)
  let q2 = lines[Math.floor(lines.length / 2)] ?? q1
  if (process.env.LEANCLAW_FAULT === 'bad_citation') {
    q2 = '这句话在源文件中并不存在（LEANCLAW_FAULT=bad_citation 注入）'
  }
  const draft = {
    title: '源文件要点摘要',
    summary: `${refineNote(prompt)}本文共 ${source.length} 字符、${lines.length} 个要点，围绕精益执行的核心机制展开：异常显性化、按需生产、标准作业与持续改善，并说明了将这些原则映射到 AI 任务执行的方式。`,
    quotes: [q1, q2]
  }
  const text = JSON.stringify(draft, null, 2)
  return {
    text,
    tokensIn: Math.ceil(prompt.length / 4),
    tokensOut: Math.ceil(text.length / 4),
    costUsd: mockCostUsd(),
    model: 'mock-local'
  }
}

async function mockResearchComplete(prompt: string): Promise<ModelResult> {
  await new Promise((r) => setTimeout(r, 300))
  const sources = extractResearchSources(prompt)
  const s0 = sources[0] ?? { url: '', text: '' }
  const s1 = sources[1] ?? s0
  const q1 = pickSentence(s0.text)
  let q2 = pickSentence(s1.text)
  if (process.env.LEANCLAW_FAULT === 'bad_citation') {
    q2 = '这句话并未出现在任何来源正文中（LEANCLAW_FAULT=bad_citation 注入）'
  }
  const report = {
    title: `研究报告：基于 ${sources.length} 个来源的分析`,
    sections: [
      { heading: '概述', content: `${refineNote(prompt)}本报告基于 ${sources.length} 个联网检索来源，围绕研究目标展开分析。` },
      { heading: '关键发现', content: '各来源的信息相互印证，指向该领域正在快速发展的共同结论，具体见下方引用。' }
    ],
    citations: [
      { quote: q1, url: s0.url },
      { quote: q2, url: s1.url }
    ]
  }
  const text = JSON.stringify(report, null, 2)
  return {
    text,
    tokensIn: Math.ceil(prompt.length / 4),
    tokensOut: Math.ceil(text.length / 4),
    costUsd: mockCostUsd(),
    model: 'mock-local'
  }
}

async function mockOutlineComplete(prompt: string): Promise<ModelResult> {
  await new Promise((r) => setTimeout(r, 300))
  const source = extractBetween(prompt, OUTLINE_SRC_BEGIN, OUTLINE_SRC_END)
  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 4)
  const base = lines.length > 0 ? lines : [source.slice(0, 20) || '素材要点']
  const outline = {
    title: `内容大纲：${(lines[0] ?? '素材整理').slice(0, 24)}`,
    outline: [0, 1, 2, 3].map((i) => base[i % base.length])
  }
  const text = JSON.stringify(outline, null, 2)
  return {
    text,
    tokensIn: Math.ceil(prompt.length / 4),
    tokensOut: Math.ceil(text.length / 4),
    costUsd: mockCostUsd(),
    model: 'mock-local'
  }
}

async function mockDraftComplete(prompt: string): Promise<ModelResult> {
  await new Promise((r) => setTimeout(r, 300))
  const source = extractBetween(prompt, DRAFT_SRC_BEGIN, DRAFT_SRC_END)
  const outlineRaw = extractBetween(prompt, DRAFT_OUTLINE_BEGIN, DRAFT_OUTLINE_END)
  let outline: OutlineSchema
  try {
    outline = JSON.parse(outlineRaw) as OutlineSchema
  } catch {
    outline = { title: '文章', outline: ['引言', '正文', '总结'] }
  }
  const paragraphs = source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const fallback = source.slice(0, 60) || '内容待补充。'
  const sections = outline.outline
    .map((heading, idx) => {
      const p = paragraphs[idx % Math.max(paragraphs.length, 1)] ?? fallback
      return `## ${heading}\n\n${p}${p}${p}`
    })
    .join('\n\n')
  const note = refineNote(prompt)
  let body = `# ${outline.title}\n\n${note ? note + '\n\n' : ''}${sections}`
  if (process.env.LEANCLAW_FAULT === 'banned_word') {
    body += '\n\n本方法史上最有效，值得长期坚持实践。'
  }
  while (body.length < 650) {
    body += `\n\n${fallback}`
  }
  return {
    text: body,
    tokensIn: Math.ceil(prompt.length / 4),
    tokensOut: Math.ceil(body.length / 4),
    costUsd: mockCostUsd(),
    model: 'mock-local'
  }
}

async function mockComplete(prompt: string): Promise<ModelResult> {
  if (isDraftPrompt(prompt)) return mockDraftComplete(prompt)
  if (isOutlinePrompt(prompt)) return mockOutlineComplete(prompt)
  return isResearchPrompt(prompt) ? mockResearchComplete(prompt) : mockSummaryComplete(prompt)
}

const ANTHROPIC_DEFAULT_BASE = 'https://api.anthropic.com'

async function anthropicComplete(
  prompt: string,
  apiKey: string,
  model: string,
  baseUrl: string = ANTHROPIC_DEFAULT_BASE,
  maxTokens = 1024,
  signal?: AbortSignal
): Promise<ModelResult> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal
  })
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    content?: { text?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const text = (data.content ?? []).map((b) => b.text ?? '').join('')
  const tokensIn = data.usage?.input_tokens ?? 0
  const tokensOut = data.usage?.output_tokens ?? 0
  return { text, tokensIn, tokensOut, costUsd: tokensIn * 3e-6 + tokensOut * 15e-6, model }
}

async function openaiCompatComplete(
  provider: ProviderConfig,
  prompt: string,
  maxTokens = 1024,
  signal?: AbortSignal
): Promise<ModelResult> {
  const res = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey ?? ''}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: provider.defaultModel,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal
  })
  if (!res.ok) {
    throw new Error(`OpenAI-compatible API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const parsed = parseOpenAiCompatResponse(await res.json())
  const inRate = (provider.inputPricePerM ?? 0) / 1e6
  const outRate = (provider.outputPricePerM ?? 0) / 1e6
  return {
    text: parsed.text,
    tokensIn: parsed.tokensIn,
    tokensOut: parsed.tokensOut,
    costUsd: parsed.tokensIn * inRate + parsed.tokensOut * outRate,
    model: provider.defaultModel
  }
}

export async function completeWith(
  provider: ProviderConfig,
  prompt: string,
  maxTokens = 1024,
  signal?: AbortSignal
): Promise<ModelResult> {
  if (process.env.LEANCLAW_FAULT === 'primary_500') {
    throw new Error('HTTP 500（LEANCLAW_FAULT=primary_500 注入）')
  }
  const r =
    provider.kind === 'anthropic'
      ? await anthropicComplete(
          prompt,
          provider.apiKey ?? '',
          provider.defaultModel,
          provider.baseUrl || ANTHROPIC_DEFAULT_BASE,
          maxTokens,
          signal
        )
      : await openaiCompatComplete(provider, prompt, maxTokens, signal)
  return { ...r, model: `${provider.name}:${provider.defaultModel}` }
}

function resolveDefaultProvider(): ProviderConfig | null {
  const { providers, defaultProviderId } = getRuntimeConfig()
  if (!defaultProviderId) return null
  const p = providers.find((x) => x.id === defaultProviderId)
  return p && p.apiKey ? p : null
}

const MOCK_PROVIDER_ID = 'mock'

export interface TierChoiceEntry {
  providerId: string
  model: string
}

export interface TierChoiceResult {
  primary: TierChoiceEntry | null
  fallback: TierChoiceEntry | null
}

function providerAvailable(providerId: string, providers: ProviderConfig[]): boolean {
  if (providerId === MOCK_PROVIDER_ID) return true
  return providers.some((p) => p.id === providerId && !!p.apiKey)
}

export function resolveTierChoice(
  tierMap: TierMap,
  tier: ModelTier | undefined,
  providers: ProviderConfig[]
): TierChoiceResult {
  if (!tier) return { primary: null, fallback: null }
  const route = tierMap[tier]
  if (!route) return { primary: null, fallback: null }
  const primary = providerAvailable(route.providerId, providers)
    ? { providerId: route.providerId, model: route.model }
    : null
  const fallback =
    route.fallback && providerAvailable(route.fallback.providerId, providers)
      ? { providerId: route.fallback.providerId, model: route.fallback.model }
      : null
  return { primary, fallback }
}

type ResolvedTarget = ProviderConfig | typeof MOCK_PROVIDER_ID | null

function resolveProviderForRoute(entry: TierChoiceEntry, providers: ProviderConfig[]): ResolvedTarget {
  if (entry.providerId === MOCK_PROVIDER_ID) return MOCK_PROVIDER_ID
  const p = providers.find((x) => x.id === entry.providerId)
  return p ? { ...p, defaultModel: entry.model } : MOCK_PROVIDER_ID
}

async function runTarget(
  target: ResolvedTarget,
  prompt: string,
  apiKey: string | null,
  model: string
): Promise<ModelResult> {
  if (target === MOCK_PROVIDER_ID) return mockComplete(prompt)
  if (target) return completeWith(target, prompt)
  const fallbackProvider = resolveDefaultProvider()
  if (fallbackProvider) return completeWith(fallbackProvider, prompt)
  if (apiKey) return anthropicComplete(prompt, apiKey, model)
  return mockComplete(prompt)
}

function labelForTarget(target: ResolvedTarget, apiKey: string | null, model: string): string {
  if (target === MOCK_PROVIDER_ID) return 'mock-local'
  if (target) return `${target.name}:${target.defaultModel}`
  const fallbackProvider = resolveDefaultProvider()
  if (fallbackProvider) return `${fallbackProvider.name}:${fallbackProvider.defaultModel}`
  return apiKey ? model : 'mock-local'
}

function insertModelCallOk(id: string, stepId: string, r: ModelResult, prompt: string): void {
  getDb()
    .prepare(
      `INSERT INTO model_calls
       (id, step_id, model, input_chars, output_chars, tokens_in, tokens_out, cost_usd, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(id, stepId, r.model, prompt.length, r.text.length, r.tokensIn, r.tokensOut, r.costUsd, 'ok', now())
}

function insertModelCallError(id: string, stepId: string, modelLabel: string, prompt: string, e: Error): void {
  getDb()
    .prepare(
      `INSERT INTO model_calls (id, step_id, model, input_chars, status, error, created_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(id, stepId, modelLabel, prompt.length, 'error', e.message, now())
}

export interface ModelFallbackEvent {
  tier: ModelTier
  from: string
  to: string
  error: string
}

export interface CallModelOutcome extends ModelResult {
  fallback?: ModelFallbackEvent
}

export async function callModel(
  stepId: string,
  prompt: string,
  tier?: ModelTier
): Promise<CallModelOutcome> {
  const { apiKey, model, providers, tierMap } = getRuntimeConfig()
  const choice = resolveTierChoice(tierMap, tier, providers)
  const primaryTarget = choice.primary ? resolveProviderForRoute(choice.primary, providers) : null
  const primaryLabel = labelForTarget(primaryTarget, apiKey, model)
  const id = uid()
  try {
    const r = await runTarget(primaryTarget, prompt, apiKey, model)
    insertModelCallOk(id, stepId, r, prompt)
    return r
  } catch (e) {
    insertModelCallError(id, stepId, primaryLabel, prompt, e as Error)
    if (!tier || !choice.fallback) throw e
    const fallbackTarget = resolveProviderForRoute(choice.fallback, providers)
    const fallbackLabel = labelForTarget(fallbackTarget, apiKey, model)
    const fallbackId = uid()
    try {
      const r2 = await runTarget(fallbackTarget, prompt, apiKey, model)
      insertModelCallOk(fallbackId, stepId, r2, prompt)
      return {
        ...r2,
        fallback: { tier, from: primaryLabel, to: r2.model, error: (e as Error).message }
      }
    } catch (e2) {
      insertModelCallError(fallbackId, stepId, fallbackLabel, prompt, e2 as Error)
      throw e
    }
  }
}
