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
  estimatedDurationMs: number | null
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
  agentId: string | null
  agentName: string | null
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

export interface AgentView {
  id: string
  name: string
  description: string
  instructions: string
  defaultRecipeId: string | null
  defaultBudgetUsd: number | null
  maxConcurrentRuns: number
  enabled: boolean
  taskCount: number
  scheduleCount: number
  enabledScheduleCount: number
  createdAt: string
  updatedAt: string
}

export interface AgentUpsertInput {
  id?: string
  name: string
  description: string
  instructions: string
  defaultRecipeId?: string | null
  defaultBudgetUsd?: number | null
  maxConcurrentRuns: number
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
  agentId: string | null
  agentName: string | null
  budgetUsd: number | null
  cadence: 'daily' | 'weekdays' | 'weekly'
  timeOfDay: string
  dayOfWeek: number | null
  nextRunAt: string
  lastTriggeredAt: string | null
  enabled: boolean
  lastTaskId: string | null
  lastTaskUserStatus: UserStatus | null
  lastTaskCreatedAt: string | null
  lastTriggerSource: ScheduleTriggerSource | null
  lastTaskNeedsAttention: boolean
  /** 上一次到期认领之后没有 Task 落地：触发失败，不是正常周期。 */
  lastTriggerFailed: boolean
}

export type ScheduleTriggerSource = 'scheduled' | 'manual'

export interface ScheduleHistoryDeliverableView {
  id: string
  title: string
  version: number
}

export interface ScheduleHistoryItemView {
  taskId: string
  taskGoal: string
  userStatus: UserStatus
  triggerSource: ScheduleTriggerSource
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  durationMs: number | null
  costUsd: number
  deliverables: ScheduleHistoryDeliverableView[]
  needsAttention: boolean
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
  version: number
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

export interface DeliverableVersionView {
  id: string
  title: string
  version: number
  content: string
  verificationStatus: string
  createdAt: string
}

export interface DeliverableHistoryView {
  taskId: string
  taskGoal: string
  versions: DeliverableVersionView[]
}

export interface DataGovernanceStats {
  liveEventRows: number
  archivedEventRows: number
  archivedTaskCount: number
  snapshotCount: number
  snapshotBytes: number
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

export type ActivityKind =
  | 'task'
  | 'run'
  | 'step'
  | 'approval'
  | 'andon'
  | 'budget'
  | 'verification'
  | 'deliverable'
  | 'archive'

export type ActivityTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type EventActorType = 'user' | 'agent' | 'system'

export interface EventActor {
  type: EventActorType
  id?: string
  name?: string
}

export interface ActivityView {
  id: string
  seq: number
  kind: ActivityKind
  tone: ActivityTone
  actorType: EventActorType
  actorId: string | null
  actorName: string
  title: string
  detail: string | null
  taskId: string
  runId: string | null
  stepId: string | null
  target:
    | 'task'
    | 'step'
    | 'approval'
    | 'andon'
    | 'verification'
    | 'deliverable'
    | null
  createdAt: string
}

export interface RuntimeOverviewView {
  overall: 'ready' | 'busy' | 'degraded' | 'offline'
  runtime: {
    state: 'ready' | 'busy' | 'offline'
    startedAt: string | null
    activeTasks: number
    queuedTasks: number
    maxActiveTasks: number
  }
  providers: Array<{
    id: string
    name: string
    configured: boolean
    defaultModel: string
    lastTestStatus: 'passed' | 'failed' | 'unknown'
    lastTestedAt: string | null
    errorSummary: string | null
  }>
  mcp: Array<{
    id: string
    name: string
    state: McpServerState
    toolCount: number
    errorSummary: string | null
  }>
  shell: {
    enabled: boolean
    allowPrefixCount: number
    risk: 'forbidden' | 'approval_required'
  }
  usage7d: {
    runs: number
    modelCalls: number
    toolCalls: number
    tokensIn: number
    tokensOut: number
    costUsd: number
  }
}

export type NeedYouItemType =
  | 'approval'
  | 'andon'
  | 'verification_failed'
  | 'blocked'
  | 'budget'

export type NeedYouAction =
  | 'approve'
  | 'retry'
  | 'retry_checkpoint'
  | 'add_budget'
  | 'open_task'
  | 'reject'
  | 'cancel'

export interface NeedYouItemView {
  id: string
  type: NeedYouItemType
  urgency: 1 | 2 | 3
  taskId: string
  taskGoal: string
  agentName: string | null
  title: string
  detail: string
  createdAt: string
  primaryAction: NeedYouAction
  secondaryActions: NeedYouAction[]
  sourceId: string | null
}

export type RpcRequest =
  | { method: 'listTasks' }
  | { method: 'getTask'; taskId: string }
  | { method: 'createTask'; goal: string; inputPath: string; recipeId?: string; budgetUsd?: number; projectId?: string; agentId?: string }
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
  | { method: 'getDeliverableHistory'; artifactId: string }
  | { method: 'getDataGovernanceStats' }
  | { method: 'getRunDetail'; taskId: string }
  | { method: 'getTaskActivity'; taskId: string; limit?: number; beforeSeq?: number }
  | { method: 'getRuntimeOverview' }
  | { method: 'listNeedYouItems' }
  | { method: 'savePreset'; name: string; goal: string; recipeId: string; inputPath: string }
  | { method: 'listPresets' }
  | { method: 'deletePreset'; presetId: string }
  | { method: 'updateBudget'; taskId: string; budgetUsd: number }
  | { method: 'archiveTask'; taskId: string }
  | { method: 'archiveAllDelivered' }
  | { method: 'testProvider'; providerId: string }
  | { method: 'mcpStatus' }
  | { method: 'listAgents' }
  | ({ method: 'saveAgent' } & AgentUpsertInput)
  | { method: 'setAgentEnabled'; agentId: string; enabled: boolean }
  | { method: 'deleteAgent'; agentId: string }
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
  | { method: 'saveSchedule'; scheduleId?: string; name: string; goal: string; inputPath: string; recipeId: string; projectId?: string; agentId?: string; budgetUsd?: number; cadence: 'daily' | 'weekdays' | 'weekly'; timeOfDay: string; dayOfWeek?: number }
  | { method: 'setScheduleEnabled'; scheduleId: string; enabled: boolean }
  | { method: 'deleteSchedule'; scheduleId: string }
  | { method: 'triggerScheduleNow'; scheduleId: string }
  | { method: 'getScheduleHistory'; scheduleId: string; limit?: number }

export interface TaskSummaryDeliverable {
  id: string
  title: string
  version: number
}

/**
 * 列表、看板、Home、命令面板使用的轻量投影。
 * 刻意不含 Brief、输入路径、预算、产物正文预览与任何明细集合——
 * 千任务首屏曾因为在列表里搬运完整 TaskView 而付出数百毫秒的序列化与水合成本。
 * 任务详情继续使用完整 `TaskView`（`getTask` 与任务推送）。
 */
export interface TaskSummaryView {
  id: string
  goal: string
  status: InternalStatus
  userStatus: UserStatus
  recipeId: string
  projectId: string | null
  projectName: string | null
  agentId: string | null
  agentName: string | null
  queuePosition: number | null
  runningStepTitle: string | null
  lastDoneLabel: string | null
  modelCalls: number
  toolCalls: number
  deliverables: TaskSummaryDeliverable[]
  createdAt: string
  updatedAt: string
}

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
  snapshotQuotaMb: number
  shellEnabled: boolean
  shellAllowPrefixes: string[]
}
