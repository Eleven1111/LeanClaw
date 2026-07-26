import { USER_STATUS_MAP } from './machine'
import { actionPhrase } from './progress'
import type {
  InternalStatus,
  TaskSummaryDeliverable,
  TaskSummaryView,
  TaskView
} from './types'

/**
 * 摘要的唯一构造入口。批量 SQL 投影与"从推送的完整 TaskView 派生"两条路径
 * 都经过这里，避免两套实现对同一行产生不同结果。
 */
export interface TaskSummarySource {
  id: string
  goal: string
  status: InternalStatus
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

export function buildTaskSummary(source: TaskSummarySource): TaskSummaryView {
  return {
    id: source.id,
    goal: source.goal,
    status: source.status,
    userStatus: USER_STATUS_MAP[source.status],
    recipeId: source.recipeId,
    projectId: source.projectId,
    projectName: source.projectName,
    agentId: source.agentId,
    agentName: source.agentName,
    queuePosition: source.queuePosition,
    runningStepTitle: source.runningStepTitle,
    lastDoneLabel: source.lastDoneLabel,
    modelCalls: source.modelCalls,
    toolCalls: source.toolCalls,
    deliverables: source.deliverables,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  }
}

export function summarizeTaskView(task: TaskView): TaskSummaryView {
  const running = task.steps.find((step) => step.status === 'running')
  const lastDone = [...task.steps].reverse().find((step) => step.status === 'done')
  return buildTaskSummary({
    id: task.id,
    goal: task.goal,
    status: task.status,
    recipeId: task.recipeId,
    projectId: task.projectId,
    projectName: task.projectName,
    agentId: task.agentId,
    agentName: task.agentName,
    queuePosition: task.queuePosition,
    runningStepTitle: running?.title ?? null,
    lastDoneLabel: lastDone?.outputSummary ?? lastDone?.title ?? null,
    modelCalls: task.metrics.modelCalls,
    toolCalls: task.metrics.toolCalls,
    deliverables: task.artifacts
      .filter((artifact) => artifact.isDeliverable)
      .map((artifact) => ({
        id: artifact.id,
        title: artifact.title,
        version: artifact.version
      })),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  })
}

export function summaryStepPhrase(
  summary: Pick<TaskSummaryView, 'runningStepTitle' | 'lastDoneLabel'>
): string {
  return summary.runningStepTitle
    ? actionPhrase(summary.runningStepTitle)
    : summary.lastDoneLabel ?? ''
}
