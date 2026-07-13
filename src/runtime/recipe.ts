import type { ModelTier, StepKind, VerificationKind, VerificationStatus } from '../shared/types'
import { fileEditRecipe } from './recipes/fileEdit'
import { deepResearchRecipe } from './recipes/deepResearch'
import { contentPackRecipe } from './recipes/contentPack'

export interface StepContext {
  taskId: string
  runId: string
  stepId: string
  stepIdx: number
  goal: string
  inputPath: string
  refineInstructions: string[]
  callTool(
    toolId: string,
    input: Record<string, unknown>
  ): Promise<{ summary: string; data?: Record<string, unknown> }>
  callModel(prompt: string): Promise<string>
  saveArtifact(a: {
    type: string
    title: string
    content?: string
    localPath?: string
    origin?: string
    mimeType?: string
    producer?: string
    sourceArtifactIds?: string[]
  }): string
  getArtifact(type: string): {
    id: string
    content: string | null
    local_path: string | null
    origin: string | null
    title: string
  }
  getArtifacts(typePrefix: string): {
    id: string
    type: string
    content: string | null
    local_path: string | null
    origin: string | null
    title: string
  }[]
  addEvidence(e: {
    artifactId: string
    sourceType: string
    locator: string
    excerpt: string
    verificationStatus: string
  }): void
  addVerification(
    kind: VerificationKind,
    status: VerificationStatus,
    detail: string,
    artifactId?: string
  ): void
  failVerification(detail: string, resumeStepIndex: number): never
  markDelivered(artifactId: string): void
  countOpenBlockers(): number
}

export interface StepTemplate {
  name: string
  title: string
  kind: StepKind
  tier?: ModelTier
  run(ctx: StepContext): Promise<string>
}

export interface LoopTemplate {
  id: string
  title: string
  goal: string
  requiredInputs: string[]
  refineStepIndex: number
  steps: StepTemplate[]
}

const recipes = new Map<string, LoopTemplate>([
  [fileEditRecipe.id, fileEditRecipe],
  [deepResearchRecipe.id, deepResearchRecipe],
  [contentPackRecipe.id, contentPackRecipe]
])

export function getRecipe(id: string): LoopTemplate {
  const recipe = recipes.get(id)
  if (!recipe) throw new Error('Recipe 未注册: ' + id)
  return recipe
}

export function listRecipes(): LoopTemplate[] {
  return Array.from(recipes.values())
}

export function registerRecipe(recipe: LoopTemplate): void {
  if (!recipe.id.startsWith('custom:')) throw new Error('动态 Recipe id 必须以 custom: 开头')
  recipes.set(recipe.id, recipe)
}

export function unregisterRecipe(id: string): void {
  if (id.startsWith('custom:')) recipes.delete(id)
}

export { fileEditRecipe, deepResearchRecipe, contentPackRecipe }
