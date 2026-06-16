import { useState } from 'react'
import { Plus, Trash2, Edit2, Check, X, ToggleLeft, ToggleRight, Users, GitCompare, Layers, TrendingUp, SlidersHorizontal, Mail } from 'lucide-react'
import { createClient, updateClient, deleteClient, createCondition, updateCondition, deleteCondition, updateEmailSettings } from '../api/clients'
import useFileSelection from '../hooks/useFileSelection'
import FileSelectionBar from '../components/common/FileSelectionBar'
import ConditionEditor from '../components/settings/ConditionEditor'
import RecipientsEditor from '../components/settings/RecipientsEditor'
import { toast } from '../lib/toast'

const TYPE_META = {
  sheet_diff: { label: 'Sheet Difference',   Icon: GitCompare,  chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60' },
  stacked:    { label: 'Stacked Comparison', Icon: Layers,      chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/60' },
  calc_diff:  { label: 'Calc. Difference',   Icon: TrendingUp,  chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' },
  custom_rule:{ label: 'Custom Rule',        Icon: SlidersHorizontal, chip: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/60' },
}

function ConditionSummary({ cond }) {
  const cfg = cond.config || {}
  if (cond.type === 'sheet_diff') {
    const pairs = cfg.col_pairs || []
    return <p className="text-xs text-slate-400 mt-0.5 truncate">{pairs.length} column pair{pairs.length !== 1 ? 's' : ''}{pairs[0] ? `: ${pairs[0].axel} → ${pairs[0].dms}${pairs.length > 1 ? '…' : ''}` : ''}</p>
  }
  if (cond.type === 'stacked')   return <p className="text-xs text-slate-400 mt-0.5">Key: {cfg.control_axel || '—'}{cfg.control_dms && cfg.control_dms !== cfg.control_axel ? ` / ${cfg.control_dms}` : ''}</p>
  if (cond.type === 'calc_diff') return <p className="text-xs text-slate-400 mt-0.5">Key: {cfg.key_axel || '—'} · Values: {cfg.val_axel || '—'} vs {cfg.val_dms || '—'}</p>
  if (cond.type === 'custom_rule') {
    const checks = cfg.checks || []
    return <p className="text-xs text-slate-400 mt-0.5">Key: {cfg.key_axel || '—'} · {checks.length} check{checks.length !== 1 ? 's' : ''}</p>
  }
  return null
}

export default function Settings({ clients, selectedClient, onSelectClient, onClientsChange }) {
  const fs = useFileSelection()
  const { columnsAxel, columnsDms } = fs
  const [editingClient,    setEditingClient]    = useState(null)
  const [editClientName,   setEditClientName]   = useState('')
  const [newClientName,    setNewClientName]    = useState('')
  const [addingClient,     setAddingClient]     = useState(false)
  const [editingCondition, setEditingCondition] = useState(null)
  const [confirmDelete,    setConfirmDelete]    = useState(null)  // cond id waiting for confirm
  const [confirmClient,    setConfirmClient]    = useState(null)  // client id waiting for confirm
  const [saving,           setSaving]           = useState(false)

  const conditions = selectedClient?.conditions || []

  const handleAddClient = async () => {
    if (!newClientName.trim()) return
    setSaving(true)
    try {
      const c = await createClient(newClientName.trim())
      await onClientsChange()
      onSelectClient(c)
      setNewClientName(''); setAddingClient(false)
      toast(`Client "${c.name}" created`, 'success')
    } catch { toast('Failed to create client', 'error') }
    finally { setSaving(false) }
  }

  const handleUpdateClient = async (id) => {
    if (!editClientName.trim()) return
    setSaving(true)
    try {
      await updateClient(id, editClientName.trim())
      await onClientsChange()
      setEditingClient(null)
      toast('Client renamed', 'success')
    } catch { toast('Failed to rename client', 'error') }
    finally { setSaving(false) }
  }

  const handleDeleteClient = async (id) => {
    try {
      await deleteClient(id)
      await onClientsChange()
      onSelectClient(clients.find(c => c.id !== id) || null)
      setConfirmClient(null)
      toast('Client deleted', 'success')
    } catch { toast('Failed to delete client', 'error') }
  }

  const handleSaveEmail = async ({ recipients, subject }) => {
    if (!selectedClient) return
    try {
      await updateEmailSettings(selectedClient.id, recipients, subject)
      await onClientsChange()
      toast('Email settings saved', 'success')
    } catch (e) { toast(e.response?.data?.detail || 'Failed to save email settings', 'error') }
  }

  const handleSaveCondition = async (body) => {
    if (!selectedClient) return
    setSaving(true)
    try {
      if (editingCondition && editingCondition !== 'new') {
        await updateCondition(selectedClient.id, editingCondition.id, body)
        toast('Condition updated', 'success')
      } else {
        await createCondition(selectedClient.id, body)
        toast('Condition created', 'success')
      }
      await onClientsChange()
      setEditingCondition(null)
    } catch { toast('Failed to save condition', 'error') }
    finally { setSaving(false) }
  }

  const handleToggle = async (cond) => {
    if (!selectedClient) return
    try {
      await updateCondition(selectedClient.id, cond.id, { ...cond, enabled: !cond.enabled })
      await onClientsChange()
    } catch { toast('Failed to update condition', 'error') }
  }

  const handleDeleteCondition = async (condId) => {
    try {
      await deleteCondition(selectedClient.id, condId)
      await onClientsChange()
      setConfirmDelete(null)
      toast('Condition deleted', 'success')
    } catch { toast('Failed to delete condition', 'error') }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Client list panel ── */}
      <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Clients</h2>
          <p className="text-2xs text-slate-500 mt-0.5">{clients.length} configured</p>
        </div>
        <div className="flex-1 overflow-y-auto main-scroll py-2">
          {clients.map(c => (
            editingClient === c.id ? (
              <div key={c.id} className="px-3 py-2 flex gap-1.5">
                <input autoFocus value={editClientName} onChange={e => setEditClientName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleUpdateClient(c.id); if (e.key === 'Escape') setEditingClient(null) }}
                  className="flex-1 border border-brand-500 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none" />
                <button onClick={() => handleUpdateClient(c.id)}
                  className="w-7 h-7 bg-brand-600 text-white rounded-lg flex items-center justify-center hover:bg-brand-700 transition-colors"><Check size={11} /></button>
                <button onClick={() => setEditingClient(null)}
                  className="w-7 h-7 bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center hover:bg-slate-300 transition-colors"><X size={11} /></button>
              </div>
            ) : confirmClient === c.id ? (
              <div key={c.id} className="px-4 py-2.5 bg-red-50 border-l-2 border-red-400">
                <p className="text-xs font-medium text-red-700 mb-1.5">Delete "{c.name}"?</p>
                <div className="flex gap-1.5">
                  <button onClick={() => handleDeleteClient(c.id)}
                    className="flex-1 text-2xs font-semibold bg-red-600 text-white px-2 py-1 rounded-md hover:bg-red-700 transition-colors">Delete</button>
                  <button onClick={() => setConfirmClient(null)}
                    className="flex-1 text-2xs font-semibold bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-md hover:bg-slate-50 transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div key={c.id} onClick={() => onSelectClient(c)}
                className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${selectedClient?.id === c.id ? 'bg-white border-r-2 border-brand-600' : 'hover:bg-slate-100'}`}>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${selectedClient?.id === c.id ? 'text-slate-900' : 'text-slate-700'}`}>{c.name}</p>
                  <p className="text-2xs text-slate-400">{c.conditions?.length || 0} conditions</p>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                  <button onClick={e => { e.stopPropagation(); setEditingClient(c.id); setEditClientName(c.name) }}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"><Edit2 size={11} /></button>
                  <button onClick={e => { e.stopPropagation(); setConfirmClient(c.id) }}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={11} /></button>
                </div>
              </div>
            )
          ))}

          {addingClient ? (
            <div className="px-3 py-2 flex gap-1.5">
              <input autoFocus value={newClientName} onChange={e => setNewClientName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddClient(); if (e.key === 'Escape') setAddingClient(false) }}
                placeholder="Client name…"
                className="flex-1 border border-brand-500 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none" />
              <button onClick={handleAddClient} disabled={saving}
                className="w-7 h-7 bg-brand-600 text-white rounded-lg flex items-center justify-center hover:bg-brand-700 transition-colors">
                {saving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={11} />}
              </button>
              <button onClick={() => setAddingClient(false)}
                className="w-7 h-7 bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center hover:bg-slate-300 transition-colors"><X size={11} /></button>
            </div>
          ) : (
            <button onClick={() => setAddingClient(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <Plus size={13} /> New Client
            </button>
          )}
        </div>
      </div>

      {/* ── Conditions panel ── */}
      <div className="flex-1 overflow-y-auto main-scroll bg-white">
        {!selectedClient ? (
          <div className="flex items-center justify-center h-full text-center p-12">
            <div>
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Users size={22} className="text-slate-300" /></div>
              <p className="font-semibold text-slate-900 mb-1">Select a client</p>
              <p className="text-sm text-slate-500">Choose a client from the left panel to manage its conditions.</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-w-3xl">
            {/* Panel header */}
            <div className="flex items-center justify-between pb-5 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedClient.name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {conditions.length} condition{conditions.length !== 1 ? 's' : ''}
                  {columnsAxel.length > 0 ? ` · ${columnsAxel.length} AXEL / ${columnsDms.length} DMS columns loaded` : ' · upload files for column suggestions'}
                </p>
              </div>
              <button onClick={() => setEditingCondition('new')}
                className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors">
                <Plus size={13} /> Add Condition
              </button>
            </div>

            {/* Report email settings */}
            <RecipientsEditor
              key={selectedClient.id}
              recipients={selectedClient.recipients || []}
              subject={selectedClient.email_subject || ''}
              clientName={selectedClient.name}
              onSave={handleSaveEmail} />

            {/* Source files — upload to get column suggestions for conditions */}
            <FileSelectionBar fs={fs} />

            {/* Inline editor */}
            {editingCondition && (
              <ConditionEditor
                key={editingCondition === 'new' ? 'new' : editingCondition.id}
                initial={editingCondition === 'new' ? null : editingCondition}
                columnsAxel={columnsAxel} columnsDms={columnsDms}
                saving={saving} onSave={handleSaveCondition}
                onCancel={() => setEditingCondition(null)} />
            )}

            {/* Empty state */}
            {conditions.length === 0 && !editingCondition && (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><GitCompare size={20} className="text-slate-300" /></div>
                <p className="font-semibold text-slate-900 mb-1">No conditions yet</p>
                <p className="text-sm text-slate-500">Click "Add Condition" to define validation rules.</p>
              </div>
            )}

            {/* Condition list */}
            {conditions.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {conditions.map((cond, i) => {
                  const meta = TYPE_META[cond.type] || {}
                  const Icon = meta.Icon || GitCompare
                  const isConfirming = confirmDelete === cond.id
                  return (
                    <div key={cond.id}
                      className={`${i > 0 ? 'border-t border-slate-100' : ''} ${!cond.enabled ? 'opacity-50' : ''}`}>
                      <div className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon size={14} className="text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900">{cond.name}</span>
                            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${meta.chip || 'bg-slate-100 text-slate-600'}`}>{meta.label || cond.type}</span>
                            {!cond.enabled && <span className="text-2xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Disabled</span>}
                          </div>
                          <ConditionSummary cond={cond} />
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => handleToggle(cond)} title={cond.enabled ? 'Disable' : 'Enable'}
                            className={`transition-colors ${cond.enabled ? 'text-brand-600 hover:text-brand-700' : 'text-slate-300 hover:text-slate-500'}`}>
                            {cond.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                          </button>
                          <button onClick={() => setEditingCondition(cond)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => setConfirmDelete(confirmDelete === cond.id ? null : cond.id)}
                            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isConfirming ? 'bg-red-50 text-red-500' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {isConfirming && (
                        <div className="flex items-center gap-3 px-5 pb-4 pt-0">
                          <p className="text-xs text-slate-500 flex-1">Delete this condition permanently?</p>
                          <button onClick={() => handleDeleteCondition(cond.id)}
                            className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded-md transition-colors">Delete</button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="text-xs font-medium text-slate-600 hover:text-slate-800">Cancel</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
