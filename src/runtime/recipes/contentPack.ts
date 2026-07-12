import { existsSync, readFileSync, statSync } from 'fs'
import { basename, dirname, join } from 'path'
import { buildDraftPrompt, buildOutlinePrompt } from '../model'
import { checkContentRules, parseOutline, type ContentRules } from '../../shared/verify'
import type { LoopTemplate } from '../recipe'

const GENERATE_OUTLINE_IDX = 1
const GENERATE_DRAFT_IDX = 3
const WRITE_IDX = 5

const CONTENT_RULES: ContentRules = {
  bannedWords: ['史上最', '全网第一', '绝对有效', '100%', '秒杀全场'],
  minLength: 400,
  maxLength: 20000,
  mustStartWith: '# '
}

function outputPathFor(inputPath: string): string {
  const base = basename(inputPath).replace(/\.[^.]+$/, '')
  return join(dirname(inputPath), `${base}.article.md`)
}

export const contentPackRecipe: LoopTemplate = {
  id: 'content-pack',
  title: '内容生产：素材 → 大纲 → 初稿 → 规则核验 → 交付',
  goal: '基于素材和平台要求，生成一篇符合发布规则的文章',
  requiredInputs: ['inputPath'],
  refineStepIndex: GENERATE_DRAFT_IDX,
  steps: [
    {
      name: 'read_material',
      title: '读取素材文件',
      kind: 'tool',
      async run(ctx) {
        const res = await ctx.callTool('fs.read', { path: ctx.inputPath })
        const content = String(res.data?.content ?? '')
        ctx.saveArtifact({
          type: 'source',
          title: `素材：${basename(ctx.inputPath)}`,
          content,
          mimeType: 'text/plain',
          producer: 'tool:fs.read'
        })
        return res.summary
      }
    },
    {
      name: 'generate_outline',
      title: '生成文章大纲',
      kind: 'model',
      tier: 'planning',
      async run(ctx) {
        const src = ctx.getArtifact('source')
        const text = await ctx.callModel(buildOutlinePrompt(src.content ?? '', ctx.goal))
        ctx.saveArtifact({
          type: 'outline',
          title: '文章大纲（JSON）',
          content: text,
          mimeType: 'application/json',
          producer: 'model',
          sourceArtifactIds: [src.id]
        })
        return `大纲已生成（${text.length} 字符）`
      }
    },
    {
      name: 'verify_outline',
      title: '校验大纲结构（Schema）',
      kind: 'verify',
      async run(ctx) {
        const outline = ctx.getArtifact('outline')
        const r = parseOutline(outline.content ?? '')
        ctx.addVerification(
          'schema',
          r.ok ? 'passed' : 'failed',
          r.ok ? 'title / outline 均符合输出契约' : r.detail,
          outline.id
        )
        if (!r.ok) ctx.failVerification(`大纲不符合输出契约：${r.detail}`, GENERATE_OUTLINE_IDX)
        return 'Schema 校验通过'
      }
    },
    {
      name: 'generate_draft',
      title: '生成文章初稿',
      kind: 'model',
      tier: 'generation',
      async run(ctx) {
        const src = ctx.getArtifact('source')
        const outlineArt = ctx.getArtifact('outline')
        const parsed = parseOutline(outlineArt.content ?? '')
        if (!parsed.ok) return ctx.failVerification('大纲无法解析，无法生成初稿', GENERATE_OUTLINE_IDX)
        const text = await ctx.callModel(
          buildDraftPrompt(src.content ?? '', parsed.outline, ctx.goal, ctx.refineInstructions)
        )
        ctx.saveArtifact({
          type: 'draft',
          title: '文章初稿（Markdown）',
          content: text,
          mimeType: 'text/markdown',
          producer: 'model',
          sourceArtifactIds: [src.id, outlineArt.id]
        })
        return `初稿已生成（${text.length} 字符）`
      }
    },
    {
      name: 'verify_rules',
      title: '核验内容规则（禁用词/长度/格式）',
      kind: 'verify',
      async run(ctx) {
        const draft = ctx.getArtifact('draft')
        const r = checkContentRules(draft.content ?? '', CONTENT_RULES)
        ctx.addVerification(
          'deterministic',
          r.ok ? 'passed' : 'failed',
          r.ok
            ? '内容规则检查通过（规则检查：禁用词/长度/格式）'
            : `规则检查未通过：${r.problems.join('；')}`,
          draft.id
        )
        if (!r.ok) {
          ctx.failVerification(`内容规则检查未通过：${r.problems.join('；')}`, GENERATE_DRAFT_IDX)
        }
        return '内容规则检查通过'
      }
    },
    {
      name: 'write_output',
      title: '写入交付文件（需批准）',
      kind: 'tool',
      async run(ctx) {
        const draft = ctx.getArtifact('draft')
        const outPath = outputPathFor(ctx.inputPath)
        const content = draft.content ?? ''
        const res = await ctx.callTool('fs.write', { path: outPath, content })
        ctx.saveArtifact({
          type: 'deliverable',
          title: basename(outPath),
          content,
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
