import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, ToggleLeft, ToggleRight, GitCompare, Layers, TrendingUp, SlidersHorizontal, Library } from 'lucide-react'
import { getShared, createShared, updateShared, deleteShared } from '../api/shared'
import useFileSelection from '../hooks/useFileSelection'
import FileSelectionBar from '../components/common/FileSelectionBar'
import ConditionEditor from '../components/settings/ConditionEditor'
import { toast } from '../lib/toast'

const TYPE_META = {
  sheet_diff:  { label: 'Sheet Difference',   Icon: GitCompare,        chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60' },
  stacked:     { label: 'Stacked Comparison', Icon: Layers,            chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/60' },
  calc_diff:   { label: 'Calc. Difference',   Icon: TrendingUp,        chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' },
  custom_rule: { label: 'Custom Rule',        Icon: SlidersHorizontal, chip: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/60' },
}

function summaryText(cond) {
  const cfg = cond.config || {}
  if (cond.type === 'sheet_diff')  return `${(cfg.col_pairs || []).length} column pair(s)`
  if (cond.type === 'stacked')     return `Key: ${cfg.control_axel || '—'}`
  if (cond.type === 'calc_diff')   return `Key: ${cfg.key_axel || '—'} · ${cfg.val_axel || '—'} vs ${cfg.val_dms || '—'}`
  if (cond.type === 'custom_rule') return `Key: ${cfg.key_axel || '—'} · ${(cfg.checks || []).length} check(s)`
  return ''
}

export default function Conditions() {
  const fs = useFileSelection()
  const { columnsAxel, columnsDms } = fs
  const [conditions, setConditions] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [editing,    setEditing]    = useState(null)   // {_new,type} | condition | null
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const refresh = async () => {
    try { setConditions(await getShared()) }
    catch { toast('Could not load shared conditions.', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const handleSave = async (body) => {
    setSaving(true)
    try {
      if (editing?.id) { await updateShared(editing.id, body); toast('Shared condition updated', 'success') }
      else { await createShared(body); toast('Shared condition created', 'success') }
      await refresh()
      setEditing(null)
    } catch (e) { toast(e.response?.data?.detail || 'Failed to save', 'error') }
    finally { setSaving(false) }
  }

  const handleToggle = async (cond) => {
    try { await updateShared(cond.id, { ...cond, enabled: !cond.enabled }); await refresh() }
    catch { toast('Failed to update', 'error') }
  }

  const handleDelete = async (id) => {
    try { await deleteShared(id); await refresh(); setConfirmDel(null); toast('Shared condition deleted', 'success') }
    catch { toast('Failed to delete', 'error') }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Shared Conditions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          These run for <span className="font-medium text-slate-600">every client</span>, in addition to each client's own conditions.
          {columnsAxel.length > 0 ? ` · ${columnsAxel.length} AXEL / ${columnsDms.length} DMS columns loaded` : ' · upload files below for column suggestions'}
        </p>
      </div>

      {/* Source files — for column suggestions */}
      <FileSelectionBar fs={fs} />

      {/* Add buttons — one per type */}
      {!editing && (
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Add a shared condition</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TYPE_META).map(([id, m]) => {
              const Icon = m.Icon
              return (
                <button key={id} onClick={() => setEditing({ _new: true, type: id })}
                  className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors">
                  <Plus size={12} /> <Icon size={14} /> {m.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <ConditionEditor
          key={editing.id || `new-${editing.type}`}
          initial={editing.id ? editing : null}
          presetType={editing._new ? editing.type : undefined}
          lockType={!!editing._new}
          columnsAxel={columnsAxel} columnsDms={columnsDms}
          saving={saving} onSave={handleSave}
          onCancel={() => setEditing(null)} />
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Loading…</div>
      ) : conditions.length === 0 && !editing ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Library size={22} className="text-slate-300" /></div>
          <p className="font-semibold text-slate-900 mb-1">No shared conditions yet</p>
          <p className="text-sm text-slate-500">Add one above — it will apply to all clients automatically.</p>
        </div>
      ) : conditions.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {conditions.map((cond, i) => {
            const meta = TYPE_META[cond.type] || {}
            const Icon = meta.Icon || GitCompare
            const isConfirming = confirmDel === cond.id
            return (
              <div key={cond.id} className={`${i > 0 ? 'border-t border-slate-100' : ''} ${!cond.enabled ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon size={14} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{cond.name}</span>
                      {cond.validation_name && <span className="text-2xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{cond.validation_name}</span>}
                      <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${meta.chip || 'bg-slate-100 text-slate-600'}`}>{meta.label || cond.type}</span>
                      {!cond.enabled && <span className="text-2xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Disabled</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{summaryText(cond)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleToggle(cond)} title={cond.enabled ? 'Disable' : 'Enable'}
                      className={`transition-colors ${cond.enabled ? 'text-brand-600 hover:text-brand-700' : 'text-slate-300 hover:text-slate-500'}`}>
                      {cond.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    <button onClick={() => setEditing(cond)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><Edit2 size={13} /></button>
                    <button onClick={() => setConfirmDel(isConfirming ? null : cond.id)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isConfirming ? 'bg-red-50 text-red-500' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}><Trash2 size={13} /></button>
                  </div>
                </div>
                {isConfirming && (
                  <div className="flex items-center gap-3 px-5 pb-4 pt-0">
                    <p className="text-xs text-slate-500 flex-1">Delete this shared condition? It will stop running for all clients.</p>
                    <button onClick={() => handleDelete(cond.id)} className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded-md transition-colors">Delete</button>
                    <button onClick={() => setConfirmDel(null)} className="text-xs font-medium text-slate-600 hover:text-slate-800">Cancel</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
