import { useState } from 'react'
import { Search } from 'lucide-react'

export default function ColumnSelector({ label, columns, selected, onChange }) {
  const [query, setQuery] = useState('')
  const filtered = query
    ? columns.filter(c => c.toLowerCase().includes(query.toLowerCase()))
    : columns
  const allChecked = selected.length === columns.length

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <button
          onClick={() => onChange(allChecked ? [] : [...columns])}
          className="text-2xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
        >
          {allChecked ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* Search */}
      {columns.length > 8 && (
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <Search size={12} className="text-slate-400 flex-shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter columns…"
              className="flex-1 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* List */}
      <div className="overflow-y-auto max-h-48 main-scroll divide-y divide-slate-50">
        {filtered.map(col => (
          <label key={col} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={selected.includes(col)}
              onChange={() => onChange(
                selected.includes(col) ? selected.filter(c => c !== col) : [...selected, col]
              )}
              className="w-3.5 h-3.5 rounded border-slate-300 accent-brand-600 cursor-pointer"
            />
            <span className="text-xs text-slate-700 font-medium truncate">{col}</span>
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-4 text-xs text-slate-400">No columns match "{query}"</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
        <p className="text-2xs text-slate-400 font-medium">
          {selected.length} of {columns.length} selected
        </p>
      </div>
    </div>
  )
}
