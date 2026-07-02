import { useState, useEffect } from 'react'
import { AlertTriangle, Users, RefreshCw, Check, Clock, Plus, CheckCircle2 } from 'lucide-react'
import { getBreaks, updateBreak, getBreakDiff } from '../api/breaks'
import { toast } from '../lib/toast'

const BREAK_META = {
  unmatched_axel: { label: 'Only in AXEL', chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60' },
  unmatched_dms:  { label: 'Only in DMS',  chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/60' },
  failed:         { label: 'Failed check', chip: 'bg-red-50 text-red-700 ring-1 ring-red-200/60' },
}

const STATUS_META = {
  open:         { label: 'Open',         chip: 'bg-amber-50 text-amber-700' },
  acknowledged: { label: 'Acknowledged', chip: 'bg-blue-50 text-blue-700' },
  resolved:     { label: 'Resolved',     chip: 'bg-emerald-50 text-emerald-700' },
}

function BreakRow({ brk, onChange }) {
  const [comment, setComment] = useState(brk.comment || '')
  const [assignee, setAssignee] = useState(brk.assignee || '')
  const meta = BREAK_META[brk.break_type] || { label: brk.break_type, chip: 'bg-slate-100 text-slate-600' }

  const patch = async (fields) => {
    try { await updateBreak(brk.id, fields); onChange() }
    catch { toast('Could not update break', 'error') }
  }
  const saveIfChanged = () => {
    const f = {}
    if (comment !== (brk.comment || '')) f.comment = comment
    if (assignee !== (brk.assignee || '')) f.assignee = assignee
    if (Object.keys(f).length) patch(f)
  }

  return (
    <div className="flex items-start gap-3 px-5 py-3 border-t border-slate-100 hover:bg-slate-50/60">
      <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${meta.chip}`}>{meta.label}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 truncate" title={brk.key_label}>{brk.key_label || '—'}</p>
        <p className="text-2xs text-slate-400 mt-0.5 flex items-center gap-1">
          <Clock size={10} /> {brk.age_days === 0 ? 'today' : `${brk.age_days}d old`} · first seen {brk.first_seen}
        </p>
        <div className="flex gap-2 mt-1.5">
          <input value={comment} onChange={e => setComment(e.target.value)} onBlur={saveIfChanged}
            placeholder="Add a note…"
            className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <input value={assignee} onChange={e => setAssignee(e.target.value)} onBlur={saveIfChanged}
            placeholder="Assignee"
            className="w-28 border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>
      <div className="relative flex-shrink-0">
        <select value={brk.status} onChange={e => patch({ status: e.target.value })}
          className={`appearance-none text-2xs font-semibold rounded-full pl-2.5 pr-6 py-1 cursor-pointer focus:outline-none ${STATUS_META[brk.status]?.chip || 'bg-slate-100 text-slate-600'}`}>
          {Object.entries(STATUS_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
        </select>
      </div>
    </div>
  )
}

export default function Breaks({ selectedClient }) {
  const [breaks, setBreaks] = useState([])
  const [diff, setDiff] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!selectedClient) { setBreaks([]); setDiff(null); setLoading(false); return }
    setLoading(true)
    try {
      const [b, d] = await Promise.all([
        getBreaks(selectedClient.id),
        getBreakDiff(selectedClient.id).catch(() => null),
      ])
      setBreaks(b)
      setDiff(d)
    }
    catch { toast('Could not load breaks.', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [selectedClient?.id])

  // Group by condition (name + validation).
  const groups = {}
  for (const b of breaks) {
    const key = b.validation_name ? `${b.condition_name} — ${b.validation_name}` : b.condition_name
    ;(groups[key] ||= []).push(b)
  }
  const openCount = breaks.filter(b => b.status === 'open').length

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Breaks</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Unresolved reconciliation exceptions{selectedClient ? ` for ${selectedClient.name}` : ''} — they carry
            forward across runs and clear automatically once resolved in the data.
          </p>
        </div>
        <button onClick={refresh}
          className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors flex-shrink-0">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {!selectedClient ? (
        <Empty icon={Users} title="Select a client" body="Choose a client to see its open breaks." />
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : breaks.length === 0 ? (
        <Empty icon={Check} title="No open breaks" body="Every key matched and every check passed on the latest run." />
      ) : (
        <>
          {diff && diff.run_id && (diff.new.length > 0 || diff.cleared.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm shadow-card">
              <span className="text-2xs font-semibold uppercase tracking-wider text-slate-400">Since last run{diff.ran_at ? ` (${diff.ran_at})` : ''}</span>
              <span className="inline-flex items-center gap-1.5 text-red-600 font-medium">
                <Plus size={13} /> {diff.new.length} new
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
                <CheckCircle2 size={13} /> {diff.cleared.length} cleared
              </span>
              {diff.new.length > 0 && (
                <span className="text-xs text-slate-400 truncate">
                  new: {diff.new.slice(0, 5).map(b => b.key_label).join(', ')}{diff.new.length > 5 ? '…' : ''}
                </span>
              )}
            </div>
          )}
          <div className="text-sm text-slate-500">{breaks.length} open exception{breaks.length !== 1 ? 's' : ''} · {openCount} unactioned</div>
          {Object.entries(groups).map(([cond, items]) => (
            <div key={cond} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                <span className="text-sm font-semibold text-slate-700">{cond}</span>
                <span className="text-2xs text-slate-400">{items.length}</span>
              </div>
              {items.map(b => <BreakRow key={b.id} brk={b} onChange={refresh} />)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function Empty({ icon: Icon, title, body }) {
  return (
    <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Icon size={22} className="text-slate-300" /></div>
      <p className="font-semibold text-slate-900 mb-1">{title}</p>
      <p className="text-sm text-slate-500">{body}</p>
    </div>
  )
}
