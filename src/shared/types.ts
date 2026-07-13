export type InternalStatus =
  | 'draft'
  | 'planning'
  | 'queued'
  | 'step_running'
  | 'step_retrying'
  | 'paused_by_user'
  | 'awaiting_approval'
  | 'andon_open'
  | 'verifying'
  | 'verification_failed'
  | 'delivered'
  | 'cancelled_by_user'
  | 'failed'
  | 'archived'

export type UserStatus =
  | 'Draft'
  | 'Planning'
  | 'Running'
  | 'Waiting for You'
  | 'Verifying'
  | 'Delivered'
  | 'Blocked'
  | 'Cancelled'
  | 'Archived'

export type ProviderKind = 'anthropic' | 'openai-compat'

export interface ProviderView {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  defaultModel: string
  inputPricePerM: number | null
  outputPricePerM: number | null
  hasKey: boolean
}

export interface ProvidersView {
  providers: ProviderView[]
  defaultProviderId: string | null
}

export interface ProviderUpsertInput {
  id?: string
  name: string
  kind: ProviderKind
  baseUrl: string
  defaultModel: string
  inputPricePerM?: number | null
  outputPricePerM?: number | null
}

export interface TestProviderResult {
  ok: boolean
  message: string
}

export type RiskLevel = 'low' | 'approval_required' | 'forbidden'

export interface McpServerView {
  id: string
  name: string
  command: string
  args: string[]
  enabled: boolean
  envKeys: string[]
}

export interface McpServerUpsertInput {
  id?: string
  name: string
  command: string
  args: string[]
  enabled: boolean
  env?: Record<string, string> | null
}

export type McpServerState = 'connected' | 'connecting' | 'error' | 'disabled'

export interface McpToolStatus {
  toolId: string
  name: string
  description: string
  risk: RiskLevel
}

export interface McpServerStatus {
  id: string
  name: string
  enabled: boolean
  state: McpServerState
  error?: string
  tools: McpToolStatus[]
}

export interface SetMcpToolRiskInput {
  toolId: string
  risk: RiskLevel
}

export type StepKind = 'tool' | 'model' | 'verify' | 'deliver'
export type ModelTier = 'planning' | 'generation' | 'extraction' | 'review'

export interface TierRouteView {
  providerId: string
  model: string
  fallback?: { providerId: string; model: string }
}

export type TierMapView = Partial<Record<ModelTier, TierRouteView>>

export interface SetTierRouteInput {
  tier: ModelTier
  providerId: string
  model: string
  fallback?: { providerId: string; model: string } | null
}
export type StepStatus = 'pending' | 'running' | 'done' | 'failed'
export type VerificationKind = 'schema' | 'deterministic' | 'evidence'
export type VerificationStatus = 'passed' | 'failed'

export interface StepView {
  id: string
  idx: number
  name: string
  title: string
  kind: StepKind
  status: StepStatus
  attempt: number
  outputSummary: string | null
}

export interface ApprovalView {
  id: string
  stepId: string
  actionDesc: string
  diff: string
  status: 'pending' | 'approved' | 'rejected' | 'superseded'
}

export interface AndonView {
  id: string
  stepId: string | null
  reason: string
  impact: string
  recommendedActions: string[]
  status: 'open' | 'resolved'
}

export interface ArtifactView {
  id: string
  type: string
  title: string
  version: number
  contentPreview: string
  localPath: string | null
  origin: string | null
  isDeliverable: boolean
  verificationStatus: string
  createdAt: string
}

export interface VerificationView {
  id: string
  stepId: string
  kind: VerificationKind
  status: VerificationStatus
  detail: string
}

export interface EvidenceView {
  id: string
  sourceType: string
  locator: string
  excerpt: string
  verificationStatus: string
  snapshotPath: string | null
}

export interface TaskMetrics {
  durationMs: number
  modelCalls: number
  toolCalls: number
  retries: number
  interventions: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  eventCount: number
}

export interface TaskView {
  id: string
  goal: string
  brief: string | null
  inputPath: string
  status: InternalStatus
  userStatus: UserStatus
  recipeId: string
  projectId: string | null
  projectName: string | null
  budgetUsd: number | null
  refineInstructions: string[]
  queuePosition: number | null
  steps: StepView[]
  approvals: ApprovalView[]
  andons: AndonView[]
  artifacts: ArtifactView[]
  verifications: VerificationView[]
  evidence: EvidenceView[]
  metrics: TaskMetrics
  createdAt: string
  updatedAt: string
}

export interface ProjectView {
  id: string
  name: string
  description: string
  savedInstructions: string
  taskCount: number
  deliverableCount: number
  createdAt: string
  updatedAt: string
}

export interface RuleSetView {
  id: string
  name: string
  bannedWords: string[]
  minLength: number
  maxLength: number
  mustStartWith: string
  requiredHeadings: string[]
  createdAt: string
  updatedAt: string
}

export interface CustomRecipeView {
  id: string
  name: string
  goal: string
  stepIds: string[]
  ruleSetId: string
  ruleSetName: string
  createdAt: string
  updatedAt: string
}

export interface ScheduleView {
  id: string
  name: string
  goal: string
  inputPath: string
  recipeId: string
  recipeTitle: string
  projectId: string | null
  budgetUsd: number | null
  cadence: 'daily' | 'weekdays' | 'weekly'
  timeOfDay: string
  dayOfWeek: number | null
  nextRunAt: string
  lastTriggeredAt: string | null
  enabled: boolean
}

export interface RecipeView {
  id: string
  title: string
  goal: string
  requiresInput: boolean
  stepCount: number
  verifyCount: number
}

export interface PresetView {
  id: string
  name: string
  goal: string
  recipeId: string
  recipeTitle: string
  inputPath: string
  invalid: boolean
  createdAt: string
}

export interface DeliverableView {
  id: string
  title: string
  taskId: string
  taskGoal: string
  localPath: string | null
  contentPreview: string
  verificationStatus: string
  createdAt: string
}

export interface DeliverableDetailView extends DeliverableView {
  content: string
  evidence: EvidenceView[]
}

export interface RunToolCallDetail {
  id: string
  toolId: string
  toolVersion: string
  status: string
  riskLevel: RiskLevel
  retryCount: number
  outputSummary: string | null
  error: string | null
  startedAt: string
  endedAt: string | null
}

export interface RunModelCallDetail {
  id: string
  model: string
  tokensIn: number | null
  tokensOut: number | null
  costUsd: number | null
  status: string
  error: string | null
  createdAt: string
}

export interface RunVerificationDetail {
  id: string
  kind: VerificationKind
  status: VerificationStatus
  detail: string
}

export interface RunStepDetail {
  id: string
  idx: number
  name: string
  title: string
  kind: StepKind
  status: StepStatus
  attempt: number
  outputSummary: string | null
  startedAt: string | null
  endedAt: string | null
  toolCalls: RunToolCallDetail[]
  modelCalls: RunModelCallDetail[]
  verifications: RunVerificationDetail[]
}

export interface RunEventDetail {
  seq: number
  type: string
  stepId: string | null
  payload: string | null
  createdAt: string
}

export interface RunDetailView {
  runId: string
  taskId: string
  recipeId: string
  status: string
  startedAt: string | null
  endedAt: string | null
  currentStepIndex: number
  steps: RunStepDetail[]
  events: RunEventDetail[]
}

export type RpcRequest =
  | { method: 'listTasks' }
  | { method: 'getTask'; taskId: string }
  | { method: 'createTask'; goal: string; inputPath: string; recipeId?: string; budgetUsd?: number; projectId?: string }
  | { method: 'startTask'; taskId: string }
  | { method: 'pauseTask'; taskId: string }
  | { method: 'resumeTask'; taskId: string }
  | { method: 'stopTask'; taskId: string }
  | { method: 'resolveApproval'; approvalId: string; decision: 'approved' | 'rejected' }
  | { method: 'resolveAndon'; andonId: string; action: 'retry' | 'cancel' }
  | { method: 'retryFromCheckpoint'; taskId: string }
  | { method: 'getDefaults' }
  | { method: 'listRecipes' }
  | { method: 'updateBrief'; taskId: string; brief: string }
  | { method: 'refineTask'; taskId: string; instruction: string }
  | { method: 'listDeliverables' }
  | { method: 'getDeliverable'; artifactId: string }
  | { method: 'getRunDetail'; taskId: string }
  | { method: 'savePreset'; name: string; goal: string; recipeId: string; inputPath: string }
  | { method: 'listPresets' }
  | { method: 'deletePreset'; presetId: string }
  | { method: 'updateBudget'; taskId: string; budgetUsd: number }
  | { method: 'archiveTask'; taskId: string }
  | { method: 'archiveAllDelivered' }
  | { method: 'testProvider'; providerId: string }
  | { method: 'mcpStatus' }
  | { method: 'listProjects' }
  | { method: 'saveProject'; projectId?: string; name: string; description: string; savedInstructions: string }
  | { method: 'deleteProject'; projectId: string }
  | { method: 'listRuleSets' }
  | { method: 'saveRuleSet'; ruleSetId?: string; name: string; bannedWords: string[]; minLength: number; maxLength: number; mustStartWith: string; requiredHeadings: string[] }
  | { method: 'deleteRuleSet'; ruleSetId: string }
  | { method: 'listCustomRecipes' }
  | { method: 'saveCustomRecipe'; customRecipeId?: string; name: string; goal: string; stepIds: string[]; ruleSetId: string }
  | { method: 'deleteCustomRecipe'; customRecipeId: string }
  | { method: 'listSchedules' }
  | { method: 'saveSchedule'; scheduleId?: string; name: string; goal: string; inputPath: string; recipeId: string; projectId?: string; budgetUsd?: number; cadence: 'daily' | 'weekdays' | 'weekly'; timeOfDay: string; dayOfWeek?: number }
  | { method: 'setScheduleEnabled'; scheduleId: string; enabled: boolean }
  | { method: 'deleteSchedule'; scheduleId: string }

export interface PushEvent {
  type: 'task'
  task: TaskView
}

export interface SettingsView {
  hasApiKey: boolean
  model: string
  encryptionAvailable: boolean
  maxActiveTasks: number
  defaultBudgetUsd: number
  shellEnabled: boolean
  shellAllowPrefixes: string[]
}
