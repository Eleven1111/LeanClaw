import { getDataDir, getDb, getSamplePath, now, uid } from './db'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { appendEvent, archiveTaskEvents } from './ledger'
import { getStatus, transition } from './state'
import { buildRunDetail, buildTaskView, listTaskViews, publishTask } from './views'
import { getActiveRun } from './engine'
import { requestRun } from './scheduler'
import { getRuntimeConfig } from './config'
import { completeWith } from './model'
import { getMcpStatus } from './mcp'
import { fileEditRecipe, getRecipe, listRecipes, registerRecipe, unregisterRecipe } from './recipe'
import { buildCustomRecipe } from './custom-recipe'
import { validateCustomRecipeInput } from '../shared/custom-recipe'
import { nextOccurrence, validateScheduleInput } from '../shared/schedule'
import {
  agentDeleteBlocker,
  agentDisableBlocker,
  validateAgentInput
} from '../shared/agent'
import { parseRefineInstructions, validatePresetInput, validateProjectInput, validateRuleSetInput } from '../shared/verify'
import type {
  AgentView,
  DeliverableView,
  DeliverableDetailView,
  DeliverableHistoryView,
  DataGovernanceStats,
  InternalStatus,
  PresetView,
  ProjectView,
  RuleSetView,
  CustomRecipeView,
  ScheduleView,
  RecipeView,
  RpcRequest,
  RunDetailView,
  TaskView,
  TestProviderResult
} from '../shared/types'

const TEST_PROVIDER_TIMEOUT_MS = 15000

const BRIEF_EDITABLE_STATUSES: InternalStatus[] = [
  'draft',
  'paused_by_user',
  'awaiting_approval',
  'andon_open',
  'verification_failed'
]

const REFINE_ALLOWED_STATUSES: InternalStatus[] = [
  'delivered',
  'verification_failed',
  'paused_by_user'
]

const MAX_REFINE_LENGTH = 2000

export async function handleRpc(req: RpcRequest): Promise<unknown> {
  switch (req.method) {
    case 'getDefaults':
      return {
        samplePath: getSamplePath(),
        sampleGoal: '把这个文件整理成一份带引用的摘要，保存为 Markdown。'
      }
    case 'listTasks':
      return listTaskViews()
    case 'getTask':
      return buildTaskView(req.taskId)
    case 'createTask':
      return createTask(req.goal, req.inputPath, req.recipeId, req.budgetUsd, req.projectId)
    case 'startTask':
      return startTask(req.taskId)
    case 'pauseTask':
      return pauseTask(req.taskId)
    case 'resumeTask':
      return resumeTask(req.taskId)
    case 'stopTask':
      return stopTask(req.taskId)
    case 'resolveApproval':
      return resolveApproval(req.approvalId, req.decision)
    case 'resolveAndon':
      return resolveAndon(req.andonId, req.action)
    case 'retryFromCheckpoint':
      return retryFromCheckpoint(req.taskId)
    case 'listRecipes':
      return listRecipeViews()
    case 'updateBrief':
      return updateBrief(req.taskId, req.brief)
    case 'refineTask':
      return refineTask(req.taskId, req.instruction)
    case 'listDeliverables':
      return listDeliverables()
    case 'getDeliverable':
      return getDeliverable(req.artifactId)
    case 'getDeliverableHistory':
      return getDeliverableHistory(req.artifactId)
    case 'getDataGovernanceStats':
      return getDataGovernanceStats()
    case 'getRunDetail':
      return getRunDetail(req.taskId)
    case 'savePreset':
      return savePreset(req.name, req.goal, req.recipeId, req.inputPath)
    case 'listPresets':
      return listPresets()
    case 'deletePreset':
      return deletePreset(req.presetId)
    case 'updateBudget':
      return updateBudget(req.taskId, req.budgetUsd)
    case 'archiveTask':
      return archiveTask(req.taskId)
    case 'archiveAllDelivered':
      return archiveAllDelivered()
    case 'testProvider':
      return testProvider(req.providerId)
    case 'mcpStatus':
      return getMcpStatus()
    case 'listAgents':
      return listAgents()
    case 'saveAgent':
      return saveAgent(req)
    case 'setAgentEnabled':
      return setAgentEnabled(req.agentId, req.enabled)
    case 'deleteAgent':
      return deleteAgent(req.agentId)
    case 'listProjects':
      return listProjects()
    case 'saveProject':
      return saveProject(req.projectId, req.name, req.description, req.savedInstructions)
    case 'deleteProject':
      return deleteProject(req.projectId)
    case 'listRuleSets':
      return listRuleSets()
    case 'saveRuleSet':
      return saveRuleSet(req)
    case 'deleteRuleSet':
      return deleteRuleSet(req.ruleSetId)
    case 'listCustomRecipes':
      return listCustomRecipes()
    case 'saveCustomRecipe':
      return saveCustomRecipe(req)
    case 'deleteCustomRecipe':
      return deleteCustomRecipe(req.customRecipeId)
    case 'listSchedules':
      return listSchedules()
    case 'saveSchedule':
      return saveSchedule(req)
    case 'setScheduleEnabled':
      return setScheduleEnabled(req.scheduleId, req.enabled)
    case 'deleteSchedule':
      return deleteSchedule(req.scheduleId)
  }
}

async function testProvider(providerId: string): Promise<TestProviderResult> {
  const provider = getRuntimeConfig().providers.find((p) => p.id === providerId)
  if (!provider) return { ok: false, message: '服务商不存在或配置尚未同步' }
  if (!provider.apiKey) return { ok: false, message: '未设置密钥，无法测试连接' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_PROVIDER_TIMEOUT_MS)
  const start = Date.now()
  try {
    const r = await completeWith(provider, '回复 OK', 16, controller.signal)
    const reply = r.text.trim().slice(0, 40)
    return { ok: true, message: `连接成功（${Date.now() - start}ms）${reply ? `，返回：${reply}` : ''}` }
  } catch (e) {
    if (controller.signal.aborted) {
      return { ok: false, message: `连接超时（${TEST_PROVIDER_TIMEOUT_MS / 1000}s）` }
    }
    const err = e as Error & { cause?: { code?: string; message?: string } }
    const cause = err.cause?.code ?? err.cause?.message
    const msg = cause ? `${err.message}（${cause}）` : err.message
    return { ok: false, message: msg.slice(0, 200) }
  } finally {
    clearTimeout(timer)
  }
}

const BUDGET_EDITABLE_STATUSES: InternalStatus[] = ['draft', 'paused_by_user', 'andon_open']

function updateBudget(taskId: string, budgetUsd: number): TaskView {
  const status = getStatus(taskId)
  if (!BUDGET_EDITABLE_STATUSES.includes(status)) {
    throw new Error('当前状态不允许调整预算')
  }
  if (!(budgetUsd > 0)) throw new Error('预算必须为正数')
  getDb().prepare('UPDATE tasks SET budget_usd = ?, updated_at = ? WHERE id = ?').run(budgetUsd, now(), taskId)
  appendEvent(taskId, 'budget-updated', { budgetUsd })
  publishTask(taskId)
  return buildTaskView(taskId)
}

function getRunDetail(taskId: string): RunDetailView {
  return buildRunDetail(taskId)
}

function listRecipeViews(): RecipeView[] {
  return listRecipes().map((r) => ({
    id: r.id,
    title: r.title,
    goal: r.goal,
    requiresInput: r.requiredInputs.includes('inputPath'),
    stepCount: r.steps.length,
    verifyCount: r.steps.filter((s) => s.kind === 'verify').length
  }))
}

function listDeliverables(): DeliverableView[] {
  const rows = getDb()
    .prepare(
      `SELECT a.id as id, a.title as title, a.version as version, a.task_id as taskId, t.goal as taskGoal,
              a.local_path as localPath, a.content as content,
              a.verification_status as verificationStatus, a.created_at as createdAt
       FROM artifacts a JOIN tasks t ON a.task_id = t.id
       WHERE a.is_deliverable = 1 AND a.superseded_by IS NULL
       ORDER BY a.created_at DESC`
    )
    .all() as {
    id: string
    version: number
    title: string
    taskId: string
    taskGoal: string
    localPath: string | null
    content: string | null
    verificationStatus: string
    createdAt: string
  }[]
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    title: r.title,
    taskId: r.taskId,
    taskGoal: r.taskGoal,
    localPath: r.localPath,
    contentPreview: String(r.content ?? '').slice(0, 500),
    verificationStatus: r.verificationStatus,
    createdAt: r.createdAt
  }))
}

function getDeliverable(artifactId: string): DeliverableDetailView {
  const row = getDb()
    .prepare(
      `SELECT a.id, a.title, a.version, a.task_id as taskId, t.goal as taskGoal,
              a.local_path as localPath, a.content, a.verification_status as verificationStatus,
              a.created_at as createdAt
       FROM artifacts a JOIN tasks t ON a.task_id = t.id
       WHERE a.id = ? AND a.is_deliverable = 1`
    )
    .get(artifactId) as {
    id: string
    version: number
    title: string
    taskId: string
    taskGoal: string
    localPath: string | null
    content: string | null
    verificationStatus: string
    createdAt: string
  } | undefined
  if (!row) throw new Error('交付物不存在')
  const evidence = getDb()
    .prepare(
      `SELECT e.id, e.source_type as sourceType, e.locator, e.excerpt,
              e.verification_status as verificationStatus, a.local_path as snapshotPath
       FROM evidence e LEFT JOIN artifacts a ON a.id = e.artifact_id
       WHERE e.task_id = ? ORDER BY e.created_at`
    )
    .all(row.taskId) as DeliverableDetailView['evidence']
  const content = String(row.content ?? '')
  return { ...row, content, contentPreview: content.slice(0, 500), evidence }
}

function getDeliverableHistory(artifactId: string): DeliverableHistoryView {
  const selected = getDb()
    .prepare(
      `SELECT a.task_id as taskId, t.goal as taskGoal
       FROM artifacts a JOIN tasks t ON a.task_id = t.id
       WHERE a.id = ? AND a.is_deliverable = 1`
    )
    .get(artifactId) as { taskId: string; taskGoal: string } | undefined
  if (!selected) throw new Error('交付物不存在')

  const versions = getDb()
    .prepare(
      `SELECT id, title, version, content, verification_status as verificationStatus,
              created_at as createdAt
       FROM artifacts
       WHERE task_id = ? AND is_deliverable = 1
       ORDER BY version ASC`
    )
    .all(selected.taskId) as DeliverableHistoryView['versions']

  return {
    ...selected,
    versions: versions.map((version) => ({ ...version, content: String(version.content ?? '') }))
  }
}

function getDataGovernanceStats(): DataGovernanceStats {
  const counts = getDb().prepare(
    `SELECT
       (SELECT COUNT(*) FROM run_events) as liveEventRows,
       (SELECT COUNT(*) FROM run_events_archive) as archivedEventRows,
       (SELECT COUNT(*) FROM tasks WHERE status = 'archived') as archivedTaskCount`
  ).get() as Pick<DataGovernanceStats, 'liveEventRows' | 'archivedEventRows' | 'archivedTaskCount'>
  const root = join(getDataDir(), 'snapshots')
  const snapshots = existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    : []
  return {
    ...counts,
    snapshotCount: snapshots.length,
    snapshotBytes: snapshots.reduce((total, entry) => total + statSync(join(root, entry.name)).size, 0)
  }
}

function toPresetView(row: {
  id: string
  name: string
  goal: string
  recipeId: string
  inputPath: string
  createdAt: string
}): PresetView {
  let recipeTitle = row.recipeId
  let invalid = false
  try {
    recipeTitle = getRecipe(row.recipeId).title
  } catch {
    invalid = true
  }
  return {
    id: row.id,
    name: row.name,
    goal: row.goal,
    recipeId: row.recipeId,
    recipeTitle,
    inputPath: row.inputPath,
    invalid,
    createdAt: row.createdAt
  }
}

function savePreset(name: string, goal: string, recipeId: string, inputPath: string): PresetView {
  const validation = validatePresetInput(name, goal)
  if (!validation.ok) throw new Error(validation.detail)
  getRecipe(recipeId)
  const id = uid()
  const createdAt = now()
  getDb()
    .prepare(
      `INSERT INTO task_presets (id, name, goal, recipe_id, input_path, created_at)
       VALUES (?,?,?,?,?,?)`
    )
    .run(id, name.trim(), goal, recipeId, inputPath, createdAt)
  return toPresetView({ id, name: name.trim(), goal, recipeId, inputPath, createdAt })
}

function listPresets(): PresetView[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, goal, recipe_id as recipeId, input_path as inputPath, created_at as createdAt
       FROM task_presets ORDER BY created_at DESC`
    )
    .all() as {
    id: string
    name: string
    goal: string
    recipeId: string
    inputPath: string
    createdAt: string
  }[]
  return rows.map(toPresetView)
}

function deletePreset(presetId: string): void {
  getDb().prepare('DELETE FROM task_presets WHERE id = ?').run(presetId)
}

function listAgents(): AgentView[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, description, instructions, default_recipe_id as defaultRecipeId,
              default_budget_usd as defaultBudgetUsd,
              max_concurrent_runs as maxConcurrentRuns, enabled,
              created_at as createdAt, updated_at as updatedAt,
              (SELECT COUNT(*) FROM tasks WHERE agent_id = agents.id) as taskCount,
              (SELECT COUNT(*) FROM schedules WHERE agent_id = agents.id) as scheduleCount,
              (SELECT COUNT(*) FROM schedules
               WHERE agent_id = agents.id AND schedules.enabled = 1)
                as enabledScheduleCount
       FROM agents ORDER BY updated_at DESC, name ASC`
    )
    .all() as (Omit<AgentView, 'enabled'> & { enabled: number })[]
  return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) }))
}

function saveAgent(req: Extract<RpcRequest, { method: 'saveAgent' }>): AgentView {
  const validation = validateAgentInput(req)
  if (!validation.ok) throw new Error(validation.detail)
  if (validation.value.defaultRecipeId) getRecipe(validation.value.defaultRecipeId)

  const db = getDb()
  const id = req.id ?? uid()
  const timestamp = now()
  const values = [
    validation.value.name,
    validation.value.description,
    validation.value.instructions,
    validation.value.defaultRecipeId,
    validation.value.defaultBudgetUsd,
    validation.value.maxConcurrentRuns,
    timestamp
  ]
  try {
    if (req.id) {
      const result = db
        .prepare(
          `UPDATE agents
           SET name=?, description=?, instructions=?, default_recipe_id=?,
               default_budget_usd=?, max_concurrent_runs=?, updated_at=?
           WHERE id=?`
        )
        .run(...values, id)
      if (result.changes !== 1) throw new Error('Agent 不存在')
    } else {
      db.prepare(
        `INSERT INTO agents
         (id, name, description, instructions, default_recipe_id, default_budget_usd,
          max_concurrent_runs, enabled, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,1,?,?)`
      ).run(id, ...values.slice(0, 6), timestamp, timestamp)
    }
  } catch (error) {
    if (String((error as Error).message).includes('UNIQUE')) {
      throw new Error('Agent 名称已存在')
    }
    throw error
  }
  return listAgents().find((agent) => agent.id === id) as AgentView
}

function setAgentEnabled(agentId: string, enabled: boolean): AgentView {
  const db = getDb()
  if (!db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId)) {
    throw new Error('Agent 不存在')
  }
  if (!enabled) {
    const row = db
      .prepare('SELECT COUNT(*) as count FROM schedules WHERE agent_id = ? AND enabled = 1')
      .get(agentId) as { count: number }
    const blocker = agentDisableBlocker(row.count)
    if (blocker) throw new Error(blocker)
  }
  db.prepare('UPDATE agents SET enabled = ?, updated_at = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    now(),
    agentId
  )
  return listAgents().find((agent) => agent.id === agentId) as AgentView
}

function deleteAgent(agentId: string): void {
  const db = getDb()
  if (!db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId)) {
    throw new Error('Agent 不存在')
  }
  const task = db
    .prepare('SELECT COUNT(*) as count FROM tasks WHERE agent_id = ?')
    .get(agentId) as { count: number }
  const schedule = db
    .prepare('SELECT COUNT(*) as count FROM schedules WHERE agent_id = ?')
    .get(agentId) as { count: number }
  const blocker = agentDeleteBlocker({
    taskCount: task.count,
    scheduleCount: schedule.count
  })
  if (blocker) throw new Error(blocker)
  db.prepare('DELETE FROM agents WHERE id = ?').run(agentId)
}

function listProjects(): ProjectView[] {
  return getDb().prepare(
    `SELECT p.id, p.name, p.description, p.saved_instructions as savedInstructions,
            p.created_at as createdAt, p.updated_at as updatedAt,
            COUNT(DISTINCT t.id) as taskCount,
            COUNT(DISTINCT CASE WHEN a.is_deliverable = 1 THEN a.id END) as deliverableCount
     FROM projects p
     LEFT JOIN tasks t ON t.project_id = p.id
     LEFT JOIN artifacts a ON a.task_id = t.id
     GROUP BY p.id ORDER BY p.updated_at DESC`
  ).all() as ProjectView[]
}

function saveProject(
  projectId: string | undefined,
  name: string,
  description: string,
  savedInstructions: string
): ProjectView {
  const validation = validateProjectInput(name, description, savedInstructions)
  if (!validation.ok) throw new Error(validation.detail)
  const db = getDb()
  const id = projectId ?? uid()
  const timestamp = now()
  try {
    if (projectId) {
      const result = db.prepare(
        'UPDATE projects SET name = ?, description = ?, saved_instructions = ?, updated_at = ? WHERE id = ?'
      ).run(name.trim(), description.trim(), savedInstructions.trim(), timestamp, id)
      if (result.changes !== 1) throw new Error('项目不存在')
    } else {
      db.prepare(
        'INSERT INTO projects (id, name, description, saved_instructions, created_at, updated_at) VALUES (?,?,?,?,?,?)'
      ).run(id, name.trim(), description.trim(), savedInstructions.trim(), timestamp, timestamp)
    }
  } catch (error) {
    if (String((error as Error).message).includes('UNIQUE')) throw new Error('项目名称已存在')
    throw error
  }
  return listProjects().find((project) => project.id === id) as ProjectView
}

function deleteProject(projectId: string): void {
  const db = getDb()
  const linked = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?').get(projectId) as { count: number }
  const scheduled = db.prepare('SELECT COUNT(*) as count FROM schedules WHERE project_id = ?').get(projectId) as { count: number }
  if (linked.count > 0 || scheduled.count > 0) throw new Error('项目已有任务或定时计划，不能删除')
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
  if (result.changes !== 1) throw new Error('项目不存在')
}

function listRuleSets(): RuleSetView[] {
  const rows = getDb().prepare(
    `SELECT id, name, banned_words as bannedWords, min_length as minLength,
            max_length as maxLength, must_start_with as mustStartWith,
            required_headings as requiredHeadings, created_at as createdAt, updated_at as updatedAt
     FROM rule_sets ORDER BY updated_at DESC`
  ).all() as (Omit<RuleSetView, 'bannedWords' | 'requiredHeadings'> & { bannedWords: string; requiredHeadings: string })[]
  return rows.map((row) => ({
    ...row,
    bannedWords: JSON.parse(row.bannedWords) as string[],
    requiredHeadings: JSON.parse(row.requiredHeadings) as string[]
  }))
}

function saveRuleSet(req: Extract<RpcRequest, { method: 'saveRuleSet' }>): RuleSetView {
  const validation = validateRuleSetInput(req)
  if (!validation.ok) throw new Error(validation.detail)
  const value = validation.value
  const id = req.ruleSetId ?? uid()
  const timestamp = now()
  try {
    if (req.ruleSetId) {
      const result = getDb().prepare(
        `UPDATE rule_sets SET name=?, banned_words=?, min_length=?, max_length=?,
         must_start_with=?, required_headings=?, updated_at=? WHERE id=?`
      ).run(value.name, JSON.stringify(value.bannedWords), value.minLength, value.maxLength,
        value.mustStartWith, JSON.stringify(value.requiredHeadings), timestamp, id)
      if (result.changes !== 1) throw new Error('规则集不存在')
    } else {
      getDb().prepare(
        `INSERT INTO rule_sets
         (id,name,banned_words,min_length,max_length,must_start_with,required_headings,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run(id, value.name, JSON.stringify(value.bannedWords), value.minLength, value.maxLength,
        value.mustStartWith, JSON.stringify(value.requiredHeadings), timestamp, timestamp)
    }
  } catch (error) {
    if (String((error as Error).message).includes('UNIQUE')) throw new Error('规则集名称已存在')
    throw error
  }
  return listRuleSets().find((rule) => rule.id === id) as RuleSetView
}

function deleteRuleSet(ruleSetId: string): void {
  const linked = getDb().prepare('SELECT COUNT(*) as count FROM custom_recipes WHERE rule_set_id = ?').get(ruleSetId) as { count: number }
  if (linked.count > 0) throw new Error('规则集已被自定义 Recipe 引用，不能删除')
  const result = getDb().prepare('DELETE FROM rule_sets WHERE id = ?').run(ruleSetId)
  if (result.changes !== 1) throw new Error('规则集不存在')
}

function listCustomRecipes(): CustomRecipeView[] {
  const rows = getDb().prepare(
    `SELECT c.id, c.name, c.goal, c.step_ids as stepIds, c.rule_set_id as ruleSetId,
            r.name as ruleSetName, c.created_at as createdAt, c.updated_at as updatedAt
     FROM custom_recipes c JOIN rule_sets r ON r.id = c.rule_set_id ORDER BY c.updated_at DESC`
  ).all() as (Omit<CustomRecipeView, 'stepIds'> & { stepIds: string })[]
  return rows.map((row) => ({ ...row, stepIds: JSON.parse(row.stepIds) as string[] }))
}

export function syncCustomRecipes(): void {
  for (const row of listCustomRecipes()) {
    registerRecipe(buildCustomRecipe({ id: row.id, name: row.name, goal: row.goal, stepIds: row.stepIds, ruleSetId: row.ruleSetId }))
  }
}

function saveCustomRecipe(req: Extract<RpcRequest, { method: 'saveCustomRecipe' }>): CustomRecipeView {
  const validation = validateCustomRecipeInput(req)
  if (!validation.ok) throw new Error(validation.detail)
  const rule = getDb().prepare('SELECT id FROM rule_sets WHERE id = ?').get(validation.value.ruleSetId)
  if (!rule) throw new Error('规则集不存在')
  const id = req.customRecipeId ?? uid()
  const timestamp = now()
  try {
    if (req.customRecipeId) {
      const result = getDb().prepare(
        'UPDATE custom_recipes SET name=?, goal=?, step_ids=?, rule_set_id=?, updated_at=? WHERE id=?'
      ).run(validation.value.name, validation.value.goal, JSON.stringify(validation.value.stepIds), validation.value.ruleSetId, timestamp, id)
      if (result.changes !== 1) throw new Error('自定义 Recipe 不存在')
      unregisterRecipe(`custom:${id}`)
    } else {
      getDb().prepare(
        'INSERT INTO custom_recipes (id,name,goal,step_ids,rule_set_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
      ).run(id, validation.value.name, validation.value.goal, JSON.stringify(validation.value.stepIds), validation.value.ruleSetId, timestamp, timestamp)
    }
  } catch (error) {
    if (String((error as Error).message).includes('UNIQUE')) throw new Error('Recipe 名称已存在')
    throw error
  }
  const view = listCustomRecipes().find((item) => item.id === id) as CustomRecipeView
  registerRecipe(buildCustomRecipe({ id, name: view.name, goal: view.goal, stepIds: view.stepIds, ruleSetId: view.ruleSetId }))
  return view
}

function deleteCustomRecipe(customRecipeId: string): void {
  const used = getDb().prepare('SELECT COUNT(*) as count FROM tasks WHERE recipe_id = ?').get(`custom:${customRecipeId}`) as { count: number }
  const scheduled = getDb().prepare('SELECT COUNT(*) as count FROM schedules WHERE recipe_id = ?').get(`custom:${customRecipeId}`) as { count: number }
  if (used.count > 0 || scheduled.count > 0) throw new Error('Recipe 已有任务或定时计划，不能删除')
  const result = getDb().prepare('DELETE FROM custom_recipes WHERE id = ?').run(customRecipeId)
  if (result.changes !== 1) throw new Error('自定义 Recipe 不存在')
  unregisterRecipe(`custom:${customRecipeId}`)
}

function listSchedules(): ScheduleView[] {
  const rows = getDb().prepare(
    `SELECT id,name,goal,input_path as inputPath,recipe_id as recipeId,project_id as projectId,
            budget_usd as budgetUsd,cadence,time_of_day as timeOfDay,day_of_week as dayOfWeek,
            next_run_at as nextRunAt,last_triggered_at as lastTriggeredAt,enabled
     FROM schedules ORDER BY created_at DESC`
  ).all() as (Omit<ScheduleView, 'recipeTitle' | 'enabled'> & { enabled: number })[]
  return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled), recipeTitle: getRecipe(row.recipeId).title }))
}

function saveSchedule(req: Extract<RpcRequest, { method: 'saveSchedule' }>): ScheduleView {
  const schedule = validateScheduleInput(req)
  if (!schedule.ok) throw new Error(schedule.detail)
  const name = req.name.trim()
  const goal = req.goal.trim()
  if (!name || name.length > 80) throw new Error('计划名称必须为 1–80 字符')
  if (!goal || goal.length > 2000) throw new Error('任务目标必须为 1–2000 字符')
  const recipe = getRecipe(req.recipeId)
  if (recipe.requiredInputs.includes('inputPath') && !req.inputPath.trim()) throw new Error('该 Recipe 必须指定输入文件')
  if (req.projectId && !getDb().prepare('SELECT id FROM projects WHERE id=?').get(req.projectId)) throw new Error('项目不存在')
  if (req.budgetUsd !== undefined && !(req.budgetUsd > 0)) throw new Error('预算必须为正数')
  const id = req.scheduleId ?? uid()
  const timestamp = now()
  const next = nextOccurrence(schedule.value.cadence, schedule.value.timeOfDay, new Date(), schedule.value.dayOfWeek)
  const values = [name, goal, req.inputPath.trim(), req.recipeId, req.projectId ?? null, req.budgetUsd ?? null,
    schedule.value.cadence, schedule.value.timeOfDay, schedule.value.dayOfWeek, next.toISOString(), timestamp]
  if (req.scheduleId) {
    const result = getDb().prepare(
      `UPDATE schedules SET name=?,goal=?,input_path=?,recipe_id=?,project_id=?,budget_usd=?,cadence=?,
       time_of_day=?,day_of_week=?,next_run_at=?,updated_at=? WHERE id=?`
    ).run(...values, id)
    if (result.changes !== 1) throw new Error('定时计划不存在')
  } else {
    getDb().prepare(
      `INSERT INTO schedules
       (id,name,goal,input_path,recipe_id,project_id,budget_usd,cadence,time_of_day,day_of_week,next_run_at,enabled,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`
    ).run(id, ...values.slice(0, 10), timestamp, timestamp)
  }
  return listSchedules().find((item) => item.id === id) as ScheduleView
}

function setScheduleEnabled(scheduleId: string, enabled: boolean): ScheduleView {
  const row = getDb().prepare('SELECT cadence,time_of_day,day_of_week FROM schedules WHERE id=?').get(scheduleId) as
    | { cadence: 'daily' | 'weekdays' | 'weekly'; time_of_day: string; day_of_week: number | null }
    | undefined
  if (!row) throw new Error('定时计划不存在')
  const next = nextOccurrence(row.cadence, row.time_of_day, new Date(), row.day_of_week)
  getDb().prepare('UPDATE schedules SET enabled=?,next_run_at=?,updated_at=? WHERE id=?')
    .run(enabled ? 1 : 0, next.toISOString(), now(), scheduleId)
  return listSchedules().find((item) => item.id === scheduleId) as ScheduleView
}

function deleteSchedule(scheduleId: string): void {
  const result = getDb().prepare('DELETE FROM schedules WHERE id=?').run(scheduleId)
  if (result.changes !== 1) throw new Error('定时计划不存在')
}

function createTask(
  goal: string,
  inputPath: string,
  recipeId?: string,
  budgetUsd?: number,
  projectId?: string
): TaskView {
  if (!goal.trim()) throw new Error('任务目标不能为空')
  const rid = recipeId ?? fileEditRecipe.id
  const recipe = getRecipe(rid)
  if (recipe.requiredInputs.includes('inputPath') && !inputPath.trim()) {
    throw new Error('必须指定输入文件路径')
  }
  if (budgetUsd !== undefined && !(budgetUsd > 0)) {
    throw new Error('预算必须为正数')
  }
  const defaultBudget = getRuntimeConfig().defaultBudgetUsd
  const effectiveBudget = budgetUsd !== undefined ? budgetUsd : defaultBudget > 0 ? defaultBudget : null
  const id = uid()
  const project = projectId
    ? getDb().prepare('SELECT id, saved_instructions FROM projects WHERE id = ?').get(projectId) as
        | { id: string; saved_instructions: string }
        | undefined
    : undefined
  if (projectId && !project) throw new Error('项目不存在')
  getDb()
    .prepare(
      `INSERT INTO tasks
       (id, project_id, project_instructions_snapshot, goal, input_path, recipe_id, status, budget_usd, created_at, updated_at)
       VALUES (?,?,?,?,?,?, 'draft', ?, ?, ?)`
    )
    .run(
      id,
      project?.id ?? null,
      project?.saved_instructions ?? null,
      goal.trim(),
      inputPath.trim(),
      rid,
      effectiveBudget,
      now(),
      now()
    )
  appendEvent(id, 'task-created', {
    goal: goal.trim(),
    inputPath: inputPath.trim(),
    recipeId: rid,
    budgetUsd: effectiveBudget,
    projectId: project?.id ?? null,
    hasProjectInstructions: Boolean(project?.saved_instructions)
  })
  return buildTaskView(id)
}

function startTask(taskId: string): TaskView {
  const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
    goal: string
    input_path: string
    recipe_id: string
    project_id: string | null
    project_instructions_snapshot: string | null
  }
  transition(taskId, 'planning')
  const recipe = getRecipe(task.recipe_id)
  const projectName = task.project_id
    ? (getDb().prepare('SELECT name FROM projects WHERE id = ?').get(task.project_id) as { name: string } | undefined)?.name
    : undefined
  const projectLine = projectName
    ? `Project：${projectName}${task.project_instructions_snapshot ? '（Saved Instructions 已按创建时快照注入）' : ''}`
    : null
  const brief =
    recipe.id === 'deep-research'
      ? [
          `目标：${task.goal}`,
          projectLine,
          '交付契约：一份带引用的 Markdown 研究报告，至少 2 节内容、至少 2 条逐字引用；写入前需人工批准 Diff。',
          `Recipe：${recipe.title}（${recipe.steps.length} 步）`
        ].filter(Boolean).join('\n')
      : [
          `目标：${task.goal}`,
          projectLine,
          `输入：${task.input_path}`,
          '交付契约：一份 Markdown 摘要文件，含标题、摘要和至少 2 条逐字引用；写入前需人工批准 Diff。',
          `Recipe：${recipe.title}（${recipe.steps.length} 步）`
        ].filter(Boolean).join('\n')
  getDb().prepare('UPDATE tasks SET brief = ?, updated_at = ? WHERE id = ?').run(brief, now(), taskId)
  const runId = uid()
  getDb()
    .prepare(
      `INSERT INTO runs (id, task_id, recipe_id, status, current_step_index, started_at)
       VALUES (?,?,?, 'active', 0, ?)`
    )
    .run(runId, taskId, task.recipe_id, now())
  const insertStep = getDb().prepare(
    `INSERT INTO steps (id, run_id, idx, name, title, kind, status, attempt)
     VALUES (?,?,?,?,?,?, 'pending', 0)`
  )
  recipe.steps.forEach((s, i) => insertStep.run(uid(), runId, i, s.name, s.title, s.kind))
  appendEvent(taskId, 'run-started', { recipe: recipe.id }, runId)
  transition(taskId, 'queued')
  requestRun(taskId)
  return buildTaskView(taskId)
}

function pauseTask(taskId: string): TaskView {
  transition(taskId, 'paused_by_user')
  appendEvent(taskId, 'paused-by-user')
  return buildTaskView(taskId)
}

function resumeTask(taskId: string): TaskView {
  transition(taskId, 'queued')
  appendEvent(taskId, 'resumed-by-user')
  requestRun(taskId)
  return buildTaskView(taskId)
}

function stopTask(taskId: string): TaskView {
  transition(taskId, 'cancelled_by_user')
  const db = getDb()
  db.prepare(
    `UPDATE approvals SET status = 'rejected', resolved_at = ? WHERE task_id = ? AND status = 'pending'`
  ).run(now(), taskId)
  db.prepare(
    `UPDATE andon_events SET status = 'resolved', chosen_action = 'cancel', resolved_at = ?
     WHERE task_id = ? AND status = 'open'`
  ).run(now(), taskId)
  db.prepare(
    `UPDATE runs SET status = 'cancelled', ended_at = ? WHERE task_id = ? AND ended_at IS NULL`
  ).run(now(), taskId)
  appendEvent(taskId, 'task-cancelled')
  publishTask(taskId)
  return buildTaskView(taskId)
}

function resolveApproval(approvalId: string, decision: 'approved' | 'rejected'): TaskView {
  const db = getDb()
  const appr = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as
    | { id: string; task_id: string; status: string }
    | undefined
  if (!appr) throw new Error('Approval 不存在: ' + approvalId)
  if (appr.status !== 'pending') throw new Error('Approval 已处理过: ' + appr.status)
  db.prepare('UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?').run(
    decision,
    now(),
    approvalId
  )
  appendEvent(appr.task_id, 'approval-resolved', { approvalId, decision })
  if (decision === 'approved') {
    transition(appr.task_id, 'queued')
    requestRun(appr.task_id)
  } else {
    return stopTask(appr.task_id)
  }
  return buildTaskView(appr.task_id)
}

function resolveAndon(andonId: string, action: 'retry' | 'cancel'): TaskView {
  const db = getDb()
  const andon = db.prepare('SELECT * FROM andon_events WHERE id = ?').get(andonId) as
    | { id: string; task_id: string; run_id: string; status: string; resume_step_index: number | null }
    | undefined
  if (!andon) throw new Error('Andon 不存在: ' + andonId)
  if (andon.status !== 'open') throw new Error('Andon 已处理过')
  db.prepare(
    `UPDATE andon_events SET status = 'resolved', chosen_action = ?, resolved_at = ? WHERE id = ?`
  ).run(action, now(), andonId)
  appendEvent(andon.task_id, 'andon-resolved', { andonId, action })
  if (action === 'cancel') return stopTask(andon.task_id)
  const resumeIdx = andon.resume_step_index ?? 0
  resetStepsFrom(andon.run_id, resumeIdx)
  db.prepare('UPDATE runs SET current_step_index = ? WHERE id = ?').run(resumeIdx, andon.run_id)
  transition(andon.task_id, 'queued')
  requestRun(andon.task_id)
  return buildTaskView(andon.task_id)
}

function retryFromCheckpoint(taskId: string): TaskView {
  const run = getActiveRun(taskId)
  if (!run) throw new Error('没有可恢复的 Run')
  const resumeIdx = run.resume_step_index ?? 0
  resetStepsFrom(run.id, resumeIdx)
  getDb().prepare('UPDATE runs SET current_step_index = ? WHERE id = ?').run(resumeIdx, run.id)
  appendEvent(taskId, 'retry-from-checkpoint', { resumeIdx }, run.id)
  transition(taskId, 'queued')
  requestRun(taskId)
  return buildTaskView(taskId)
}

function updateBrief(taskId: string, brief: string): TaskView {
  const status = getStatus(taskId)
  if (!BRIEF_EDITABLE_STATUSES.includes(status)) {
    throw new Error('请先暂停任务再编辑 Brief')
  }
  const db = getDb()
  db.prepare('UPDATE tasks SET brief = ?, updated_at = ? WHERE id = ?').run(brief, now(), taskId)
  appendEvent(taskId, 'brief-edited', { brief })
  if (status !== 'draft') {
    const run = getActiveRun(taskId)
    if (run) {
      resetStepsFrom(run.id, 0)
      db.prepare('UPDATE runs SET current_step_index = 0, resume_step_index = NULL WHERE id = ?').run(run.id)
      db.prepare(
        `UPDATE andon_events SET status = 'resolved', chosen_action = 'replan', resolved_at = ?
         WHERE task_id = ? AND status = 'open'`
      ).run(now(), taskId)
      transition(taskId, 'queued')
      requestRun(taskId)
    }
  }
  publishTask(taskId)
  return buildTaskView(taskId)
}

function refineTask(taskId: string, instruction: string): TaskView {
  const text = instruction.trim()
  if (!text) throw new Error('修改要求不能为空')
  if (text.length > MAX_REFINE_LENGTH) {
    throw new Error(`修改要求不能超过 ${MAX_REFINE_LENGTH} 字符`)
  }
  const status = getStatus(taskId)
  if (!REFINE_ALLOWED_STATUSES.includes(status)) {
    throw new Error('请先暂停任务或等待任务结束后再提出修改')
  }
  const db = getDb()
  const run = getActiveRun(taskId)
  if (!run) throw new Error('没有可用于增量修改的 Run')
  const recipe = getRecipe(run.recipe_id)
  const refineIdx = recipe.refineStepIndex
  const row = db.prepare('SELECT refine_instructions FROM tasks WHERE id = ?').get(taskId) as {
    refine_instructions: string | null
  }
  const next = [...parseRefineInstructions(row.refine_instructions), text]
  db.prepare('UPDATE tasks SET refine_instructions = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(next),
    now(),
    taskId
  )
  resetStepsFrom(run.id, refineIdx)
  db.prepare(
    `UPDATE runs SET current_step_index = ?, resume_step_index = NULL, status = 'active', ended_at = NULL
     WHERE id = ?`
  ).run(refineIdx, run.id)
  appendEvent(taskId, 'refine-requested', { instruction: text }, run.id)
  transition(taskId, 'queued')
  requestRun(taskId)
  return buildTaskView(taskId)
}

function archiveTask(taskId: string): TaskView {
  transition(taskId, 'archived')
  appendEvent(taskId, 'task-archived')
  archiveTaskEvents(taskId)
  return buildTaskView(taskId)
}

function archiveAllDelivered(): { count: number } {
  const rows = getDb().prepare(`SELECT id FROM tasks WHERE status = 'delivered'`).all() as {
    id: string
  }[]
  for (const row of rows) {
    transition(row.id, 'archived')
    appendEvent(row.id, 'task-archived')
    archiveTaskEvents(row.id)
  }
  return { count: rows.length }
}

function resetStepsFrom(runId: string, idx: number): void {
  const db = getDb()
  db.prepare(
    `UPDATE steps SET status = 'pending', attempt = 0, output_summary = NULL, ended_at = NULL
     WHERE run_id = ? AND idx >= ?`
  ).run(runId, idx)
  db.prepare(
    `UPDATE approvals SET status = 'superseded', resolved_at = ?
     WHERE status IN ('pending','approved')
       AND step_id IN (SELECT id FROM steps WHERE run_id = ? AND idx >= ?)`
  ).run(now(), runId, idx)
}

export function recoverAfterRestart(): void {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, status FROM tasks
       WHERE status IN ('planning','queued','step_running','step_retrying','verifying')`
    )
    .all() as { id: string; status: string }[]
  for (const row of rows) {
    const run = getActiveRun(row.id)
    const to = run ? 'paused_by_user' : 'draft'
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(to, now(), row.id)
    appendEvent(row.id, 'recovered-after-restart', { from: row.status, to })
    if (run) {
      db.prepare(`UPDATE steps SET status = 'pending' WHERE run_id = ? AND status = 'running'`).run(
        run.id
      )
    }
  }
}
