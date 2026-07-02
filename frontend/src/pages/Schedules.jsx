import { useState, useEffect, useRef } from 'react'
import {
  Clock, Plus, Trash2, Edit2, Play, X, Save, CalendarClock,
  CheckCircle2, AlertTriangle, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, runScheduleNow, listFiles } from '../api/schedules'
import { getAxelQueries } from '../api/axelSources'
import { toast } from '../lib/toast'

const PARAM_INPUT_TYPE = { int: 'number', float: 'number', date: 'date', text: 'text' }

const DAYS = [
  { id: 'mon', label: 'Mon' }, { id: 'tue', label: 'Tue' }, { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' }, { id: 'fri', label: 'Fri' }, { id: 'sat', label: 'Sat' }, { id: 'sun', label: 'Sun' },
]
const DAY_ORDER = DAYS.map(d => d.id)

const pad = n => String(n).padStart(2, '0')
const fmtTime = (h, m) => `${pad(h)}:${pad(m)}`
const fmtDays = days => {
  const set = new Set(days)
  if (DAY_ORDER.every(d => set.has(d))) return 'Every day'
  if (['mon','tue','wed','thu','fri'].every(d => set.has(d)) && set.size === 5) return 'Weekdays'
  return DAYS.filter(d => set.has(d.id)).map(d => d.label).join(', ')
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{label}</label>
      {hint && <p className="text-2xs text-slate-400 mb-1.5 -mt-1">{hint}</p>}
      {children}
    </div>
  )
}

const selectCls = "w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent cursor-pointer transition-colors"
const inputCls  = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors"

function ScheduleForm({ initial, clients, files, onSave, onCancel }) {
  const [name,     setName]     = useState(initial?.name || '')
  const [clientId, setClientId] = useState(initial?.client_id || clients[0]?.id || '')
  const [axelId,   setAxelId]   = useState(initial?.file_axel_id || '')
  const [dmsId,    setDmsId]    = useState(initial?.file_dms_id || '')
  const [sheetAxel, setSheetAxel] = useState(initial?.sheet_axel || '')
  const [sheetDms,  setSheetDms]  = useState(initial?.sheet_dms || '')
  const [time,     setTime]     = useState(fmtTime(initial?.hour ?? 8, initial?.minute ?? 0))
  const [days,     setDays]     = useState(initial?.days || ['mon','tue','wed','thu','fri'])
  const [recips,   setRecips]   = useState((initial?.recipients || []).join(', '))
  const [enabled,  setEnabled]  = useState(initial?.enabled ?? true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  // AXEL side can be a saved DB query instead of a pinned file.
  const [axelMode,    setAxelMode]    = useState(initial?.axel_source?.kind === 'query' ? 'query' : 'file')
  const [queries,     setQueries]     = useState([])
  const [queryId,     setQueryId]     = useState(initial?.axel_source?.query_id || '')
  const [queryParams, setQueryParams] = useState(initial?.axel_source?.params || {})

  // Load the selected client's queries. On a client CHANGE (not the initial
  // mount) clear the query selection — a query id belongs to one client, so
  // keeping it would silently submit another client's query id.
  const firstQueryLoad = useRef(true)
  useEffect(() => {
    if (!firstQueryLoad.current) { setQueryId(''); setQueryParams({}) }
    firstQueryLoad.current = false
    if (!clientId) { setQueries([]); return }
    let cancelled = false
    getAxelQueries(clientId)
      .then(q => { if (!cancelled) setQueries(Array.isArray(q) ? q : []) })
      .catch(() => { if (!cancelled) setQueries([]) })
    return () => { cancelled = true }
  }, [clientId])

  const axelFile = files.find(f => f.id === axelId)
  const dmsFile  = files.find(f => f.id === dmsId)
  const selectedQuery = queries.find(q => q.id === queryId)
  const toggleDay = d => setDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])

  const submit = async () => {
    if (!name.trim())      { setError('Give the schedule a name.'); return }
    if (!clientId)         { setError('Select a client.'); return }
    if (axelMode === 'query') {
      if (!queryId) { setError('Select an AXEL data-source query.'); return }
    } else if (!axelId || !sheetAxel) { setError('Select the AXEL file and sheet.'); return }
    if (!dmsId || !sheetDms) { setError('Select the DMS file and sheet.'); return }
    if (days.length === 0) { setError('Pick at least one day.'); return }
    const [h, m] = time.split(':').map(Number)
    const recipients = recips.split(',').map(s => s.trim()).filter(Boolean)
    const axelPart = axelMode === 'query'
      ? { axel_source: { kind: 'query', query_id: queryId, params: queryParams } }
      : { file_axel_id: axelId, sheet_axel: sheetAxel }
    setSaving(true); setError('')
    try {
      await onSave({
        name: name.trim(), client_id: clientId,
        file_dms_id: dmsId, sheet_dms: sheetDms, ...axelPart,
        hour: h, minute: m, days: DAY_ORDER.filter(d => days.includes(d)),
        recipients, enabled,
      })
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save schedule.')
    } finally { setSaving(false) }
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-panel overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
        <div>
          <h4 className="text-sm font-bold text-slate-900">{initial ? 'Edit Schedule' : 'New Schedule'}</h4>
          <p className="text-2xs text-slate-500 mt-0.5">Runs all conditions for the client and emails the report</p>
        </div>
        <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Schedule Name"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Daily Fredbeans" className={inputCls} /></Field>
          <Field label="Client">
            <select value={clientId} onChange={e => setClientId(e.target.value)} className={selectCls}>
              {clients.length === 0 ? <option value="">No clients</option> : clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>

        {/* AXEL source — a saved DB query (live pull) or a pinned uploaded file */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500">AXEL Source</label>
            <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              <button type="button" onClick={() => setAxelMode('file')}
                className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors ${axelMode === 'file' ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}>Uploaded file</button>
              <button type="button" onClick={() => setAxelMode('query')}
                className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors ${axelMode === 'query' ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}>Data source (SQL)</button>
            </div>
          </div>

          {axelMode === 'query' ? (
            queries.length === 0 ? (
              <p className="text-xs text-slate-400">No saved queries for this client. Add one in <span className="font-medium text-slate-500">Settings → AXEL Data Source</span>.</p>
            ) : (
              <div className="space-y-3">
                <select value={queryId}
                  onChange={e => {
                    const q = queries.find(x => x.id === e.target.value)
                    const seed = {}; (q?.params || []).forEach(p => { seed[p.name] = queryParams[p.name] ?? (p.default ?? '') })
                    setQueryId(e.target.value); setQueryParams(seed)
                  }}
                  className={selectCls}>
                  <option value="">— select query —</option>
                  {queries.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
                {(selectedQuery?.params || []).length > 0 && (
                  <div className="flex flex-wrap gap-2.5">
                    {selectedQuery.params.map(p => (
                      <div key={p.name}>
                        <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{p.label || p.name}{p.required ? ' *' : ''}</label>
                        <input type={PARAM_INPUT_TYPE[p.type] || 'text'} value={queryParams[p.name] ?? ''}
                          onChange={e => setQueryParams(pp => ({ ...pp, [p.name]: e.target.value }))}
                          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      </div>
                    ))}
                    <p className="w-full text-2xs text-slate-400">Parameter values are fixed for this schedule and used on every automatic run.</p>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="AXEL File">
                <select value={axelId} onChange={e => { setAxelId(e.target.value); setSheetAxel('') }} className={selectCls}>
                  <option value="">— select file —</option>
                  {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
              <Field label="AXEL Sheet">
                <select value={sheetAxel} onChange={e => setSheetAxel(e.target.value)} className={selectCls} disabled={!axelFile}>
                  <option value="">— select sheet —</option>
                  {axelFile?.sheets.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>

        {/* DMS is always an uploaded file */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="DMS File">
            <select value={dmsId} onChange={e => { setDmsId(e.target.value); setSheetDms('') }} className={selectCls}>
              <option value="">— select file —</option>
              {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="DMS Sheet">
            <select value={sheetDms} onChange={e => setSheetDms(e.target.value)} className={selectCls} disabled={!dmsFile}>
              <option value="">— select sheet —</option>
              {dmsFile?.sheets.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        {files.length === 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">No files uploaded yet. The DMS side needs an uploaded file — upload one in the sidebar first (it's saved and becomes selectable here).</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Run At" hint="Server local time">
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Recipients" hint="Comma-separated. Leave blank to use the client's saved list.">
            <input value={recips} onChange={e => setRecips(e.target.value)} placeholder="ops@dealer.com, mgr@dealer.com" className={inputCls} />
          </Field>
        </div>

        <Field label="Days">
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(d => {
              const on = days.includes(d.id)
              return (
                <button key={d.id} onClick={() => toggleDay(d.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {d.label}
                </button>
              )
            })}
          </div>
        </Field>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-brand-600 cursor-pointer" />
          <span className="text-sm font-medium text-slate-900">Enabled</span>
          <span className="text-2xs text-slate-400">Disabled schedules don't run automatically</span>
        </label>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex items-center gap-2.5 pt-1 border-t border-slate-100">
          <button onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
            {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</> : <><Save size={14} /> Save Schedule</>}
          </button>
          <button onClick={onCancel} className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function Schedules({ clients }) {
  const [schedules, setSchedules] = useState([])
  const [files,     setFiles]     = useState([])
  const [editing,   setEditing]   = useState(null)   // 'new' | schedule object | null
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState({})      // id -> bool (run-now)
  const [confirmDel, setConfirmDel] = useState(null)

  const clientName = id => clients.find(c => c.id === id)?.name || 'Unknown client'

  const refresh = async () => {
    try {
      const [s, f] = await Promise.all([getSchedules(), listFiles()])
      setSchedules(Array.isArray(s) ? s : [])
      setFiles(Array.isArray(f) ? f : [])
    } catch { toast('Could not load schedules.', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  const handleSave = async (body) => {
    if (editing && editing !== 'new') await updateSchedule(editing.id, body)
    else await createSchedule(body)
    await refresh()
    setEditing(null)
    toast('Schedule saved', 'success')
  }

  const handleDelete = async (id) => {
    try { await deleteSchedule(id); await refresh(); setConfirmDel(null); toast('Schedule deleted', 'success') }
    catch { toast('Failed to delete schedule', 'error') }
  }

  const handleToggle = async (s) => {
    try {
      await updateSchedule(s.id, { ...s, enabled: !s.enabled })
      await refresh()
    } catch (e) { toast(e.response?.data?.detail || 'Failed to update schedule', 'error') }
  }

  const handleRunNow = async (s) => {
    setBusy(p => ({ ...p, [s.id]: true }))
    try {
      const res = await runScheduleNow(s.id)
      toast(res.ok ? `"${s.name}": ${res.status}` : `"${s.name}": ${res.status}`, res.ok ? 'success' : 'error')
      await refresh()
    } catch (e) { toast(e.response?.data?.detail || 'Run failed', 'error') }
    finally { setBusy(p => ({ ...p, [s.id]: false })) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Schedules</h1>
          <p className="text-sm text-slate-500 mt-0.5">Automatically run validations and email reports on a recurring basis.</p>
        </div>
        {!editing && (
          <button onClick={() => setEditing('new')} disabled={clients.length === 0}
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-40 flex-shrink-0">
            <Plus size={13} /> New Schedule
          </button>
        )}
      </div>

      {editing && (
        <ScheduleForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          clients={clients} files={files}
          onSave={handleSave} onCancel={() => setEditing(null)} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : schedules.length === 0 && !editing ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><CalendarClock size={22} className="text-slate-300" /></div>
          <p className="font-semibold text-slate-900 mb-1">No schedules yet</p>
          <p className="text-sm text-slate-500">Create a schedule to run validations automatically and email the report.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(s => {
            const isBusy = busy[s.id]
            const ok = s.last_status?.startsWith('OK') || s.last_status?.startsWith('Ran')
            return (
              <div key={s.id} className={`border border-slate-200 rounded-xl bg-white overflow-hidden ${!s.enabled ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-4 px-5 py-4">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock size={16} className="text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{s.name}</span>
                      {s.axel_source?.kind === 'query' && <span className="text-2xs font-medium text-sky-700 bg-sky-50 ring-1 ring-sky-200/60 px-1.5 py-0.5 rounded-full">DB query</span>}
                      {!s.enabled && <span className="text-2xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Paused</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {clientName(s.client_id)} · {fmtTime(s.hour, s.minute)} · {fmtDays(s.days)}
                    </p>
                    <p className="text-2xs text-slate-400 mt-1">
                      {(s.recipients?.length ? s.recipients.join(', ') : 'Uses client recipients')}
                    </p>
                    {s.last_run && (
                      <p className={`text-2xs mt-1.5 flex items-center gap-1 ${ok ? 'text-emerald-600' : 'text-red-500'}`}>
                        {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                        Last run {s.last_run} — {s.last_status}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleRunNow(s)} disabled={isBusy} title="Run now"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      {isBusy ? <div className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /> : <Play size={11} />} Run
                    </button>
                    <button onClick={() => handleToggle(s)} title={s.enabled ? 'Pause' : 'Enable'}
                      className={`transition-colors ${s.enabled ? 'text-brand-600 hover:text-brand-700' : 'text-slate-300 hover:text-slate-500'}`}>
                      {s.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    <button onClick={() => setEditing(s)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><Edit2 size={13} /></button>
                    <button onClick={() => setConfirmDel(confirmDel === s.id ? null : s.id)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${confirmDel === s.id ? 'bg-red-50 text-red-500' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}><Trash2 size={13} /></button>
                  </div>
                </div>
                {confirmDel === s.id && (
                  <div className="flex items-center gap-3 px-5 pb-4 pt-0">
                    <p className="text-xs text-slate-500 flex-1">Delete this schedule permanently?</p>
                    <button onClick={() => handleDelete(s.id)} className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded-md transition-colors">Delete</button>
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
