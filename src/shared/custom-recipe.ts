export const CONTENT_PIPELINE_STEPS = [
  'read_material',
  'generate_outline',
  'verify_outline',
  'generate_draft',
  'verify_rules',
  'write_output',
  'verify_output',
  'deliver'
] as const

export interface CustomRecipeInput {
  name: string
  goal: string
  stepIds: string[]
  ruleSetId: string
}

export type CustomRecipeValidation =
  | { ok: true; value: CustomRecipeInput }
  | { ok: false; detail: string }

export function validateCustomRecipeInput(input: CustomRecipeInput): CustomRecipeValidation {
  const name = input.name.trim()
  const goal = input.goal.trim()
  if (!name || name.length > 80) return { ok: false, detail: 'Recipe 名称必须为 1–80 字符' }
  if (!goal || goal.length > 1000) return { ok: false, detail: 'Recipe 目标必须为 1–1000 字符' }
  if (input.stepIds.length !== CONTENT_PIPELINE_STEPS.length ||
      input.stepIds.some((step, index) => step !== CONTENT_PIPELINE_STEPS[index])) {
    return { ok: false, detail: '当前组合器只允许已验证的线性内容生产步骤及其依赖顺序' }
  }
  const ruleSetId = input.ruleSetId.trim()
  if (!ruleSetId) return { ok: false, detail: '规则核验步骤必须选择规则集' }
  return { ok: true, value: { name, goal, stepIds: [...CONTENT_PIPELINE_STEPS], ruleSetId } }
}
