import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { getWorkspaceDir } from '../db'
import { ToolError } from '../tool-types'
import { buildResearchPrompt } from '../model'
import { checkCitations, parseReport, type ReportSchema } from '../../shared/verify'
import type { LoopTemplate } from '../recipe'

const GENERATE_IDX = 2
const WRITE_IDX = 5
const SOURCE_TYPE_PREFIX = 'source:'
const MAX_SOURCES = 3
const MIN_SOURCES = 2

function renderReportMarkdown(report: ReportSchema): string {
  const sections = report.sections.map((s) => `## ${s.heading}\n\n${s.content}`).join('\n\n')
  const citations = report.citations
    .map((c, i) => `[${i + 1}] "${c.quote}" — ${c.url}`)
    .join('\n')
  const sourceUrls = Array.from(new Set(report.citations.map((c) => c.url)))
  const sourceList = sourceUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')
  return `# ${report.title}\n\n${sections}\n\n## 引用\n\n${citations}\n\n---\n来源列表：\n\n${sourceList}\n`
}

export const deepResearchRecipe: LoopTemplate = {
  id: 'deep-research',
  title: '深度研究：检索 → 抓取来源 → 生成报告 → 核验引用 → 交付',
  goal: '基于联网检索的多个来源，生成一份带逐字引用核验的中文研究报告',
  requiredInputs: [],
  refineStepIndex: GENERATE_IDX,
  steps: [
    {
      name: 'search_sources',
      title: '检索来源',
      kind: 'tool',
      async run(ctx) {
        const res = await ctx.callTool('web.search', { query: ctx.goal, limit: 5 })
        const results = (res.data?.results ?? []) as { title: string; url: string }[]
        ctx.saveArtifact({
          type: 'search_results',
          title: '检索结果',
          content: JSON.stringify(results),
          mimeType: 'application/json',
          producer: 'tool:web.search'
        })
        return res.summary
      }
    },
    {
      name: 'fetch_sources',
      title: '抓取来源正文',
      kind: 'tool',
      async run(ctx) {
        const sr = ctx.getArtifact('search_results')
        const results = JSON.parse(sr.content ?? '[]') as { title: string; url: string }[]
        const summaries: string[] = []
        const failures: string[] = []
        let saved = 0
        for (const { url, title: fallbackTitle } of results) {
          if (saved >= MAX_SOURCES) break
          let res: Awaited<ReturnType<typeof ctx.callTool>>
          try {
            res = await ctx.callTool('web.fetch', { url })
          } catch (e) {
            failures.push(`${url}（${(e as Error).message}）`)
            continue
          }
          const title = String(res.data?.title ?? fallbackTitle ?? url)
          const text = String(res.data?.text ?? '')
          if (text.length < 200) {
            failures.push(`${url}（正文过短，疑似反爬页面）`)
            continue
          }
          ctx.saveArtifact({
            type: `${SOURCE_TYPE_PREFIX}${saved}`,
            title,
            content: text,
            origin: url,
            mimeType: 'text/plain',
            producer: 'tool:web.fetch',
            sourceArtifactIds: [sr.id]
          })
          summaries.push(`${title}（${text.length} 字符）`)
          saved++
        }
        if (saved < MIN_SOURCES) {
          throw new ToolError(
            `可用来源不足（成功 ${saved}/${MIN_SOURCES}）：${failures.join('；') || '检索结果为空'}`,
            true
          )
        }
        const failNote = failures.length > 0 ? `；跳过 ${failures.length} 个不可用来源` : ''
        return `已抓取 ${saved} 个来源：${summaries.join('；')}${failNote}`
      }
    },
    {
      name: 'generate_report',
      title: '生成研究报告草稿',
      kind: 'model',
      tier: 'generation',
      async run(ctx) {
        const sources = ctx.getArtifacts(SOURCE_TYPE_PREFIX)
        const prompt = buildResearchPrompt(
          sources.map((s) => ({ url: s.origin ?? '', title: s.title, text: s.content ?? '' })),
          ctx.goal,
          ctx.refineInstructions
        )
        const text = await ctx.callModel(prompt)
        ctx.saveArtifact({
          type: 'report_draft',
          title: '研究报告草稿（JSON）',
          content: text,
          mimeType: 'application/json',
          producer: 'model',
          sourceArtifactIds: sources.map((s) => s.id)
        })
        return `报告草稿已生成（${text.length} 字符）`
      }
    },
    {
      name: 'verify_report_schema',
      title: '校验报告结构（Schema）',
      kind: 'verify',
      async run(ctx) {
        const draft = ctx.getArtifact('report_draft')
        const r = parseReport(draft.content ?? '')
        ctx.addVerification(
          'schema',
          r.ok ? 'passed' : 'failed',
          r.ok ? 'title / sections / citations 均符合输出契约' : r.detail,
          draft.id
        )
        if (!r.ok) ctx.failVerification(`报告不符合输出契约：${r.detail}`, GENERATE_IDX)
        return 'Schema 校验通过'
      }
    },
    {
      name: 'verify_report_citations',
      title: '核验引用存在性（Evidence）',
      kind: 'verify',
      async run(ctx) {
        const draft = ctx.getArtifact('report_draft')
        const parsed = parseReport(draft.content ?? '')
        if (!parsed.ok) return ctx.failVerification('报告无法解析，无法核验引用', GENERATE_IDX)
        const sources = ctx.getArtifacts(SOURCE_TYPE_PREFIX)
        const textByUrl = new Map(sources.map((s) => [s.origin ?? '', s.content ?? '']))
        let allOk = true
        parsed.report.citations.forEach((c, i) => {
          const sourceText = textByUrl.get(c.url) ?? ''
          const [result] = checkCitations(sourceText, [c.quote])
          if (!result.found) allOk = false
          ctx.addEvidence({
            artifactId: draft.id,
            sourceType: 'web',
            locator: `${c.url}#quote-${i + 1}`,
            excerpt: c.quote,
            verificationStatus: result.found ? 'verified' : 'failed'
          })
        })
        ctx.addVerification(
          'evidence',
          allOk ? 'passed' : 'failed',
          allOk
            ? `${parsed.report.citations.length} 条引用全部逐字存在于对应来源`
            : '存在无法在对应来源中找到的引用',
          draft.id
        )
        if (!allOk) {
          ctx.failVerification(
            '存在无法在对应来源中找到的引用（可从「生成研究报告草稿」检查点重试）',
            GENERATE_IDX
          )
        }
        return `${parsed.report.citations.length} 条引用全部核验通过`
      }
    },
    {
      name: 'write_report',
      title: '写入研究报告（需批准）',
      kind: 'tool',
      async run(ctx) {
        const draft = ctx.getArtifact('report_draft')
        const parsed = parseReport(draft.content ?? '')
        if (!parsed.ok) return ctx.failVerification('报告无法解析，无法生成交付文件', GENERATE_IDX)
        const outPath = join(getWorkspaceDir(), 'research-report.md')
        const md = renderReportMarkdown(parsed.report)
        const res = await ctx.callTool('fs.write', { path: outPath, content: md })
        ctx.saveArtifact({
          type: 'deliverable',
          title: 'research-report.md',
          content: md,
          localPath: outPath,
          producer: 'tool:fs.write',
          sourceArtifactIds: [draft.id]
        })
        return res.summary
      }
    },
    {
      name: 'verify_output',
      title: '验证交付文件（确定性）',
      kind: 'verify',
      async run(ctx) {
        const art = ctx.getArtifact('deliverable')
        const path = art.local_path ?? ''
        const problems: string[] = []
        if (!existsSync(path)) {
          problems.push('文件不存在')
        } else {
          if (statSync(path).size === 0) problems.push('文件为空')
          if (!readFileSync(path, 'utf8').startsWith('# ')) problems.push('缺少一级标题')
        }
        const ok = problems.length === 0
        ctx.addVerification(
          'deterministic',
          ok ? 'passed' : 'failed',
          ok ? '文件存在、非空、含一级标题' : problems.join('；'),
          art.id
        )
        if (!ok) ctx.failVerification(`交付文件验证失败：${problems.join('；')}`, WRITE_IDX)
        return '交付文件验证通过'
      }
    },
    {
      name: 'deliver',
      title: '交付',
      kind: 'deliver',
      async run(ctx) {
        const art = ctx.getArtifact('deliverable')
        if (ctx.countOpenBlockers() > 0) {
          ctx.failVerification('存在未处理的 Andon 或待批准事项，交付门不满足', WRITE_IDX)
        }
        ctx.markDelivered(art.id)
        return `任务已交付：${art.title}`
      }
    }
  ]
}
