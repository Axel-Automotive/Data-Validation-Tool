import { useState } from 'react'
import { Plus, Trash2, X, Save, GitCompare, Layers, TrendingUp, ChevronDown, SlidersHorizontal, Wand2, Filter, Eye } from 'lucide-react'
import { autoMapColumns } from '../../lib/columnMatch'
import ResultPreview from './ResultPreview'

const TYPES = [
  { id: 'sheet_diff',  label: 'Sheet Difference',      Icon: GitCompare,        desc: 'Row comparison — missing records' },
  { id: 'stacked',     label: 'Stacked Comparison',    Icon: Layers,            desc: 'Match records by a shared key column' },
  { id: 'calc_diff',   label: 'Calculation Difference', Icon: TrendingUp,       desc: 'Compute numeric delta between columns' },
  { id: 'custom_rule', label: 'Custom Rule',           Icon: SlidersHorizontal, desc: 'Build your own column checks, no code' },
]

const NUMERIC_OPS = [
  { id: 'eq',  label: 'equals (within tolerance)' },
  { id: 'ne',  label: 'not equal' },
  { id: 'gt',  label: 'greater than' },
  { id: 'lt',  label: 'less than' },
  { id: 'gte', label: 'greater than or equal' },
  { id: 'lte', label: 'less than or equal' },
]

const TEXT_OPS = [
  { id: 'eq',           label: 'equals' },
  { id: 'ne',           label: 'not equal' },
  { id: 'contains',     label: 'contains' },
  { id: 'not_contains', label: 'does not contain' },
]

const FILTER_OPS = [
  { id: 'eq',  label: 'equals' },        { id: 'ne',  label: 'not equal' },
  { id: 'gt',  label: 'greater than' },  { id: 'lt',  label: 'less than' },
  { id: 'gte', label: '≥' },             { id: 'lte', label: '≤' },
  { id: 'in',  label: 'in list' },       { id: 'not_in', label: 'not in list' },
  { id: 'contains', label: 'contains' }, { id: 'not_contains', label: 'does not contain' },
  { id: 'is_blank', label: 'is blank' }, { id: 'not_blank', label: 'is not blank' },
]
const NO_VALUE_OPS = new Set(['is_blank', 'not_blank'])

// ── Reusable field components ─────────────────────────────────────────────────

function Label({ children, hint }) {
  return (
    <div className="mb-1.5">
      <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500">{children}</label>
      {hint && <p className="text-2xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors" />
  )
}

function ColInput({ value, onChange, options, placeholder }) {
  if (options?.length > 0) {
    return (
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white cursor-pointer transition-colors">
          <option value="">— select column —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    )
  }
  return <TextInput value={value} onChange={onChange} placeholder={placeholder || 'Column name…'} />
}

// ── Type-specific config forms ────────────────────────────────────────────────

function SheetDiffForm({ config, onChange, columnsAxel, columnsDms }) {
  const pairs = config.col_pairs || []
  const add    = () => onChange({ ...config, col_pairs: [...pairs, { axel: '', dms: '' }] })
  const remove = i => onChange({ ...config, col_pairs: pairs.filter((_, j) => j !== i) })
  const set    = (i, k, v) => onChange({ ...config, col_pairs: pairs.map((p, j) => j === i ? { ...p, [k]: v } : p) })
  const canAutoMap = columnsAxel?.length > 0 && columnsDms?.length > 0
  const autoMap = () => onChange({ ...config, col_pairs: autoMapColumns(columnsAxel, columnsDms) })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500">Column Pairs</p>
          <p className="text-2xs text-slate-400 mt-0.5">Map each AXEL column to its equivalent DMS column</p>
        </div>
        <div className="flex items-center gap-1.5">
          {canAutoMap && (
            <button onClick={autoMap} title="Match columns by name automatically"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
              <Wand2 size={12} /> Auto-map
            </button>
          )}
          <button onClick={add}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={12} /> Add pair
          </button>
        </div>
      </div>

      {pairs.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
          <p className="text-sm">Click "Add pair" to map columns between files.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_20px_1fr_28px] gap-2 px-1">
            <p className="text-2xs font-semibold text-slate-400 uppercase tracking-wide">AXEL Column</p>
            <span />
            <p className="text-2xs font-semibold text-slate-400 uppercase tracking-wide">DMS Column</p>
            <span />
          </div>
          {pairs.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_20px_1fr_28px] items-center gap-2">
              <ColInput value={p.axel} onChange={v => set(i, 'axel', v)} options={columnsAxel} placeholder="AXEL column" />
              <div className="flex items-center justify-center"><span className="w-4 h-px bg-slate-300" /></div>
              <ColInput value={p.dms}  onChange={v => set(i, 'dms',  v)} options={columnsDms}  placeholder="DMS column" />
              <button onClick={() => remove(i)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StackedForm({ config, onChange, columnsAxel, columnsDms }) {
  const set = (k, v) => onChange({ ...config, [k]: v })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>AXEL Label</Label><TextInput value={config.axel_label || 'AXEL'} onChange={v => set('axel_label', v)} /></div>
        <div><Label>DMS Label</Label><TextInput value={config.dms_label || 'DMS'} onChange={v => set('dms_label', v)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label hint="Column name in the AXEL file">Control Column — AXEL</Label>
          <ColInput value={config.control_axel || ''} onChange={v => set('control_axel', v)} options={columnsAxel} placeholder="e.g. Deal Number" />
        </div>
        <div>
          <Label hint="Matching column in DMS (can differ in name)">Control Column — DMS</Label>
          <ColInput value={config.control_dms || ''} onChange={v => set('control_dms', v)} options={columnsDms} placeholder="e.g. Deal #" />
        </div>
      </div>
    </div>
  )
}

function CalcDiffForm({ config, onChange, columnsAxel, columnsDms }) {
  const set = (k, v) => onChange({ ...config, [k]: v })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>AXEL Label</Label><TextInput value={config.axel_label || 'AXEL'} onChange={v => set('axel_label', v)} /></div>
        <div><Label>DMS Label</Label><TextInput value={config.dms_label || 'DMS'} onChange={v => set('dms_label', v)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label hint="Key used to join rows in AXEL">Key Column — AXEL</Label>
          <ColInput value={config.key_axel || ''} onChange={v => set('key_axel', v)} options={columnsAxel} placeholder="e.g. Deal Number" />
        </div>
        <div>
          <Label hint="Matching key in DMS (can differ in name)">Key Column — DMS</Label>
          <ColInput value={config.key_dms || ''} onChange={v => set('key_dms', v)} options={columnsDms} placeholder="e.g. Deal #" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label hint="Numeric column to compare in AXEL">Value Column — AXEL</Label>
          <ColInput value={config.val_axel || ''} onChange={v => set('val_axel', v)} options={columnsAxel} placeholder="e.g. Front Gross" />
        </div>
        <div>
          <Label hint="Numeric column to compare in DMS">Value Column — DMS</Label>
          <ColInput value={config.val_dms || ''} onChange={v => set('val_dms', v)} options={columnsDms} placeholder="e.g. Front Revenue" />
        </div>
      </div>
    </div>
  )
}

function Select({ value, onChange, options }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white cursor-pointer transition-colors">
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  )
}

function CustomRuleForm({ config, onChange, columnsAxel, columnsDms }) {
  const set    = (k, v) => onChange({ ...config, [k]: v })
  const checks = config.checks || []

  const addCheck    = () => onChange({ ...config, checks: [...checks, { axel_col: '', dms_col: '', mode: 'numeric', op: 'eq', tolerance: 0 }] })
  const removeCheck = i  => onChange({ ...config, checks: checks.filter((_, j) => j !== i) })
  const setCheck    = (i, k, v) => onChange({
    ...config,
    checks: checks.map((c, j) => {
      if (j !== i) return c
      const next = { ...c, [k]: v }
      if (k === 'mode') next.op = 'eq'   // reset operator when switching mode
      return next
    }),
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>AXEL Label</Label><TextInput value={config.axel_label || 'AXEL'} onChange={v => set('axel_label', v)} /></div>
        <div><Label>DMS Label</Label><TextInput value={config.dms_label || 'DMS'} onChange={v => set('dms_label', v)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label hint="Key used to join rows in AXEL">Join Key — AXEL</Label>
          <ColInput value={config.key_axel || ''} onChange={v => set('key_axel', v)} options={columnsAxel} placeholder="e.g. Deal Number" />
        </div>
        <div>
          <Label hint="Matching key in DMS (can differ in name)">Join Key — DMS</Label>
          <ColInput value={config.key_dms || ''} onChange={v => set('key_dms', v)} options={columnsDms} placeholder="Same as AXEL if blank" />
        </div>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500">Checks</p>
            <p className="text-2xs text-slate-400 mt-0.5">A row passes only when every check passes</p>
          </div>
          <button onClick={addCheck}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={12} /> Add check
          </button>
        </div>

        {checks.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
            <p className="text-sm">Click "Add check" to compare a pair of columns.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {checks.map((c, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xs font-bold text-slate-400">CHECK {i + 1}</span>
                  <button onClick={() => removeCheck(i)}
                    className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <p className="text-2xs text-slate-400 mb-1">AXEL column</p>
                    <ColInput value={c.axel_col} onChange={v => setCheck(i, 'axel_col', v)} options={columnsAxel} placeholder="AXEL column" />
                  </div>
                  <div>
                    <p className="text-2xs text-slate-400 mb-1">DMS column</p>
                    <ColInput value={c.dms_col} onChange={v => setCheck(i, 'dms_col', v)} options={columnsDms} placeholder="DMS column" />
                  </div>
                </div>
                <div className={`grid gap-2 ${c.mode === 'numeric' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <div>
                    <p className="text-2xs text-slate-400 mb-1">Type</p>
                    <Select value={c.mode} onChange={v => setCheck(i, 'mode', v)}
                      options={[{ id: 'numeric', label: 'Numeric' }, { id: 'text', label: 'Text' }]} />
                  </div>
                  <div>
                    <p className="text-2xs text-slate-400 mb-1">Operator</p>
                    <Select value={c.op} onChange={v => setCheck(i, 'op', v)}
                      options={c.mode === 'numeric' ? NUMERIC_OPS : TEXT_OPS} />
                  </div>
                  {c.mode === 'numeric' && (
                    <div>
                      <p className="text-2xs text-slate-400 mb-1">Tolerance</p>
                      <input type="number" step="any" value={c.tolerance ?? 0}
                        onChange={e => setCheck(i, 'tolerance', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Row filters (optional, applies to any comparison type) ─────────────────────

function FilterList({ side, label, filters, columns, onChange }) {
  const list = filters || []
  const add    = () => onChange([...list, { col: '', op: 'eq', value: '' }])
  const remove = i => onChange(list.filter((_, j) => j !== i))
  const set    = (i, k, v) => onChange(list.map((f, j) => j === i ? { ...f, [k]: v } : f))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500">{label} filters</p>
        <button onClick={add} className="inline-flex items-center gap-1 text-2xs font-medium text-brand-600 hover:text-brand-700">
          <Plus size={11} /> Add
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-2xs text-slate-400 italic">No filters — all {label} rows are compared.</p>
      ) : (
        <div className="space-y-2">
          {list.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_24px] items-center gap-1.5">
              <ColInput value={f.col} onChange={v => set(i, 'col', v)} options={columns} placeholder="Column" />
              <Select value={f.op} onChange={v => set(i, 'op', v)} options={FILTER_OPS} />
              {NO_VALUE_OPS.has(f.op)
                ? <span className="text-2xs text-slate-300 px-2">—</span>
                : <TextInput value={f.value ?? ''} onChange={v => set(i, 'value', v)} placeholder={f.op === 'in' || f.op === 'not_in' ? 'a, b, c' : 'value'} />}
              <button onClick={() => remove(i)} className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RangeInputs({ label, range, onChange }) {
  const r = range || {}
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-2xs text-slate-400 w-20">{label} rows</span>
      <input type="number" min="1" placeholder="from" value={r.start ?? ''}
        onChange={e => onChange({ ...r, start: e.target.value ? +e.target.value : undefined })}
        className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
      <span className="text-slate-300">–</span>
      <input type="number" min="1" placeholder="to" value={r.end ?? ''}
        onChange={e => onChange({ ...r, end: e.target.value ? +e.target.value : undefined })}
        className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
    </div>
  )
}

function RowFiltersPanel({ config, onChange, columnsAxel, columnsDms }) {
  const filters = config.filters || {}
  const set = (k, v) => onChange({ ...config, filters: { ...filters, [k]: v } })
  return (
    <div className="space-y-4">
      <p className="text-2xs text-slate-400">Limit which rows are compared. Filters on a side combine with AND; row ranges are 1-based and inclusive.</p>
      <div className="grid grid-cols-2 gap-4">
        <FilterList side="axel" label="AXEL" filters={filters.axel} columns={columnsAxel} onChange={v => set('axel', v)} />
        <FilterList side="dms"  label="DMS"  filters={filters.dms}  columns={columnsDms}  onChange={v => set('dms', v)} />
      </div>
      <div className="border-t border-slate-200 pt-3 space-y-2">
        <RangeInputs label="AXEL" range={filters.row_range_axel} onChange={v => set('row_range_axel', v)} />
        <RangeInputs label="DMS"  range={filters.row_range_dms}  onChange={v => set('row_range_dms', v)} />
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ConditionEditor({ initial, presetType, lockType, columnsAxel, columnsDms, saving, onSave, onCancel }) {
  const [name,       setName]       = useState(initial?.name    || '')
  const [validation, setValidation] = useState(initial?.validation_name || '')
  const [type,       setType]       = useState(initial?.type    || presetType || 'sheet_diff')
  const [enabled,    setEnabled]    = useState(initial?.enabled ?? true)
  const [config,     setConfig]     = useState(initial?.config  || {})
  const [nameError,  setNameError]  = useState('')
  const [showFilters, setShowFilters] = useState(
    !!(initial?.config?.filters && (
      initial.config.filters.axel?.length || initial.config.filters.dms?.length ||
      initial.config.filters.row_range_axel || initial.config.filters.row_range_dms)))
  const [showPreview, setShowPreview] = useState(false)

  const typeLabel = TYPES.find(t => t.id === type)?.label || 'Condition'

  const changeType = t => { setType(t); setConfig({}) }

  const handleSave = () => {
    if (!name.trim()) { setNameError('Condition name is required'); return }
    setNameError('')
    onSave({ name: name.trim(), validation_name: validation.trim(), type, enabled, config })
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
        <div>
          <h4 className="text-sm font-bold text-slate-900">{initial ? `Edit ${typeLabel}` : `New ${typeLabel}`}</h4>
          <p className="text-2xs text-slate-500 mt-0.5">Configure a validation rule for this client</p>
        </div>
        <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Condition Name</Label>
            <TextInput value={name} onChange={v => { setName(v); if (v.trim()) setNameError('') }} placeholder="e.g. Invoice Count Check" />
            {nameError && <p className="mt-1.5 text-xs text-red-500">{nameError}</p>}
          </div>
          <div>
            <Label>Validation Name</Label>
            <TextInput value={validation} onChange={setValidation} placeholder="e.g. Downtown Store" />
          </div>
        </div>

        {/* Type selector — hidden when the type was chosen via a dedicated button */}
        {!lockType && (
        <div>
          <Label>Comparison Type</Label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {TYPES.map(t => {
              const Icon = t.Icon
              const active = type === t.id
              return (
                <button key={t.id} onClick={() => changeType(t.id)}
                  className={[
                    'flex flex-col items-start p-3.5 rounded-xl border-2 text-left transition-colors',
                    active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300 bg-white',
                  ].join(' ')}>
                  <Icon size={16} className={active ? 'text-brand-600 mb-2' : 'text-slate-400 mb-2'} />
                  <span className={`text-xs font-bold ${active ? 'text-brand-700' : 'text-slate-700'}`}>{t.label}</span>
                  <span className="text-2xs text-slate-400 mt-0.5 leading-tight">{t.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
        )}

        {/* Config */}
        <div className="border border-slate-100 rounded-xl bg-slate-50 p-4">
          {type === 'sheet_diff'  && <SheetDiffForm  config={config} onChange={setConfig} columnsAxel={columnsAxel} columnsDms={columnsDms} />}
          {type === 'stacked'     && <StackedForm    config={config} onChange={setConfig} columnsAxel={columnsAxel} columnsDms={columnsDms} />}
          {type === 'calc_diff'   && <CalcDiffForm   config={config} onChange={setConfig} columnsAxel={columnsAxel} columnsDms={columnsDms} />}
          {type === 'custom_rule' && <CustomRuleForm config={config} onChange={setConfig} columnsAxel={columnsAxel} columnsDms={columnsDms} />}
        </div>

        {/* Row filters — collapsible */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button onClick={() => setShowFilters(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <Filter size={14} className="text-slate-400" /> Row filters (optional)
            </span>
            <ChevronDown size={15} className={`text-slate-400 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          {showFilters && (
            <div className="border-t border-slate-100 bg-slate-50 p-4">
              <RowFiltersPanel config={config} onChange={setConfig} columnsAxel={columnsAxel} columnsDms={columnsDms} />
            </div>
          )}
        </div>

        {/* Result-sheet preview — collapsible */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button onClick={() => setShowPreview(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <Eye size={14} className="text-slate-400" /> Preview output layout
            </span>
            <ChevronDown size={15} className={`text-slate-400 transition-transform ${showPreview ? 'rotate-180' : ''}`} />
          </button>
          {showPreview && (
            <div className="border-t border-slate-100 bg-slate-50 p-4">
              <ResultPreview type={type} config={config} />
            </div>
          )}
        </div>

        {/* Enabled */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 accent-brand-600 cursor-pointer" />
          <div>
            <span className="text-sm font-medium text-slate-900">Enable this condition</span>
            <p className="text-2xs text-slate-400">Disabled conditions are skipped during "Run All"</p>
          </div>
        </label>

        {/* Actions */}
        <div className="flex items-center gap-2.5 pt-1 border-t border-slate-100">
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
            {saving
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
              : <><Save size={14} /> Save Condition</>}
          </button>
          <button onClick={onCancel}
            className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
