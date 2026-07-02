import { useState, useEffect, Fragment } from 'react'
import { History, Download, CheckCircle2, AlertTriangle, XCircle, Mail, Play, Clock, RefreshCw, TrendingDown } from 'lucide-react'
import { getRuns, getTrends } from '../api/runs'
import { downloadUrl } from '../api/clients'
import { toast } from '../lib/toast'

const KIND_META = {
  manual:    { label: 'Manual',    Icon: Play, chip: 'bg-slate-100 text-slate-600' },
  email:     { label: 'Emailed',   Icon: Mail, chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60' },
  scheduled: { label: 'Scheduled', Icon: Clock, chip: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/60' },
}

function rateOf(s) {
  const m = s.metrics || {}
  const r = m.match_rate ?? m.pair_rate ?? m.pass_rate
  return r != null ? `${r}%` : '—'
}

export default function Runs() {
  const [runs, setRuns] = useState([])
  const [regressions, setRegressions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const [r, t] = await Promise.all([getRuns(), getTrends().catch(() => [])])
      setRuns(r)
      setRegressions((Array.isArray(t) ? t : []).filter(s => s.regression))
    }
    catch { toast('Could not load run history.', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Run History</h1>
          <p className="text-sm text-slate-500 mt-0.5">Every validation run — manual, emailed, and scheduled — with downloadable reports.</p>
        </div>
        <button onClick={refresh}
          className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors flex-shrink-0">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Regression alerts — only shown when a condition's latest rate dropped
          well below its recent average. */}
      {regressions.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={15} className="text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">
              {regressions.length} condition{regressions.length !== 1 ? 's' : ''} regressed since their recent average
            </span>
          </div>
          <div className="space-y-1">
            {regressions.map((s, i) => (
              <div key={i} className="text-xs text-amber-900/80 flex items-center gap-2">
                <span className="font-medium">{s.client_name}</span>
                <span className="text-amber-700">·</span>
                <span>{s.name}{s.validation_name ? ` (${s.validation_name})` : ''}</span>
                <span className="text-amber-700">·</span>
                <span className="tabular-nums">{s.latest_rate}% now vs {s.baseline_rate}% avg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><History size={22} className="text-slate-300" /></div>
          <p className="font-semibold text-slate-900 mb-1">No runs yet</p>
          <p className="text-sm text-slate-500">Runs appear here after you use "Run All" on the Dashboard or a schedule fires.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400">When</th>
                <th className="px-5 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400">Client</th>
                <th className="px-5 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400 hidden md:table-cell">Kind</th>
                <th className="px-5 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400">Result</th>
                <th className="px-5 py-3 text-right text-2xs font-bold uppercase tracking-wider text-slate-400">Report</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => {
                const meta = KIND_META[r.kind] || KIND_META.manual
                const Icon = meta.Icon
                const open = expanded === r.id
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setExpanded(open ? null : r.id)}
                      className="border-b border-slate-50 last:border-transparent hover:bg-slate-50/60 transition-colors cursor-pointer">
                      <td className="px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap">{r.ts}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{r.client_name}</td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className={`inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full ${meta.chip}`}>
                          <Icon size={11} /> {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {r.status === 'failed' ? (
                          <span className="flex items-center gap-1.5 text-xs text-red-500"><XCircle size={12} /> Failed</span>
                        ) : r.errors > 0 ? (
                          <span className="flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle size={12} /> {r.total - r.errors}/{r.total} ok</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium"><CheckCircle2 size={12} /> {r.total}/{r.total} ok</span>
                        )}
                        {r.email_to?.length > 0 && <span className="ml-2 text-2xs text-slate-400">· emailed</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {r.combined_result_id ? (
                          <a href={downloadUrl(r.combined_result_id)} download onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors">
                            <Download size={11} /> Download
                          </a>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                    </tr>
                    {open && r.summary?.length > 0 && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={5} className="px-5 py-3">
                          <div className="space-y-1.5">
                            {r.summary.map((s, i) => (
                              <div key={i} className="flex items-center gap-3 text-xs">
                                {s.error
                                  ? <XCircle size={12} className="text-red-500 flex-shrink-0" />
                                  : <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />}
                                <span className="font-medium text-slate-700 min-w-[140px]">{s.name}</span>
                                {s.validation_name && <span className="text-slate-500">{s.validation_name}</span>}
                                <span className="text-slate-400">{s.type}</span>
                                <span className="text-slate-500">{s.error ? s.error : rateOf(s)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
