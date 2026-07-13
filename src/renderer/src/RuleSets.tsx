import { useEffect, useState } from 'react'
import type { RuleSetView } from '../../shared/types'

const EMPTY = { name: '', bannedWords: '', minLength: '0', maxLength: '20000', mustStartWith: '', requiredHeadings: '' }

export function RuleSets(): React.JSX.Element {
  const [items, setItems] = useState<RuleSetView[]>([])
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const refresh = async (): Promise<void> => setItems(await window.api.rpc({ method: 'listRuleSets' }) as RuleSetView[])
  useEffect(() => { void refresh() }, [])
  const begin = (item?: RuleSetView): void => {
    setEditingId(item?.id ?? null)
    setForm(item ? { name: item.name, bannedWords: item.bannedWords.join('\n'), minLength: String(item.minLength), maxLength: String(item.maxLength), mustStartWith: item.mustStartWith, requiredHeadings: item.requiredHeadings.join('\n') } : EMPTY)
    setOpen(true); setError('')
  }
  const lines = (value: string): string[] => value.split(/\r?\n|,/).map((part) => part.trim()).filter(Boolean)
  const save = async (): Promise<void> => {
    setError('')
    try {
      await window.api.rpc({ method: 'saveRuleSet', ...(editingId ? { ruleSetId: editingId } : {}), name: form.name, bannedWords: lines(form.bannedWords), minLength: Number(form.minLength), maxLength: Number(form.maxLength), mustStartWith: form.mustStartWith, requiredHeadings: lines(form.requiredHeadings) })
      setOpen(false); await refresh()
    } catch (e) { setError((e as Error).message) }
  }
  const remove = async (id: string): Promise<void> => { await window.api.rpc({ method: 'deleteRuleSet', ruleSetId: id }); await refresh() }

  return <section className="rule-sets">
    <div className="section-head"><div><h2>规则集</h2><p className="muted">确定性检查：禁用词、长度与必含结构。</p></div><button onClick={() => begin()}>新建规则集</button></div>
    {open && <div className="card rule-form">
      <input placeholder="规则集名称" value={form.name} onChange={(e) => setForm({...form,name:e.target.value})}/>
      <div className="rule-lengths"><input type="number" min="0" placeholder="最小长度" value={form.minLength} onChange={(e) => setForm({...form,minLength:e.target.value})}/><input type="number" min="0" placeholder="最大长度" value={form.maxLength} onChange={(e) => setForm({...form,maxLength:e.target.value})}/></div>
      <input placeholder="必须以…开头（可选）" value={form.mustStartWith} onChange={(e) => setForm({...form,mustStartWith:e.target.value})}/>
      <textarea rows={3} placeholder="禁用词（每行一个）" value={form.bannedWords} onChange={(e) => setForm({...form,bannedWords:e.target.value})}/>
      <textarea rows={3} placeholder="必含结构（每行一个，如 ## 结论）" value={form.requiredHeadings} onChange={(e) => setForm({...form,requiredHeadings:e.target.value})}/>
      {error && <div className="error">{error}</div>}
      <div className="actions"><button className="primary" disabled={!form.name.trim()} onClick={() => void save()}>保存规则集</button><button onClick={() => setOpen(false)}>取消</button></div>
    </div>}
    {items.length > 0 && <div className="card-grid">{items.map((item) => <div className="card rule-card" key={item.id}><h3>{item.name}</h3><p className="muted">{item.minLength}–{item.maxLength} 字符 · {item.bannedWords.length} 个禁用词 · {item.requiredHeadings.length} 个必含结构</p><div className="actions"><button onClick={() => begin(item)}>编辑</button><button onClick={() => void remove(item.id)}>删除</button></div></div>)}</div>}
  </section>
}
