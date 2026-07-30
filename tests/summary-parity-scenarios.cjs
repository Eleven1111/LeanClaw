// T07：TaskSummaryView 两条派生路径的逐字节对拍场景集。
//
// 由 tests/summary-parity.mjs 在 `ELECTRON_RUN_AS_NODE=1 electron` 下启动，
// 因此这里的 better-sqlite3 与 src/runtime 的投影代码都是真实实现。
//
// 夹具直接写 SQL 而不驱动执行引擎：被验证的对象是两条**投影**路径，不是编排逻辑；
// 直接构造行可以精确制造边界（多个 Run、绝对路径正文、空 output_summary、多交付物）。
'use strict'

const { mkdirSync } = require('fs')
const { join } = require('path')

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`对拍 harness 缺少环境变量 ${name}`)
  return value
}

const scratch = required('LEANCLAW_EVIDENCE_SCRATCH')
require(required('LEANCLAW_ISOLATION_BUNDLE')).assertTestIsolationEnvironment()
const runtime = require(required('LEANCLAW_EVIDENCE_MODULE'))

mkdirSync(scratch, { recursive: true })

function out(line) {
  process.stdout.write(`${line}\n`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const results = []

function scenario(name, fn) {
  try {
    const detail = fn()
    results.push({ name, ok: true })
    out(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (error) {
    results.push({ name, ok: false })
    out(`FAIL  ${name} — ${error.message}`)
  }
}

const TASK_INPUT_PATH = '/Users/evidence-fixture/workspace/report.md'

// 一个刻意难看的夹具：两个 Run（只有最新的算数）、正文里带绝对路径、空 output_summary、
// 两个交付物 + 一个非交付物、项目名与 Agent 快照、模型/工具调用分布在两个 Run 上。
function seedTask(database, taskId) {
  const iso = (seconds) => `2026-07-30T09:${String(seconds).padStart(2, '0')}:00.000Z`
  database.exec('PRAGMA foreign_keys = OFF')
  const run = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO projects (id, name, description, saved_instructions, created_at, updated_at)
         VALUES (?, ?, '', '', ?, ?)`
      )
      .run(`${taskId}-project`, `项目 ${taskId}`, iso(0), iso(0))
    database
      .prepare(
        `INSERT INTO agents (id, name, description, instructions, default_recipe_id,
                             default_budget_usd, max_concurrent_runs, enabled, created_at, updated_at)
         VALUES (?, ?, '', '', NULL, NULL, 1, 1, ?, ?)`
      )
      .run(`${taskId}-agent`, `执行器 ${taskId}`, iso(0), iso(0))
    database
      .prepare(
        `INSERT INTO tasks
           (id, project_id, agent_id, agent_name_snapshot, agent_instructions_snapshot,
            goal, brief, input_path, recipe_id, status, created_at, updated_at, budget_usd)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'file-edit-summarize', 'running', ?, ?, 2.5)`
      )
      .run(
        taskId,
        `${taskId}-project`,
        `${taskId}-agent`,
        `执行器 ${taskId}`,
        '对拍任务目标',
        `Brief 引用 ${TASK_INPUT_PATH}`,
        TASK_INPUT_PATH,
        iso(1),
        iso(9)
      )

    // 旧 Run：两条投影都必须忽略它，包括它的模型/工具调用计数
    database
      .prepare(
        `INSERT INTO runs (id, task_id, recipe_id, status, current_step_index, resume_step_index,
                           started_at, ended_at)
         VALUES (?, ?, 'file-edit-summarize', 'failed', 0, NULL, ?, ?)`
      )
      .run(`${taskId}-run-old`, taskId, iso(1), iso(2))
    database
      .prepare(
        `INSERT INTO steps (id, run_id, idx, name, title, kind, status, attempt, output_summary,
                            started_at, ended_at)
         VALUES (?, ?, 0, 'old_step', '旧步骤', 'model', 'done', 1, '旧 Run 的完成说明', ?, ?)`
      )
      .run(`${taskId}-old-step`, `${taskId}-run-old`, iso(1), iso(2))
    database
      .prepare(
        `INSERT INTO model_calls (id, step_id, model, status, created_at)
         VALUES (?, ?, 'mock-model', 'ok', ?)`
      )
      .run(`${taskId}-old-call`, `${taskId}-old-step`, iso(2))

    const latest = `${taskId}-run`
    database
      .prepare(
        `INSERT INTO runs (id, task_id, recipe_id, status, current_step_index, resume_step_index,
                           started_at, ended_at)
         VALUES (?, ?, 'file-edit-summarize', 'running', 2, NULL, ?, NULL)`
      )
      .run(latest, taskId, iso(3))
    // 最后一个 done 步骤的说明刻意含 Task 私有绝对路径：完整视图会脱敏，列表投影必须一致
    const steps = [
      [0, 'read_input', '读取输入', 'done', 1, ''],
      [1, 'draft', '起草', 'done', 2, `已写入 ${TASK_INPUT_PATH}`],
      [2, 'review', '复核', 'running', 1, null],
      [3, 'deliver', '交付', 'pending', 0, null]
    ]
    for (const [idx, name, title, status, attempt, summary] of steps) {
      database
        .prepare(
          `INSERT INTO steps (id, run_id, idx, name, title, kind, status, attempt, output_summary,
                              started_at, ended_at)
           VALUES (?, ?, ?, ?, ?, 'model', ?, ?, ?, ?, NULL)`
        )
        .run(`${taskId}-step-${idx}`, latest, idx, name, title, status, attempt, summary, iso(3 + idx))
    }
    for (const idx of [0, 1]) {
      database
        .prepare(
          `INSERT INTO model_calls (id, step_id, model, tokens_in, tokens_out, cost_usd, status, created_at)
           VALUES (?, ?, 'mock-model', 10, 20, 0.001, 'ok', ?)`
        )
        .run(`${taskId}-call-${idx}`, `${taskId}-step-${idx}`, iso(4 + idx))
    }
    database
      .prepare(
        `INSERT INTO tool_calls (id, step_id, tool_id, tool_version, input_json, status, risk_level,
                                 retry_count, started_at)
         VALUES (?, ?, 'fs.write', '1', '{}', 'ok', 'medium', 0, ?)`
      )
      .run(`${taskId}-tool`, `${taskId}-step-1`, iso(6))
    for (const [suffix, title, version, deliverable, created] of [
      ['a', '交付物 A', 1, 1, iso(7)],
      ['b', '过程草稿', 1, 0, iso(8)],
      ['c', '交付物 B', 2, 1, iso(9)]
    ]) {
      database
        .prepare(
          `INSERT INTO artifacts (id, task_id, run_id, step_id, type, title, version, content,
                                  local_path, mime_type, producer, source_artifact_ids, hash,
                                  verification_status, is_deliverable, superseded_by, created_at)
           VALUES (?, ?, ?, ?, 'report', ?, ?, ?, NULL, 'text/markdown', 'mock', NULL, NULL,
                   'verified', ?, NULL, ?)`
        )
        .run(
          `${taskId}-artifact-${suffix}`,
          taskId,
          latest,
          `${taskId}-step-1`,
          title,
          version,
          `正文引用 ${TASK_INPUT_PATH}`,
          deliverable,
          created
        )
    }
    return latest
  })
  return run()
}

function stable(summary) {
  // 字段顺序由 buildTaskSummary 决定；这里按 key 排序，保证比较的是内容而不是插入顺序。
  return JSON.stringify(summary, Object.keys(summary).sort())
}

function parityFor(taskId) {
  const fromSql = runtime.listTaskSummaries().find((summary) => summary.id === taskId)
  assert(fromSql, `listTaskSummaries() 未返回 ${taskId}`)
  const fromPush = runtime.summarizeTaskView(runtime.buildTaskView(taskId))
  return { fromSql, fromPush }
}

function assertParity(taskId) {
  const { fromSql, fromPush } = parityFor(taskId)
  const sqlKeys = Object.keys(fromSql).sort()
  const pushKeys = Object.keys(fromPush).sort()
  assert(
    JSON.stringify(sqlKeys) === JSON.stringify(pushKeys),
    `两条路径的字段集合不同\n  SQL：${sqlKeys.join(',')}\n  推送：${pushKeys.join(',')}`
  )
  const differing = sqlKeys.filter(
    (key) => JSON.stringify(fromSql[key]) !== JSON.stringify(fromPush[key])
  )
  assert(
    differing.length === 0,
    `两条路径对同一 Task 产出不同结果，字段：${differing.join(', ')}\n` +
      differing
        .map(
          (key) =>
            `  ${key}\n    SQL   ：${JSON.stringify(fromSql[key])}\n    推送  ：${JSON.stringify(fromPush[key])}`
        )
        .join('\n')
  )
  assert(
    stable(fromSql) === stable(fromPush),
    '字段逐个相等但稳定序列化结果不同，说明存在字段集合或顺序差异'
  )
  return fromSql
}

const dataDir = join(scratch, 'parity')
mkdirSync(dataDir, { recursive: true })
const database = runtime.initDb(dataDir)

scenario('两条派生路径对同一 Task 逐字节一致', () => {
  seedTask(database, 'parity-task')
  const summary = assertParity('parity-task')
  return `${Object.keys(summary).length} 个字段全等`
})

scenario('进度文案只取最新 Run，且沿用完整视图的脱敏结果', () => {
  const { fromSql, fromPush } = parityFor('parity-task')
  assert(
    fromPush.runningStepTitle === '复核',
    `最新 Run 的进行中步骤应为「复核」，实际 ${JSON.stringify(fromPush.runningStepTitle)}`
  )
  assert(
    fromSql.lastDoneLabel !== null && !fromSql.lastDoneLabel.includes(TASK_INPUT_PATH),
    `列表投影泄漏了 Task 私有绝对路径：${JSON.stringify(fromSql.lastDoneLabel)}`
  )
  assert(
    fromSql.lastDoneLabel === fromPush.lastDoneLabel,
    `lastDoneLabel 不一致\n  SQL：${JSON.stringify(fromSql.lastDoneLabel)}\n  推送：${JSON.stringify(fromPush.lastDoneLabel)}`
  )
  return `lastDoneLabel=${JSON.stringify(fromSql.lastDoneLabel)}`
})

scenario('空 output_summary 的处理规则在两条路径上相同', () => {
  const iso = '2026-07-30T10:30:00.000Z'
  database
    .prepare(
      `INSERT INTO tasks (id, goal, brief, input_path, recipe_id, status, created_at, updated_at)
       VALUES ('parity-empty', '只有空说明的任务', NULL, '', 'file-edit-summarize', 'running', ?, ?)`
    )
    .run(iso, iso)
  database
    .prepare(
      `INSERT INTO runs (id, task_id, recipe_id, status, current_step_index, started_at)
       VALUES ('parity-empty-run', 'parity-empty', 'file-edit-summarize', 'running', 0, ?)`
    )
    .run(iso)
  database
    .prepare(
      `INSERT INTO steps (id, run_id, idx, name, title, kind, status, attempt, output_summary, started_at)
       VALUES ('parity-empty-step', 'parity-empty-run', 0, 'draft', '起草', 'model', 'done', 1, '', ?)`
    )
    .run(iso)
  const summary = assertParity('parity-empty')
  // 记录既有语义：`??` 不会对空串回退，所以空 output_summary 得到空标签而不是步骤标题。
  // 两条路径必须同样如此；是否改成回落到标题属于 UI 决策，不在 T07 范围。
  assert(summary.lastDoneLabel === '', `空 output_summary 应得到空标签，实际 ${JSON.stringify(summary.lastDoneLabel)}`)
  return '空串按原样保留，两条路径一致'
})

scenario('计数与交付物只统计最新 Run / 只包含交付物', () => {
  const { fromSql, fromPush } = parityFor('parity-task')
  assert(fromSql.modelCalls === 2, `modelCalls 应为最新 Run 的 2，实际 ${fromSql.modelCalls}`)
  assert(fromSql.toolCalls === 1, `toolCalls 应为 1，实际 ${fromSql.toolCalls}`)
  assert(
    fromSql.deliverables.length === 2,
    `交付物应为 2 个，实际 ${fromSql.deliverables.length}`
  )
  assert(
    JSON.stringify(fromSql.deliverables) === JSON.stringify(fromPush.deliverables),
    '交付物列表或顺序在两条路径上不同'
  )
  return `modelCalls=2 toolCalls=1 deliverables=2`
})

scenario('无 Run 的 draft Task 两条路径同样一致', () => {
  const iso = '2026-07-30T10:00:00.000Z'
  database
    .prepare(
      `INSERT INTO tasks (id, project_id, agent_id, agent_name_snapshot, goal, brief, input_path,
                          recipe_id, status, created_at, updated_at)
       VALUES ('parity-draft', NULL, NULL, NULL, '尚未开始的任务', NULL, '', 'file-edit-summarize',
               'draft', ?, ?)`
    )
    .run(iso, iso)
  const summary = assertParity('parity-draft')
  assert(summary.runningStepTitle === null && summary.lastDoneLabel === null, 'draft 不应有进度文案')
  assert(summary.modelCalls === 0 && summary.toolCalls === 0, 'draft 不应有调用计数')
  return 'draft 任务字段全等'
})

const failed = results.filter((result) => !result.ok)
out('')
out(`双路径对拍台账：${results.length - failed.length}/${results.length} PASS`)
if (failed.length) {
  out(`失败场景：${failed.map((result) => result.name).join(', ')}`)
  process.exit(1)
}
process.exit(0)
