import { getDb } from './db'
import { contentPackRecipe } from './recipes/contentPack'
import { checkContentRules, type ContentRules } from '../shared/verify'
import type { LoopTemplate, StepTemplate } from './recipe'

export interface StoredCustomRecipe {
  id: string
  name: string
  goal: string
  stepIds: string[]
  ruleSetId: string
}

function ruleStep(ruleSetId: string, original: StepTemplate): StepTemplate {
  return { ...original, async run(ctx) {
    const row = getDb().prepare(
      `SELECT banned_words, min_length, max_length, must_start_with, required_headings
       FROM rule_sets WHERE id = ?`
    ).get(ruleSetId) as {
      banned_words: string; min_length: number; max_length: number; must_start_with: string; required_headings: string
    } | undefined
    if (!row) return ctx.failVerification('自定义 Recipe 引用的规则集不存在', 3)
    const rules: ContentRules = {
      bannedWords: JSON.parse(row.banned_words) as string[], minLength: row.min_length,
      maxLength: row.max_length, mustStartWith: row.must_start_with,
      requiredHeadings: JSON.parse(row.required_headings) as string[]
    }
    const draft = ctx.getArtifact('draft')
    const result = checkContentRules(draft.content ?? '', rules)
    ctx.addVerification('deterministic', result.ok ? 'passed' : 'failed',
      result.ok ? '自定义规则集检查通过' : `规则检查未通过：${result.problems.join('；')}`, draft.id)
    if (!result.ok) ctx.failVerification(`规则检查未通过：${result.problems.join('；')}`, 3)
    return '自定义规则集检查通过'
  } }
}

export function buildCustomRecipe(stored: StoredCustomRecipe): LoopTemplate {
  const byName = new Map(contentPackRecipe.steps.map((step) => [step.name, step]))
  const steps = stored.stepIds.map((id) => {
    const step = byName.get(id)
    if (!step) throw new Error(`未知 Step id: ${id}`)
    return id === 'verify_rules' ? ruleStep(stored.ruleSetId, step) : { ...step }
  })
  return {
    id: `custom:${stored.id}`,
    title: stored.name,
    goal: stored.goal,
    requiredInputs: ['inputPath'],
    refineStepIndex: 3,
    steps
  }
}
