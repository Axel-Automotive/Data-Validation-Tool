import { useState } from 'react'
import {
  ChevronDown, LayoutDashboard, GitCompare,
  Layers, TrendingUp, Settings, Plus, Check, X,
  Users, CalendarClock, History, Library, AlertTriangle,
} from 'lucide-react'
import { createClient } from '../../api/clients'
import { toast } from '../../lib/toast'
import logoAxelOne from '../../assets/logo-axelone.png'

const NAV = [
  { id: 'dashboard',  label: 'Dashboard',           Icon: LayoutDashboard },
  { id: 'sheet-diff', label: 'Sheet Difference',    Icon: GitCompare },
  { id: 'stacked',    label: 'Stacked Comparison',  Icon: Layers },
  { id: 'calc-diff',  label: 'Calc. Difference',    Icon: TrendingUp },
  { id: 'conditions', label: 'Conditions',          Icon: Library },
  { id: 'schedules',  label: 'Schedules',           Icon: CalendarClock },
  { id: 'runs',       label: 'Run History',         Icon: History },
  { id: 'breaks',     label: 'Breaks',              Icon: AlertTriangle },
]

const WIDTH = 256

function SbLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 px-3 mb-2 mt-6 first:mt-0">
      {children}
    </p>
  )
}

export default function Sidebar({
  open, clients, selectedClient, onSelectClient, onClientsChange,
  currentPage, onNavigate,
}) {
  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)
  const [saving,  setSaving]  = useState(false)

  const submit = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const c = await createClient(newName.trim())
      await onClientsChange()
      onSelectClient(c)
      setNewName(''); setAdding(false)
    } catch { toast('Failed to create client', 'error') }
    finally { setSaving(false) }
  }

  return (
    <aside
      className="flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
      style={{ width: open ? WIDTH : 0 }}
    >
      <div className="h-full bg-white flex flex-col border-r border-slate-200" style={{ width: WIDTH }}>

        {/* ── Brand ── */}
        <div className="flex items-center gap-2.5 pl-4 pr-2 h-14 border-b border-slate-100 flex-shrink-0">
          <img src={logoAxelOne} alt="AXEL ONE" className="w-auto flex-shrink-0" style={{ height: '0.7rem' }} />
          <span className="text-sm font-semibold tracking-wide text-slate-500 whitespace-nowrap">
            Validator
          </span>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto main-scroll py-3">
          <SbLabel>Navigation</SbLabel>
          <div className="px-2 space-y-1">
            {NAV.map(({ id, label, Icon }) => {
              const active = currentPage === id
              return (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  className={[
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                    active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
                  ].join(' ')}
                >
                  <Icon size={17} className={active ? 'text-brand-600' : 'text-slate-400'} />
                  {label}
                </button>
              )
            })}
          </div>

          <div className="mx-3 my-5 border-t border-slate-100" />

          <SbLabel>Client</SbLabel>
          <div className="px-3">
            <div className="relative">
              <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={selectedClient?.id || ''}
                onChange={e => {
                  const c = clients.find(c => c.id === e.target.value)
                  if (c) onSelectClient(c)
                }}
                className="w-full appearance-none bg-white border border-slate-200 text-slate-700 rounded-lg pl-9 pr-7 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 cursor-pointer transition-colors"
              >
                {clients.length === 0
                  ? <option value="">No clients</option>
                  : clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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
                  {saving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={12} className="text-white" />}
                </button>
                <button onClick={() => setAdding(false)}
                  className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center transition-colors">
                  <X size={12} className="text-slate-500" />
                </button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 mt-2.5 text-xs font-medium text-slate-400 hover:text-brand-600 transition-colors">
                <Plus size={13} /> Add client
              </button>
            )}
          </div>

          <div className="mx-3 my-5 border-t border-slate-100" />
          <div className="px-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Upload AXEL &amp; DMS files on each page when you run a comparison.
            </p>
          </div>
        </div>

        {/* ── Bottom nav ── */}
        <div className="flex-shrink-0 border-t border-slate-100 p-2">
          <button
            onClick={() => onNavigate('settings')}
            className={[
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              currentPage === 'settings' ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
            ].join(' ')}
          >
            <Settings size={17} className={currentPage === 'settings' ? 'text-brand-600' : 'text-slate-400'} />
            Settings
          </button>
        </div>
      </div>
    </aside>
  )
}
