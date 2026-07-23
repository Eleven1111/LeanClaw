import { useCallback, useEffect, useState } from 'react'
import { agentColorIndex } from '../../shared/agent'
import type { AgentUpsertInput, AgentView, RecipeView } from '../../shared/types'

const AGENT_COLOR_COUNT = 6

interface AgentFormState {
  name: string
  description: string
  instructions: string
  defaultRecipeId: string
  defaultBudgetUsd: string
  maxConcurrentRuns: number
}

const EMPTY_FORM: AgentFormState = {
  name: '',
  description: '',
  instructions: '',
  defaultRecipeId: '',
  defaultBudgetUsd: '',
  maxConcurrentRuns: 1
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method 'rpc': Error:\s*/, '')
}

function formFor(agent?: AgentView): AgentFormState {
  if (!agent) return { ...EMPTY_FORM }
  return {
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    defaultRecipeId: agent.defaultRecipeId ?? '',
    defaultBudgetUsd:
      agent.defaultBudgetUsd === null ? '' : String(agent.defaultBudgetUsd),
    maxConcurrentRuns: agent.maxConcurrentRuns
  }
}

function referenceSummary(agent: AgentView): string {
  return `${agent.taskCount} 个任务 · ${agent.scheduleCount} 个自动化`
}

export function Agents({
  onUseAgent
}: {
  onUseAgent: (agent: AgentView) => void
}): React.JSX.Element {
  const [agents, setAgents] = useState<AgentView[]>([])
  const [recipes, setRecipes] = useState<RecipeView[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined)
  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const refresh = useCallback(async (showLoading = false): Promise<void> => {
    if (showLoading) setLoading(true)
    try {
      const [nextAgents, nextRecipes] = await Promise.all([
        window.api.rpc({ method: 'listAgents' }),
        window.api.rpc({ method: 'listRecipes' })
      ])
      setAgents(nextAgents as AgentView[])
      setRecipes(nextRecipes as RecipeView[])
      setPageError('')
    } catch (error) {
      setPageError(errorMessage(error))
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh(true)
  }, [refresh])

  const beginCreate = (): void => {
    setEditingId(null)
    setForm(formFor())
    setFormError('')
    setPageError('')
    setConfirmDeleteId(null)
  }

  const beginEdit = (agent: AgentView): void => {
    setEditingId(agent.id)
    setForm(formFor(agent))
    setFormError('')
    setPageError('')
    setConfirmDeleteId(null)
  }

  const closeForm = (): void => {
    if (busyAction === 'save') return
    setEditingId(undefined)
    setFormError('')
  }

  const save = async (): Promise<void> => {
    if (busyAction) return
    setBusyAction('save')
    setFormError('')
    const input: AgentUpsertInput = {
      ...(editingId ? { id: editingId } : {}),
      name: form.name,
      description: form.description,
      instructions: form.instructions,
      defaultRecipeId: form.defaultRecipeId || null,
      defaultBudgetUsd: form.defaultBudgetUsd.trim()
        ? Number(form.defaultBudgetUsd)
        : null,
      maxConcurrentRuns: form.maxConcurrentRuns
    }
    try {
      await window.api.rpc({ method: 'saveAgent', ...input })
      setEditingId(undefined)
      await refresh()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  const setEnabled = async (agent: AgentView): Promise<void> => {
    if (busyAction) return
    setBusyAction(`enabled:${agent.id}`)
    setPageError('')
    setConfirmDeleteId(null)
    try {
      await window.api.rpc({
        method: 'setAgentEnabled',
        agentId: agent.id,
        enabled: !agent.enabled
      })
      await refresh()
    } catch (error) {
      setPageError(errorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  const deleteAgent = async (agentId: string): Promise<void> => {
    if (busyAction) return
    setBusyAction(`delete:${agentId}`)
    setPageError('')
    try {
      await window.api.rpc({ method: 'deleteAgent', agentId })
      setConfirmDeleteId(null)
      await refresh()
    } catch (error) {
      setPageError(errorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  const formOpen = editingId !== undefined
  const saving = busyAction === 'save'

  return (
    <main className="home agents-page">
      <div className="home-head agent-page-head">
        <div>
          <h1>Agent</h1>
          <p className="sub">
            保存可复用的执行默认值与稳定指令；Agent 不是聊天入口，也不会假装在线。
          </p>
        </div>
        {!loading && agents.length > 0 && !formOpen && (
          <button className="primary" onClick={beginCreate}>
            创建 Agent
          </button>
        )}
      </div>

      {pageError && (
        <div className="error agent-page-error" role="alert">
          {pageError}
        </div>
      )}

      {formOpen && (
        <form
          className="card agent-form"
          aria-labelledby="agent-form-title"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className="agent-form-head">
            <div>
              <h2 id="agent-form-title">{editingId ? '编辑 Agent' : '创建 Agent'}</h2>
              <p className="muted">这些配置会在发起任务时作为默认值使用。</p>
            </div>
            {editingId && (
              <span className="agent-form-state">
                {agents.find((agent) => agent.id === editingId)?.enabled ? '已启用' : '已停用'}
              </span>
            )}
          </div>

          <label className="agent-field">
            <span>Agent 名称</span>
            <input
              autoFocus
              required
              maxLength={40}
              value={form.name}
              aria-describedby={formError ? 'agent-form-error' : undefined}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>

          <label className="agent-field">
            <span>用途说明</span>
            <textarea
              rows={3}
              maxLength={240}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <small className="agent-field-count">{form.description.length}/240</small>
          </label>

          <label className="agent-field">
            <span>稳定指令</span>
            <textarea
              className="agent-instructions"
              rows={8}
              maxLength={10_000}
              value={form.instructions}
              onChange={(event) => setForm({ ...form, instructions: event.target.value })}
            />
            <small className="agent-field-count">{form.instructions.length}/10000</small>
          </label>

          <div className="agent-form-options">
            <label className="agent-field">
              <span>默认 Recipe</span>
              <select
                value={form.defaultRecipeId}
                onChange={(event) => setForm({ ...form, defaultRecipeId: event.target.value })}
              >
                <option value="">不指定</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="agent-field">
              <span>默认预算</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder="沿用全局预算"
                value={form.defaultBudgetUsd}
                onChange={(event) => setForm({ ...form, defaultBudgetUsd: event.target.value })}
              />
            </label>

            <label className="agent-field">
              <span>最大并发</span>
              <select
                value={form.maxConcurrentRuns}
                onChange={(event) =>
                  setForm({ ...form, maxConcurrentRuns: Number(event.target.value) })
                }
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          </div>

          {formError && (
            <div id="agent-form-error" className="error" role="alert">
              {formError}
            </div>
          )}

          <div className="actions agent-form-actions">
            <button className="primary" type="submit" disabled={saving || !form.name.trim()}>
              {saving ? '保存中…' : '保存 Agent'}
            </button>
            <button type="button" disabled={saving} onClick={closeForm}>
              取消
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="agent-empty" role="status">
          <strong>正在加载 Agent…</strong>
        </div>
      ) : agents.length === 0 ? (
        <section className="agent-empty">
          <div className="agent-empty-mark" aria-hidden="true">
            A
          </div>
          <h2>还没有 Agent</h2>
          <p>创建一套可复用的默认执行配置，之后仍由你决定何时发起任务。</p>
          {!formOpen && (
            <button className="primary" onClick={beginCreate}>
              创建 Agent
            </button>
          )}
        </section>
      ) : (
        <div className="agent-list">
          {agents.map((agent) => {
            const recipe = recipes.find((candidate) => candidate.id === agent.defaultRecipeId)
            const deleteBlocked = agent.taskCount > 0 || agent.scheduleCount > 0
            const isConfirmingDelete = confirmDeleteId === agent.id
            const cardBusy =
              busyAction === `enabled:${agent.id}` || busyAction === `delete:${agent.id}`
            const blockerId = `agent-delete-blocker-${agent.id}`

            return (
              <article className="card agent-card" data-agent-id={agent.id} key={agent.id}>
                <div className="agent-card-head">
                  <div
                    className={`agent-avatar agent-avatar-${agentColorIndex(
                      agent.id,
                      AGENT_COLOR_COUNT
                    )}`}
                    aria-hidden="true"
                  >
                    {agent.name.trim().charAt(0).toLocaleUpperCase() || 'A'}
                  </div>
                  <div className="agent-card-title">
                    <h2 title={agent.name}>{agent.name}</h2>
                    <span className={`agent-state ${agent.enabled ? 'enabled' : 'disabled'}`}>
                      {agent.enabled ? '已启用' : '已停用'}
                    </span>
                  </div>
                </div>

                <p className="agent-description">
                  {agent.description || '暂无用途说明'}
                </p>

                <dl className="agent-meta">
                  <div>
                    <dt>默认 Recipe</dt>
                    <dd>{agent.defaultRecipeId ? recipe?.title ?? 'Recipe 已不可用' : '未设置'}</dd>
                  </div>
                  <div>
                    <dt>默认预算</dt>
                    <dd>
                      {agent.defaultBudgetUsd === null
                        ? '沿用全局'
                        : `$${agent.defaultBudgetUsd.toFixed(2)}`}
                    </dd>
                  </div>
                  <div>
                    <dt>并发限制</dt>
                    <dd>最大并发 {agent.maxConcurrentRuns}</dd>
                  </div>
                </dl>

                <p className="agent-references">{referenceSummary(agent)}</p>

                {deleteBlocked && (
                  <p className="agent-blocker" id={blockerId}>
                    当前仍有引用；请先解绑任务和自动化，再删除 Agent。
                  </p>
                )}

                {isConfirmingDelete && (
                  <div className="agent-delete-confirm" role="group" aria-label="删除确认">
                    <p>确定删除这个 Agent？</p>
                    <div className="actions">
                      <button
                        className="danger-confirm"
                        disabled={cardBusy}
                        onClick={() => void deleteAgent(agent.id)}
                      >
                        {cardBusy ? '删除中…' : '确认删除'}
                      </button>
                      <button
                        disabled={cardBusy}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                <div className="actions agent-actions">
                  <button
                    className="primary agent-use"
                    disabled={!agent.enabled || cardBusy}
                    title={agent.enabled ? undefined : '请先启用 Agent'}
                    onClick={() => onUseAgent(agent)}
                  >
                    用它发起任务
                  </button>
                  <button disabled={cardBusy} onClick={() => beginEdit(agent)}>
                    编辑
                  </button>
                  <button disabled={cardBusy} onClick={() => void setEnabled(agent)}>
                    {busyAction === `enabled:${agent.id}`
                      ? '处理中…'
                      : agent.enabled
                        ? '停用'
                        : '启用'}
                  </button>
                  <button
                    disabled={deleteBlocked || cardBusy}
                    aria-describedby={deleteBlocked ? blockerId : undefined}
                    onClick={() => {
                      setPageError('')
                      setConfirmDeleteId(agent.id)
                    }}
                  >
                    删除
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
