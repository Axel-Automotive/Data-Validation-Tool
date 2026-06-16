import { useRef, useState } from 'react'
import {
  Zap, ChevronDown, LayoutDashboard, GitCompare,
  Layers, TrendingUp, Settings, Plus, Check, X,
  Upload, FileSpreadsheet, Users, CalendarClock,
} from 'lucide-react'
import { uploadFile } from '../../api/client'
import { createClient } from '../../api/clients'

const NAV = [
  { id: 'dashboard',  label: 'Dashboard',           Icon: LayoutDashboard },
  { id: 'sheet-diff', label: 'Sheet Difference',    Icon: GitCompare },
  { id: 'stacked',    label: 'Stacked Comparison',  Icon: Layers },
  { id: 'calc-diff',  label: 'Calc. Difference',    Icon: TrendingUp },
  { id: 'schedules',  label: 'Schedules',           Icon: CalendarClock },
]

// ── internal atoms ────────────────────────────────────────────────────────────

function SbLabel({ children }) {
  return (
    <p className="text-2xs font-semibold uppercase tracking-widest text-slate-400 px-3 mb-1.5 mt-5 first:mt-0">
      {children}
    </p>
  )
}

function FileSlot({ label, fileInfo, onUploaded }) {
  const ref = useRef()
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [err, setErr] = useState(null)

  const handle = async (file) => {
    if (!file) return
    setLoading(true); setErr(null)
    try { onUploaded(await uploadFile(file)) }
    catch { setErr('Upload failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="px-3">
      <div
        onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]) }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !loading && ref.current?.click()}
        className={[
          'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all',
          dragging ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100' :
          fileInfo  ? 'border-slate-200 bg-white hover:border-slate-300 shadow-card' :
                      'border-slate-200 border-dashed bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50',
          loading   ? 'opacity-60 pointer-events-none' : '',
        ].join(' ')}
      >
        <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden"
               onChange={e => handle(e.target.files[0])} />

        {loading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-xs text-slate-500">Uploading…</span>
          </>
        ) : fileInfo ? (
          <>
            <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet size={14} className="text-brand-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{fileInfo.name}</p>
              <p className="text-2xs text-slate-400">Click to replace</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Upload size={13} className="text-slate-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600">{label}</p>
              <p className="text-2xs text-slate-400">Click or drag .xlsx</p>
            </div>
          </>
        )}
      </div>
      {err && <p className="text-2xs text-red-500 mt-1 px-1">{err}</p>}
    </div>
  )
}

function SheetSelect({ label, sheets, value, onChange }) {
  return (
    <div className="px-3">
      <label className="block text-2xs font-medium text-slate-400 mb-1 truncate">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none bg-white border border-slate-200 text-slate-700 rounded-lg pl-3 pr-7 py-2 text-xs focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 cursor-pointer transition-colors"
        >
          {sheets.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    </div>
  )
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar({
  open,
  clients, selectedClient, onSelectClient, onClientsChange,
  fileAxel, fileDms, sheetAxel, sheetDms, datasetInfo,
  onAxelUploaded, onDmsUploaded, onSheetAxelChange, onSheetDmsChange,
  currentPage, onNavigate,
}) {
  const [newName,   setNewName]   = useState('')
  const [adding,    setAdding]    = useState(false)
  const [saving,    setSaving]    = useState(false)

  const submit = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const c = await createClient(newName.trim())
      await onClientsChange()
      onSelectClient(c)
      setNewName(''); setAdding(false)
    } finally { setSaving(false) }
  }

  return (
    <aside
      className="flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
      style={{ width: open ? 240 : 0 }}
    >
      <div className="h-full bg-white flex flex-col border-r border-slate-200" style={{ width: 240 }}>

        {/* ── Brand ── */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Zap size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 leading-none">AXEL Validator</p>
            <p className="text-2xs text-slate-400 mt-1">Data Reconciliation</p>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto main-scroll py-3 space-y-0.5">

          {/* Navigation */}
          <SbLabel>Navigation</SbLabel>
          {NAV.map(({ id, label, Icon }) => {
            const active = currentPage === id
            return (
              <div key={id} className="px-2">
                <button
                  onClick={() => onNavigate(id)}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left',
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
                  ].join(' ')}
                >
                  <Icon size={14} className={active ? 'text-brand-600' : 'text-slate-400'} />
                  {label}
                </button>
              </div>
            )
          })}

          <div className="mx-3 my-3 border-t border-slate-100" />

          {/* Client */}
          <SbLabel>Client</SbLabel>
          <div className="px-3">
            <div className="relative">
              <Users size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={selectedClient?.id || ''}
                onChange={e => {
                  const c = clients.find(c => c.id === e.target.value)
                  if (c) onSelectClient(c)
                }}
                className="w-full appearance-none bg-white border border-slate-200 text-slate-700 rounded-lg pl-8 pr-7 py-2 text-xs focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 cursor-pointer transition-colors"
              >
                {clients.length === 0
                  ? <option value="">No clients</option>
                  : clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                }
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {adding ? (
              <div className="flex gap-1.5 mt-2">
                <input
                  autoFocus value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setAdding(false) }}
                  placeholder="Client name…"
                  className="flex-1 bg-white border border-brand-400 ring-2 ring-brand-100 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none placeholder:text-slate-400"
                />
                <button onClick={submit} disabled={saving}
                  className="w-7 h-7 bg-brand-600 hover:bg-brand-700 rounded-lg flex items-center justify-center transition-colors">
                  {saving
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Check size={12} className="text-white" />}
                </button>
                <button onClick={() => setAdding(false)}
                  className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center transition-colors">
                  <X size={12} className="text-slate-500" />
                </button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 mt-2 text-2xs font-medium text-slate-400 hover:text-brand-600 transition-colors">
                <Plus size={11} />
                Add client
              </button>
            )}
          </div>

          <div className="mx-3 my-3 border-t border-slate-100" />

          {/* Source files */}
          <SbLabel>Source Files</SbLabel>
          <div className="space-y-2">
            <FileSlot label="AXEL File" fileInfo={fileAxel} onUploaded={onAxelUploaded} />
            <FileSlot label="DMS File"  fileInfo={fileDms}  onUploaded={onDmsUploaded} />
          </div>

          {/* Sheet selection */}
          {fileAxel && fileDms && (
            <>
              <div className="mx-3 my-3 border-t border-slate-100" />
              <SbLabel>Sheet Selection</SbLabel>
              <div className="space-y-2">
                <SheetSelect
                  label={fileAxel.name}
                  sheets={fileAxel.sheets}
                  value={sheetAxel}
                  onChange={onSheetAxelChange}
                />
                <SheetSelect
                  label={fileDms.name}
                  sheets={fileDms.sheets}
                  value={sheetDms}
                  onChange={onSheetDmsChange}
                />
              </div>
            </>
          )}

          {/* Dataset info */}
          {datasetInfo.axel && datasetInfo.dms && (
            <>
              <div className="mx-3 my-3 border-t border-slate-100" />
              <SbLabel>Dataset Summary</SbLabel>
              <div className="px-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {[
                    { label: 'AXEL', info: datasetInfo.axel, dot: 'bg-brand-500' },
                    { label: 'DMS',  info: datasetInfo.dms,  dot: 'bg-cyan-500' },
                  ].map(({ label, info, dot }) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                        <span className="text-xs font-semibold text-slate-600">{label}</span>
                      </div>
                      <span className="text-2xs text-slate-400 tabular-nums">
                        {info.rows.toLocaleString()} × {info.cols}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Bottom nav ── */}
        <div className="flex-shrink-0 border-t border-slate-100 p-2">
          <button
            onClick={() => onNavigate('settings')}
            className={[
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
              currentPage === 'settings'
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
            ].join(' ')}
          >
            <Settings size={14} className={currentPage === 'settings' ? 'text-brand-600' : 'text-slate-400'} />
            Settings
          </button>
        </div>
      </div>
    </aside>
  )
}
