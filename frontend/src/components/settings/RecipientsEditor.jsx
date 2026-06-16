import { useState } from 'react'
import { Mail, X, Plus, Save } from 'lucide-react'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function RecipientsEditor({ recipients, onSave }) {
  const [list,  setList]  = useState(recipients)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(list) !== JSON.stringify(recipients)

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (!EMAIL_RE.test(v)) { setError('Enter a valid email address'); return }
    if (list.some(r => r.toLowerCase() === v.toLowerCase())) { setError('Already added'); return }
    setList([...list, v]); setDraft(''); setError('')
  }

  const remove = (i) => setList(list.filter((_, j) => j !== i))

  const save = async () => {
    setSaving(true)
    try { await onSave(list) } finally { setSaving(false) }
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-100 bg-slate-50">
        <Mail size={14} className="text-slate-400" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">Report Recipients</p>
          <p className="text-2xs text-slate-400">Emailed automatically when you run with "Run All &amp; Email" or a schedule</p>
        </div>
        {dirty && (
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
            {saving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={12} />}
            Save
          </button>
        )}
      </div>

      <div className="p-5">
        {list.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {list.map((r, i) => (
              <span key={r} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs font-medium pl-3 pr-1.5 py-1 rounded-full">
                {r}
                <button onClick={() => remove(i)}
                  className="w-4 h-4 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-white transition-colors">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 mb-3">No recipients yet — add one below.</p>
        )}

        <div className="flex gap-2">
          <input
            value={draft}
            onChange={e => { setDraft(e.target.value); if (error) setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="name@dealer.com"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors" />
          <button onClick={add}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
            <Plus size={13} /> Add
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}
