import { join } from 'path'
import { existsSync } from 'fs'
import { getDb, getSamplePath, getWorkspaceDir } from './db'
import { handleRpc } from './api'
import { subscribe } from './bus'
import { getRuntimeConfig, resolveConfig, setRuntimeConfig } from './config'
import { getMcpStatus, shutdownAllMcp, syncMcpFromConfig } from './mcp'
import { getTool } from './tools'
import { riskForShell } from './tools-shell'
import { mcpToolId } from '../shared/mcp'
import type { AgentView, RpcRequest, TaskView } from '../shared/types'
import { runDueSchedules, type DueSchedule } from './schedules'

const out = (s: string): void => {
  process.stdout.write(s + '\n')
}

export async function runSmoke(): Promise<void> {
  if (process.env.LEANCLAW_SMOKE_AGENT_MIGRATION) {
    runAgentMigrationSmoke()
    return
  }
  if (process.env.LEANCLAW_SMOKE_AGENT_CRUD) {
    await runAgentCrudSmoke()
    return
  }
  if (process.env.LEANCLAW_SMOKE_SCHEDULE) {
    await runScheduleSmoke()
    return
  }
  if (process.env.LEANCLAW_SMOKE_MCP) {
    await runMcpSmoke()
    return
  }
  if (process.env.LEANCLAW_SMOKE_SHELL) {
    await runShellSmoke()
    return
  }
  if (process.env.LEANCLAW_SMOKE_REFINE) {
    await runRefineSmoke()
    return
  }
  if (process.env.LEANCLAW_SMOKE_MULTI) {
    await runMultiSmoke()
    return
  }
  await runSingleSmoke()
}

async function rpcFails(req: RpcRequest, expected: RegExp): Promise<boolean> {
  try {
    await handleRpc(req)
    return false
  } catch (error) {
    return expected.test((error as Error).message)
  }
}

function runAgentMigrationSmoke(): void {
  const db = getDb()
  const version = (
    db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number }
  ).version
  const agentTable = Boolean(
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='agents'`).get()
  )
  const taskColumns = (
    db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
  ).map((column) => column.name)
  const scheduleColumns = (
    db.prepare('PRAGMA table_info(schedules)').all() as { name: string }[]
  ).map((column) => column.name)
  const task = db
    .prepare(
      `SELECT agent_id as agentId, agent_name_snapshot as agentName,
              agent_instructions_snapshot as agentInstructions
       FROM tasks WHERE id = 'legacy-task'`
    )
    .get() as
    | { agentId: string | null; agentName: string | null; agentInstructions: string | null }
    | undefined
  const schedule = db
    .prepare(`SELECT agent_id as agentId FROM schedules WHERE id = 'legacy-schedule'`)
    .get() as { agentId: string | null } | undefined
  const pass =
    version === 10 &&
    agentTable &&
    ['agent_id', 'agent_name_snapshot', 'agent_instructions_snapshot'].every((column) =>
      taskColumns.includes(column)
    ) &&
    scheduleColumns.includes('agent_id') &&
    task?.agentId === null &&
    task.agentName === null &&
    task.agentInstructions === null &&
    schedule?.agentId === null
  out(
    `[agent-migration] version=${version} agents=${agentTable ? 'yes' : 'no'} ` +
      `legacyTask=${task ? 'kept' : 'missing'} legacySchedule=${schedule ? 'kept' : 'missing'}`
  )
  out(pass ? '[smoke] PASS（v8 → v10 Agent 迁移零丢失）' : '[smoke] FAIL（Agent 迁移）')
  process.exit(pass ? 0 : 1)
}

async function runAgentCrudSmoke(): Promise<void> {
  const input = {
    method: 'saveAgent' as const,
    name: '  Research Agent  ',
    description: '负责带引用的研究任务',
    instructions: '优先核验一手来源。',
    defaultRecipeId: 'deep-research',
    defaultBudgetUsd: 2,
    maxConcurrentRuns: 1
  }
  const created = (await handleRpc(input)) as AgentView
  await new Promise((resolve) => setTimeout(resolve, 5))
  const updated = (await handleRpc({
    ...input,
    id: created.id,
    name: created.name,
    description: '负责可审计的研究任务'
  })) as AgentView
  const duplicateBlocked = await rpcFails(
    { ...input, name: created.name },
    /名称已存在/
  )
  const recipeBlocked = await rpcFails(
    { ...input, name: 'Invalid Recipe Agent', defaultRecipeId: 'missing-recipe' },
    /Recipe/
  )

  const schedule = (await handleRpc({
    method: 'saveSchedule',
    name: 'Agent 引用计划',
    goal: '定时研究',
    inputPath: '',
    recipeId: 'deep-research',
    cadence: 'daily',
    timeOfDay: '08:00'
  })) as { id: string }
  getDb().prepare('UPDATE schedules SET agent_id=? WHERE id=?').run(created.id, schedule.id)
  const scheduleLinked = ((await handleRpc({ method: 'listAgents' })) as AgentView[]).find(
    (agent) => agent.id === created.id
  )
  const activeScheduleBlocked = await rpcFails(
    { method: 'setAgentEnabled', agentId: created.id, enabled: false },
    /暂停或改绑/
  )
  await handleRpc({ method: 'setScheduleEnabled', scheduleId: schedule.id, enabled: false })
  const disabled = (await handleRpc({
    method: 'setAgentEnabled',
    agentId: created.id,
    enabled: false
  })) as AgentView
  const reenabled = (await handleRpc({
    method: 'setAgentEnabled',
    agentId: created.id,
    enabled: true
  })) as AgentView
  const pausedScheduleDeleteBlocked = await rpcFails(
    { method: 'deleteAgent', agentId: created.id },
    /定时计划/
  )
  await handleRpc({ method: 'deleteSchedule', scheduleId: schedule.id })

  const task = (await handleRpc({
    method: 'createTask',
    goal: '保持旧任务创建行为',
    inputPath: '',
    recipeId: 'deep-research'
  })) as TaskView
  getDb().prepare('UPDATE tasks SET agent_id=? WHERE id=?').run(created.id, task.id)
  const taskLinked = ((await handleRpc({ method: 'listAgents' })) as AgentView[]).find(
    (agent) => agent.id === created.id
  )
  const taskDeleteBlocked = await rpcFails(
    { method: 'deleteAgent', agentId: created.id },
    /任务/
  )
  getDb().prepare('UPDATE tasks SET agent_id=NULL WHERE id=?').run(task.id)
  await handleRpc({ method: 'deleteAgent', agentId: created.id })
  const remaining = (await handleRpc({ method: 'listAgents' })) as AgentView[]

  const pass =
    created.name === 'Research Agent' &&
    updated.description === '负责可审计的研究任务' &&
    updated.updatedAt !== created.updatedAt &&
    duplicateBlocked &&
    recipeBlocked &&
    activeScheduleBlocked &&
    scheduleLinked?.scheduleCount === 1 &&
    scheduleLinked.enabledScheduleCount === 1 &&
    !disabled.enabled &&
    reenabled.enabled &&
    pausedScheduleDeleteBlocked &&
    task.status === 'draft' &&
    taskLinked?.taskCount === 1 &&
    taskDeleteBlocked &&
    !remaining.some((agent) => agent.id === created.id)
  out(
    `[agent-crud] trim=${created.name === 'Research Agent'} update=${updated.updatedAt !== created.updatedAt} ` +
      `duplicate=${duplicateBlocked} recipe=${recipeBlocked} activeSchedule=${activeScheduleBlocked} ` +
      `counts=${scheduleLinked?.scheduleCount}/${taskLinked?.taskCount} ` +
      `disable=${!disabled.enabled} reenable=${reenabled.enabled} deleteGuards=${pausedScheduleDeleteBlocked && taskDeleteBlocked}`
  )
  out(pass ? '[smoke] PASS（Agent CRUD 与引用保护）' : '[smoke] FAIL（Agent CRUD）')
  process.exit(pass ? 0 : 1)
}

async function runScheduleSmoke(): Promise<void> {
  const at = new Date()
  const schedule = await handleRpc({
    method: 'saveSchedule', name: '冒烟定时任务', goal: '把文件整理成带引用摘要',
    inputPath: getSamplePath(), recipeId: 'file-edit-summarize', cadence: 'daily', timeOfDay: '08:00'
  }) as { id: string }
  getDb().prepare('UPDATE schedules SET next_run_at=? WHERE id=?').run(new Date(at.getTime() - 1000).toISOString(), schedule.id)
  const trigger = async (due: DueSchedule): Promise<void> => {
    const task = await handleRpc({ method: 'createTask', goal: due.goal, inputPath: due.inputPath, recipeId: due.recipeId }) as TaskView
    getDb().prepare('UPDATE tasks SET schedule_id=? WHERE id=?').run(due.id, task.id)
    await handleRpc({ method: 'startTask', taskId: task.id })
  }
  await runDueSchedules(trigger, at)
  let final: TaskView | undefined
  for (let i = 0; i < 200; i++) {
    const row = getDb().prepare('SELECT id FROM tasks WHERE schedule_id=?').get(schedule.id) as { id: string } | undefined
    if (row) {
      final = await handleRpc({ method: 'getTask', taskId: row.id }) as TaskView
      const approval = final.approvals.find((item) => item.status === 'pending')
      if (approval) await handleRpc({ method: 'resolveApproval', approvalId: approval.id, decision: 'approved' })
      if (['delivered','verification_failed','cancelled_by_user','failed'].includes(final.status)) break
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  await runDueSchedules(trigger, at)
  const count = (getDb().prepare('SELECT COUNT(*) as count FROM tasks WHERE schedule_id=?').get(schedule.id) as { count: number }).count
  const state = getDb().prepare('SELECT next_run_at,last_triggered_at FROM schedules WHERE id=?').get(schedule.id) as { next_run_at: string; last_triggered_at: string | null }
  const concurrent = await handleRpc({ method: 'saveSchedule', name: '并发认领', goal: 'x', inputPath: getSamplePath(), recipeId: 'file-edit-summarize', cadence: 'daily', timeOfDay: '08:00' }) as { id: string }
  getDb().prepare('UPDATE schedules SET next_run_at=? WHERE id=?').run(new Date(at.getTime() - 1000).toISOString(), concurrent.id)
  let claims = 0
  await Promise.all([
    runDueSchedules(async () => { claims++ }, at),
    runDueSchedules(async () => { claims++ }, at)
  ])
  const paused = await handleRpc({ method: 'saveSchedule', name: '暂停计划', goal: 'x', inputPath: getSamplePath(), recipeId: 'file-edit-summarize', cadence: 'daily', timeOfDay: '08:00' }) as { id: string }
  await handleRpc({ method: 'setScheduleEnabled', scheduleId: paused.id, enabled: false })
  getDb().prepare('UPDATE schedules SET next_run_at=? WHERE id=?').run(new Date(at.getTime() - 1000).toISOString(), paused.id)
  let pausedClaims = 0
  await runDueSchedules(async () => { pausedClaims++ }, at)
  const ok = final?.status === 'delivered' && count === 1 && Boolean(state.last_triggered_at) &&
    state.next_run_at > at.toISOString() && claims === 1 && pausedClaims === 0
  out(`[schedule] status=${final?.status} tasks=${count} next=future last=set concurrentClaims=${claims} pausedClaims=${pausedClaims}`)
  out(ok ? '[smoke] PASS（定时任务：到点入队、交付、防重复）' : '[smoke] FAIL（定时任务）')
  process.exit(ok ? 0 : 1)
}

async function runShellSmoke(): Promise<void> {
  const ctx = { allowedDirs: [getWorkspaceDir()] }
  const shellTool = getTool('shell.run')

  const allowRisk = shellTool.riskFor({ command: 'echo hi' }, ctx)
  const denyRisk = shellTool.riskFor({ command: 'ls /' }, ctx)
  const forbiddenCfg = resolveConfig(undefined, undefined, { shellEnabled: false, shellAllowPrefixes: [] })
  const forbiddenRisk = riskForShell('ls /', forbiddenCfg.shellEnabled, forbiddenCfg.shellAllowPrefixes)
  const riskOk = allowRisk === 'low' && denyRisk === 'approval_required' && forbiddenRisk === 'forbidden'
  out(`[shell-risk] allow=${allowRisk} deny=${denyRisk} forbidden=${forbiddenRisk}`)

  let execOk = false
  try {
    const res = await shellTool.execute({ command: 'echo hi' }, ctx)
    execOk = res.data?.exitCode === 0 && String(res.data?.stdout ?? '').includes('hi')
    out(`[shell-exec] ${res.summary}`)
  } catch (e) {
    out('[smoke-error] ' + (e as Error).message)
  }

  let failOk = false
  try {
    await shellTool.execute({ command: 'exit 3' }, ctx)
  } catch (e) {
    const message = (e as Error).message
    failOk = message.includes('3')
    out(`[shell-fail] ${message}`)
  }

  out(
    `[shell] risk=${riskOk ? 'ok' : 'fail'} exec=${execOk ? 'ok' : 'fail'} fail=${failOk ? 'ok' : 'fail'}`
  )
  if (riskOk && execOk && failOk) {
    out('[smoke] PASS（Shell 工具：三级风险判定正确、白名单执行成功、失败命令正确抛错）')
    process.exit(0)
  }
  out(`[smoke] FAIL（Shell：riskOk=${riskOk} execOk=${execOk} failOk=${failOk}）`)
  process.exit(1)
}

async function runMcpSmoke(): Promise<void> {
  const serverId = 'm1'
  if (!process.env.LEANCLAW_MCP_SERVERS) {
    setRuntimeConfig({
      mcpServers: [
        {
          id: serverId,
          name: 'EchoFixture',
          command: process.execPath,
          args: [join(process.cwd(), 'tests/fixtures/mcp-echo-server.cjs')],
          enabled: true,
          env: { ELECTRON_RUN_AS_NODE: '1' }
        }
      ]
    })
  }
  syncMcpFromConfig()

  const deadline = Date.now() + 10000
  let connected = getMcpStatus().find((s) => s.state === 'connected')
  while (!connected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
    connected = getMcpStatus().find((s) => s.state === 'connected')
  }

  const status = getMcpStatus()
  const server = status.find((s) => s.id === serverId) ?? status[0]
  const connectedCount = status.filter((s) => s.state === 'connected').length
  const echoId = mcpToolId(server?.id ?? serverId, 'echo')
  const echoTool = server?.tools.find((t) => t.toolId === echoId)
  const risk = echoTool?.risk ?? 'unknown'
  const toolCount = server?.tools.length ?? 0

  let echoOk = false
  if (echoTool && server?.state === 'connected') {
    try {
      const res = await getTool(echoId).execute({ text: 'hello-mcp' }, { allowedDirs: [] })
      echoOk = res.summary.includes('echo: ')
      out(`[echo] ${res.summary}`)
    } catch (e) {
      out('[smoke-error] ' + (e as Error).message)
    }
  }

  out(
    `[mcp] connected=${connectedCount} tools=${toolCount} echo=${echoOk ? 'ok' : 'fail'} risk=${risk}`
  )
  await shutdownAllMcp()

  const pass =
    server?.state === 'connected' &&
    connectedCount >= 1 &&
    !!echoTool &&
    risk === 'approval_required' &&
    echoOk
  if (pass) {
    out('[smoke] PASS（MCP 链路：已连接、echo 工具注册且默认 approval_required、execute 返回 echo:）')
    process.exit(0)
  }
  out(
    `[smoke] FAIL（MCP：state=${server?.state} connected=${connectedCount} echoTool=${!!echoTool} risk=${risk} echoOk=${echoOk}）`
  )
  process.exit(1)
}

async function runRefineSmoke(): Promise<void> {
  const inputPath = getSamplePath()
  const goal = '把这个文件整理成一份带引用的摘要，保存为 Markdown。'
  const instruction = '在摘要开头加上一句总体结论。'
  let taskId = ''
  let refineSent = false
  let leftDeliveredAfterRefine = false
  let settle: (v: string) => void = () => undefined
  const finished = new Promise<string>((r) => {
    settle = r
  })

  subscribe(({ task }) => {
    if (taskId && task.id !== taskId) return
    void (async () => {
      try {
        if (task.status !== 'delivered' && refineSent) leftDeliveredAfterRefine = true
        if (task.status === 'awaiting_approval') {
          const appr = task.approvals.find((a) => a.status === 'pending')
          if (appr) {
            out(`[approval] 自动批准: ${appr.actionDesc}`)
            await handleRpc({ method: 'resolveApproval', approvalId: appr.id, decision: 'approved' })
          }
        } else if (task.status === 'andon_open') {
          const andon = task.andons.find((a) => a.status === 'open')
          if (andon) await handleRpc({ method: 'resolveAndon', andonId: andon.id, action: 'cancel' })
        } else if (task.status === 'delivered') {
          if (!refineSent) {
            refineSent = true
            out(`[refine] 提交修改指令: ${instruction}`)
            const id = task.id
            setTimeout(() => {
              void handleRpc({ method: 'refineTask', taskId: id, instruction }).catch((e) => {
                out('[smoke-error] ' + (e as Error).message)
                settle('smoke-error')
              })
            }, 0)
          } else if (leftDeliveredAfterRefine) {
            settle('delivered')
          }
        } else if (['cancelled_by_user', 'verification_failed', 'failed'].includes(task.status)) {
          settle(task.status)
        }
      } catch (e) {
        out('[smoke-error] ' + (e as Error).message)
        settle('smoke-error')
      }
    })()
  })

  const created = (await handleRpc({
    method: 'createTask',
    goal,
    inputPath,
    recipeId: 'file-edit-summarize'
  })) as TaskView
  taskId = created.id
  out(`[task] created ${created.id}`)
  await handleRpc({ method: 'startTask', taskId: created.id })

  const timeout = new Promise<string>((r) => setTimeout(() => r('timeout'), 60000))
  const finalStatus = await Promise.race([finished, timeout])

  const db = getDb()
  const arts = db
    .prepare(
      `SELECT version, superseded_by, content FROM artifacts
       WHERE task_id = ? AND type = 'deliverable' ORDER BY version`
    )
    .all(taskId) as { version: number; superseded_by: string | null; content: string | null }[]
  const latest = arts[arts.length - 1]
  const apprs = db
    .prepare('SELECT status FROM approvals WHERE task_id = ?')
    .all(taskId) as { status: string }[]
  const supersededCount = apprs.filter((a) => a.status === 'superseded').length
  const v2ok = latest !== undefined && latest.version === 2
  const oldSuperseded = arts.length >= 2 && arts[0].superseded_by !== null
  const contentUpdated = String(latest?.content ?? '').includes('已按修改要求调整')
  const apprTotal = apprs.length

  out(
    `[final] status=${finalStatus} deliverables=${arts.length} approvals=${apprTotal} superseded=${supersededCount}`
  )
  out(
    `[refine] v2 delivered, approvals=${apprTotal}(${supersededCount} superseded), content-updated=${contentUpdated}`
  )
  const pass =
    finalStatus === 'delivered' &&
    v2ok &&
    oldSuperseded &&
    apprTotal === 2 &&
    supersededCount === 1 &&
    contentUpdated
  if (pass) {
    out('[smoke] PASS（增量 Run：v2 交付、旧版被取代、第二轮产生新批准、内容已更新）')
    process.exit(0)
  }
  out(
    `[smoke] FAIL（增量 Run：status=${finalStatus} v2ok=${v2ok} oldSuperseded=${oldSuperseded} ` +
      `apprTotal=${apprTotal} superseded=${supersededCount} contentUpdated=${contentUpdated}）`
  )
  process.exit(1)
}

async function runSingleSmoke(): Promise<void> {
  const expect = process.env.LEANCLAW_SMOKE_EXPECT || 'delivered'
  const budgetEnv = process.env.LEANCLAW_SMOKE_BUDGET
  const budgetUsd = budgetEnv !== undefined ? Number(budgetEnv) : undefined
  const defaultRecipe = budgetUsd !== undefined ? 'content-pack' : 'file-edit-summarize'
  const recipeId = process.env.LEANCLAW_SMOKE_RECIPE || defaultRecipe
  const isDeepResearch = recipeId === 'deep-research'
  const isContentPack = recipeId === 'content-pack'
  const inputPath = isDeepResearch ? '' : process.env.LEANCLAW_SMOKE_INPUT || getSamplePath()
  const goal = isDeepResearch
    ? '研究 AI Agent 桌面应用的最新发展，输出带引用的分析报告。'
    : isContentPack
      ? '基于这份素材写一篇适合发布的文章。'
      : '把这个文件整理成一份带引用的摘要，保存为 Markdown。'
  let lastStatus = ''
  let retriedOnce = false
  let settle: (v: string) => void = () => undefined
  const finished = new Promise<string>((r) => {
    settle = r
  })

  subscribe(({ task }) => {
    if (task.status !== lastStatus) {
      lastStatus = task.status
      out(`[status] ${task.status} (${task.userStatus})`)
    }
    void (async () => {
      try {
        if (task.status === 'awaiting_approval') {
          const appr = task.approvals.find((a) => a.status === 'pending')
          if (appr) {
            out(`[approval] 自动批准: ${appr.actionDesc}`)
            await handleRpc({ method: 'resolveApproval', approvalId: appr.id, decision: 'approved' })
          }
        } else if (task.status === 'andon_open') {
          const andon = task.andons.find((a) => a.status === 'open')
          if (!andon) return
          out(`[andon] ${andon.reason}`)
          if (expect === 'delivered' && !retriedOnce && andon.recommendedActions.includes('retry')) {
            retriedOnce = true
            await handleRpc({ method: 'resolveAndon', andonId: andon.id, action: 'retry' })
          } else {
            await handleRpc({ method: 'resolveAndon', andonId: andon.id, action: 'cancel' })
          }
        } else if (
          ['delivered', 'verification_failed', 'cancelled_by_user', 'failed'].includes(task.status)
        ) {
          settle(task.status)
        }
      } catch (e) {
        out('[smoke-error] ' + (e as Error).message)
        settle('smoke-error')
      }
    })()
  })

  const created = (await handleRpc({
    method: 'createTask',
    goal,
    inputPath,
    recipeId,
    ...(budgetUsd !== undefined ? { budgetUsd } : {})
  })) as TaskView
  out(`[task] created ${created.id}`)
  out(`[input] ${inputPath}`)
  await handleRpc({ method: 'startTask', taskId: created.id })

  const timeout = new Promise<string>((r) => setTimeout(() => r('timeout'), 60000))
  const finalStatus = await Promise.race([finished, timeout])
  const view = (await handleRpc({ method: 'getTask', taskId: created.id })) as TaskView
  const events = getDb()
    .prepare('SELECT COUNT(*) c FROM run_events WHERE task_id = ?')
    .get(created.id) as { c: number }
  out(
    `[final] status=${finalStatus} artifacts=${view.artifacts.length} verifications=${view.verifications.length} ` +
      `evidence=${view.evidence.length} approvals=${view.approvals.length} andons=${view.andons.length} ` +
      `events=${events.c} retries=${view.metrics.retries} cost=$${view.metrics.costUsd.toFixed(4)}`
  )
  const deliverable = view.artifacts.find((a) => a.isDeliverable)
  if (deliverable?.localPath) out(`[deliverable] ${deliverable.localPath}`)

  const fallbackEvents = getDb()
    .prepare(`SELECT COUNT(*) c FROM run_events WHERE task_id = ? AND type = 'model-fallback'`)
    .get(created.id) as { c: number }
  const modelCallStats = getDb()
    .prepare(
      `SELECT status, COUNT(*) c FROM model_calls
       WHERE step_id IN (SELECT s.id FROM steps s JOIN runs r ON s.run_id = r.id WHERE r.task_id = ?)
       GROUP BY status`
    )
    .all(created.id) as { status: string; c: number }[]
  const errorCalls = modelCallStats.find((s) => s.status === 'error')?.c ?? 0
  const okCalls = modelCallStats.find((s) => s.status === 'ok')?.c ?? 0
  out(`[fallback] event=${fallbackEvents.c} error-call=${errorCalls} ok-call=${okCalls}`)

  const expectFallback = process.env.LEANCLAW_FAULT === 'primary_500'
  const fallbackOk = !expectFallback || (fallbackEvents.c >= 1 && errorCalls === 1 && okCalls >= 1)
  const snapshotOk =
    !isDeepResearch ||
    finalStatus !== 'delivered' ||
    (view.evidence.length > 0 && view.evidence.every((e) => Boolean(e.snapshotPath && existsSync(e.snapshotPath))))
  if (isDeepResearch && finalStatus === 'delivered') out(`[snapshots] persisted=${snapshotOk ? view.evidence.length : 0}`)

  if (finalStatus === expect && fallbackOk && snapshotOk) {
    out(`[smoke] PASS（预期 ${expect}）`)
    process.exit(0)
  }
  out(
    `[smoke] FAIL（预期 ${expect}，实际 ${finalStatus}${expectFallback ? `，fallbackOk=${fallbackOk}` : ''}，snapshotOk=${snapshotOk}）`
  )
  process.exit(1)
}

const MULTI_ACTIVE_STATUSES = new Set(['step_running', 'step_retrying', 'verifying'])
const MULTI_TERMINAL_STATUSES = new Set(['delivered', 'verification_failed', 'cancelled_by_user', 'failed'])

async function runMultiSmoke(): Promise<void> {
  const n = Math.max(1, parseInt(process.env.LEANCLAW_SMOKE_MULTI || '5', 10) || 5)
  const recipeId = process.env.LEANCLAW_SMOKE_RECIPE || 'file-edit-summarize'
  const inputPath = getSamplePath()
  const goal = '把这个文件整理成一份带引用的摘要，保存为 Markdown。'
  const maxActive = getRuntimeConfig().maxActiveTasks

  const ids = new Set<string>()
  const statuses = new Map<string, string>()
  const settled = new Set<string>()
  const delivered = new Set<string>()
  let peak = 0
  let settle: () => void = () => undefined
  const finished = new Promise<void>((r) => {
    settle = r
  })

  subscribe(({ task }) => {
    if (!ids.has(task.id)) return
    statuses.set(task.id, task.status)
    const activeCount = [...statuses.values()].filter((s) => MULTI_ACTIVE_STATUSES.has(s)).length
    peak = Math.max(peak, activeCount)
    void (async () => {
      try {
        if (task.status === 'awaiting_approval') {
          const appr = task.approvals.find((a) => a.status === 'pending')
          if (appr) await handleRpc({ method: 'resolveApproval', approvalId: appr.id, decision: 'approved' })
        } else if (task.status === 'andon_open') {
          const andon = task.andons.find((a) => a.status === 'open')
          if (andon) {
            const action = andon.recommendedActions.includes('retry') ? 'retry' : 'cancel'
            await handleRpc({ method: 'resolveAndon', andonId: andon.id, action })
          }
        } else if (MULTI_TERMINAL_STATUSES.has(task.status) && !settled.has(task.id)) {
          settled.add(task.id)
          if (task.status === 'delivered') delivered.add(task.id)
          if (settled.size === n) settle()
        }
      } catch (e) {
        out('[smoke-error] ' + (e as Error).message)
        if (!settled.has(task.id)) {
          settled.add(task.id)
          if (settled.size === n) settle()
        }
      }
    })()
  })

  const createdIds: string[] = []
  for (let i = 0; i < n; i++) {
    const t = (await handleRpc({ method: 'createTask', goal, inputPath, recipeId })) as TaskView
    ids.add(t.id)
    createdIds.push(t.id)
  }
  out(`[multi] created ${createdIds.length} tasks, maxActive=${maxActive}`)
  for (const id of createdIds) {
    await handleRpc({ method: 'startTask', taskId: id })
  }

  const timeout = new Promise<void>((r) => setTimeout(() => r(), 90000))
  await Promise.race([finished, timeout])

  out(`[multi] peak=${peak} delivered=${delivered.size}`)
  if (peak <= maxActive && delivered.size === n) {
    out(`[smoke] PASS（并发排队：peak=${peak} ≤ maxActive=${maxActive}，${delivered.size}/${n} 全部交付）`)
    process.exit(0)
  }
  out(`[smoke] FAIL（并发排队：peak=${peak}，delivered=${delivered.size}/${n}）`)
  process.exit(1)
}
