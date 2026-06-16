import { Database } from 'lucide-react'

export default function DataTable({ columns, data, total, emptyMessage }) {
  if (!data || data.length === 0) {
    return (
      <div className="border border-slate-200 rounded-xl bg-white flex flex-col items-center justify-center py-14 gap-3">
        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
          <Database size={16} className="text-slate-300" />
        </div>
        <p className="text-sm font-medium text-slate-400">{emptyMessage || 'No data to display'}</p>
      </div>
    )
  }

  const cols = columns || Object.keys(data[0] || {})

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-card">
      <div className="overflow-auto table-scroll max-h-72">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {cols.map(col => (
                <th key={col}
                  className="px-4 py-2.5 text-left text-2xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${i === data.length - 1 ? 'border-transparent' : ''}`}>
                {cols.map(col => (
                  <td key={col} className="px-4 py-2.5 text-slate-700 whitespace-nowrap max-w-[200px] truncate">
                    {row[col] ?? <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > data.length && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-2xs text-slate-400 font-medium">
            Showing first {data.length.toLocaleString()} of {total.toLocaleString()} rows
          </p>
        </div>
      )}
    </div>
  )
}
