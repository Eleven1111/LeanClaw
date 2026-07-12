import { existsSync, readFileSync, statSync } from 'fs'
import { basename, dirname, join } from 'path'
import { buildSummaryPrompt } from '../model'
import { checkCitations, parseDraft } from '../../shared/verify'
import type { LoopTemplate } from '../recipe'

const GENERATE_IDX = 1
const WRITE_IDX = 4

function renderMarkdown(d: { title: string; summary: string; quotes: string[] }, inputPath: string): string {
  const quotes = d.quotes.map((q, i) => `> [${i + 1}] ${q}`).join('\n>\n')
  return `# ${d.title}\n\n${d.summary}\n\n## 引用（已核验存在于源文件）\n\n${quotes}\n\n---\n来源：\`${inputPath}\`\n`
}

function outputPathFor(inputPath: string): string {
  if (process.env.LEANCLAW_FAULT === 'forbidden_path') {
    return '/private/tmp/leanclaw-forbidden-demo.md'
  }
  const base = basename(inputPath).replace(/\.[^.]+$/, '')
  return join(dirname(inputPath), `${base}.summary.md`)
}

export const fileEditRecipe: LoopTemplate = {
  id: 'file-edit-summarize',
  title: '文件整理：读取 → 摘要 → 核验 → 批准写入',
  goal: '读取一个本地文本文件，生成带可核验引用的摘要，并在人工批准后写入交付文件',
  requiredInputs: ['inputPath'],
  refineStepIndex: GENERATE_IDX,
  steps: [
    {
      name: 'read_input',
      title: '读取输入文件',
      kind: 'tool',
      async run(ctx) {
        const res = await ctx.callTool('fs.read', { path: ctx.inputPath })
        const content = String(res.data?.content ?? '')
        ctx.saveArtifact({
          type: 'source',
          title: `源文件：${basename(ctx.inputPath)}`,
          content,
          mimeType: 'text/plain',
          producer: 'tool:fs.read'
        })
        return res.summary
      }
    },
    {
      name: 'generate_summary',
      title: '生成摘要草稿',
      kind: 'model',
      tier: 'generation',
      async run(ctx) {
        const src = ctx.getArtifact('source')
        const text = await ctx.callModel(
          buildSummaryPrompt(src.content ?? '', ctx.goal, ctx.refineInstructions)
        )
        ctx.saveArtifact({
          type: 'draft',
          title: '摘要草稿（JSON）',
          content: text,
          mimeType: 'application/json',
          producer: 'model',
          sourceArtifactIds: [src.id]
        })
        return `草稿已生成（${text.length} 字符）`
      }
    },
    {
      name: 'verify_schema',
      title: '校验草稿结构（Schema）',
      kind: 'verify',
      async run(ctx) {
        const draft = ctx.getArtifact('draft')
        const r = parseDraft(draft.content ?? '')
        ctx.addVerification(
          'schema',
          r.ok ? 'passed' : 'failed',
          r.ok ? 'title / summary / quotes 均符合输出契约' : r.detail,
          draft.id
        )
        if (!r.ok) ctx.failVerification(`草稿不符合输出契约：${r.detail}`, GENERATE_IDX)
        return 'Schema 校验通过'
      }
    },
    {
      name: 'verify_citations',
      title: '核验引用存在性（Evidence）',
      kind: 'verify',
      async run(ctx) {
        const src = ctx.getArtifact('source')
        const draft = ctx.getArtifact('draft')
        const parsed = parseDraft(draft.content ?? '')
        if (!parsed.ok) return ctx.failVerification('草稿无法解析，无法核验引用', GENERATE_IDX)
        const results = checkCitations(src.content ?? '', parsed.draft.quotes)
        results.forEach((r, i) =>
          ctx.addEvidence({
            artifactId: draft.id,
            sourceType: 'file',
            locator: `${ctx.inputPath}#quote-${i + 1}`,
            excerpt: r.quote,
            verificationStatus: r.found ? 'verified' : 'failed'
          })
        )
        const missing = results.filter((r) => !r.found)
        ctx.addVerification(
          'evidence',
          missing.length === 0 ? 'passed' : 'failed',
          missing.length === 0
            ? `${results.length} 条引用全部逐字存在于源文件`
            : `${missing.length} 条引用无法在源文件中找到`,
          draft.id
        )
        if (missing.length > 0) {
          ctx.failVerification(
            `${missing.length} 条引用无法在源文件中找到（可从「生成摘要草稿」检查点重试）`,
            GENERATE_IDX
          )
        }
        return `${results.length} 条引用全部核验通过`
      }
    },
    {
      name: 'write_output',
      title: '写入交付文件（需批准）',
      kind: 'tool',
      async run(ctx) {
        const draft = ctx.getArtifact('draft')
        const parsed = parseDraft(draft.content ?? '')
        if (!parsed.ok) return ctx.failVerification('草稿无法解析，无法生成交付文件', GENERATE_IDX)
        const outPath = outputPathFor(ctx.inputPath)
        const md = renderMarkdown(parsed.draft, ctx.inputPath)
        const res = await ctx.callTool('fs.write', { path: outPath, content: md })
        ctx.saveArtifact({
          type: 'deliverable',
          title: basename(outPath),
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
