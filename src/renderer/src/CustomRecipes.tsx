import { useEffect, useState } from 'react'
import { CONTENT_PIPELINE_STEPS } from '../../shared/custom-recipe'
import type { CustomRecipeView, RuleSetView } from '../../shared/types'

const STEP_LABELS: Record<string, string> = {
  read_material: '读取素材', generate_outline: '生成大纲', verify_outline: '校验大纲',
  generate_draft: '生成初稿', verify_rules: '应用规则集', write_output: '批准写入',
  verify_output: '验证文件', deliver: '交付'
}

export function CustomRecipes({ onUse }: { onUse: (recipeId: string) => void }): React.JSX.Element {
  const [items, setItems] = useState<CustomRecipeView[]>([])
  const [rules, setRules] = useState<RuleSetView[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [ruleSetId, setRuleSetId] = useState('')
  const [error, setError] = useState('')
  const refresh = async (): Promise<void> => {
    const [custom, ruleSets] = await Promise.all([
      window.api.rpc({ method: 'listCustomRecipes' }), window.api.rpc({ method: 'listRuleSets' })
    ])
    setItems(custom as CustomRecipeView[]); setRules(ruleSets as RuleSetView[])
  }
  useEffect(() => {
    void refresh()
    const listener = (): void => { void refresh() }
    window.addEventListener('rules-changed', listener)
    return () => window.removeEventListener('rules-changed', listener)
  }, [])
  const begin = (): void => { setName(''); setGoal(''); setRuleSetId(rules[0]?.id ?? ''); setError(''); setOpen(true) }
  const save = async (): Promise<void> => {
    setError('')
    try {
      await window.api.rpc({ method: 'saveCustomRecipe', name, goal, stepIds: [...CONTENT_PIPELINE_STEPS], ruleSetId })
      setOpen(false); await refresh()
    } catch (e) { setError((e as Error).message) }
  }
  const remove = async (id: string): Promise<void> => { await window.api.rpc({ method: 'deleteCustomRecipe', customRecipeId: id }); await refresh() }
  return <section className="custom-recipes">
    <div className="section-head"><div><h2>自定义 Recipe</h2><p className="muted">只组合已验证的线性 Step，不执行任意代码。</p></div><button disabled={rules.length === 0} onClick={begin}>组合 Recipe</button></div>
    {rules.length === 0 && <p className="muted">先创建一个规则集，才能组合内容生产 Recipe。</p>}
    {open && <div className="card custom-recipe-form">
      <input placeholder="Recipe 名称" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea rows={2} placeholder="Recipe 目标" value={goal} onChange={(e) => setGoal(e.target.value)} />
      <select aria-label="规则集" value={ruleSetId} onChange={(e) => setRuleSetId(e.target.value)}>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}</select>
      <ol className="composer-steps">{CONTENT_PIPELINE_STEPS.map((step, index) => <li key={step}><span>{index + 1}</span>{STEP_LABELS[step]}<code>{step}</code></li>)}</ol>
      <p className="muted">当前版本锁定依赖顺序；不支持分支、循环、脚本或 Shell。</p>
      {error && <div className="error">{error}</div>}
      <div className="actions"><button className="primary" disabled={!name.trim() || !goal.trim() || !ruleSetId} onClick={() => void save()}>保存 Recipe</button><button onClick={() => setOpen(false)}>取消</button></div>
    </div>}
    {items.length > 0 && <div className="card-grid">{items.map((item) => <div className="card recipe-card" key={item.id}><h3>{item.name}</h3><p className="muted">{item.goal}</p><p className="recipe-meta muted">{item.stepIds.length} 步 · 规则集：{item.ruleSetName}</p><div className="actions"><button className="primary" onClick={() => onUse(`custom:${item.id}`)}>用这个 Recipe 发起</button><button onClick={() => void remove(item.id)}>删除</button></div></div>)}</div>}
  </section>
}
