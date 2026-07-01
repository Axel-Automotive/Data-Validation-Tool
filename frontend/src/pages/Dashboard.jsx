import { useState, useEffect } from 'react'
import { Play, Download, CheckCircle2, XCircle, Clock, ArrowRight, GitCompare, Layers, TrendingUp, AlertTriangle, SlidersHorizontal, Mail } from 'lucide-react'
import { runAll, runAllAndEmail, runCondition, downloadUrl } from '../api/clients'
import { listFiles } from '../api/schedules'
import { getShared } from '../api/shared'
import { getAxelQueries } from '../api/axelSources'
import useFileSelection from '../hooks/useFileSelection'
import FileSelectionBar from '../components/common/FileSelectionBar'
import MetricCard from '../components/common/MetricCard'
import { toast } from '../lib/toast'

const lastFilesKey = id => `axel-lastfiles-${id}`

const TYPE_META = {
  sheet_diff: { label: 'Sheet Difference',   Icon: GitCompare,  chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60' },
  stacked:    { label: 'Stacked Comparison', Icon: Layers,      chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/60' },
  calc_diff:  { label: 'Calc. Difference',   Icon: TrendingUp,  chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' },
  custom_rule:{ label: 'Custom Rule',        Icon: SlidersHorizontal, chip: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/60' },
}

export default function Dashboard({ selectedClient, onNavigate }) {
  const fs = useFileSelection(selectedClient?.id)
  const { fileAxel, fileDms, sheetAxel, sheetDms, filesReady, axelSourceRef } = fs
  const [axelQueries, setAxelQueries] = useState([])

  // The AXEL side of each run request: a saved query, or the uploaded file.
  const axelPayload = () => axelSourceRef
    ? { axel_source: axelSourceRef }
    : { file_axel_id: fileAxel.id, sheet_axel: sheetAxel }
  const [running,       setRunning]       = useState(false)
  const [emailing,      setEmailing]      = useState(false)
  const [runResults,    setRunResults]    = useState(null)
  const [combinedId,    setCombinedId]    = useState(null)
  const [error,         setError]         = useState(null)
  const [singleRunning, setSingleRunning] = useState({})

  // Remember the files last used for each client, and restore them on select.
  useEffect(() => {
    if (!selectedClient) return
    const saved = localStorage.getItem(lastFilesKey(selectedClient.id))
    fs.clear()
    if (!saved) return
    let cancelled = false
    ;(async () => {
      try {
        const files = await listFiles()
        if (cancelled) return
        const { axelId, sheetAxel: sa, dmsId, sheetDms: sd } = JSON.parse(saved)
        const a = files.find(f => f.id === axelId)
        const d = files.find(f => f.id === dmsId)
        if (a) fs.selectAxel(a, sa)
        if (d) fs.selectDms(d, sd)
      } catch { /* ignore — user can re-upload */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id])

  // Persist the current complete selection for this client.
  useEffect(() => {
    if (selectedClient && fileAxel && fileDms && sheetAxel && sheetDms) {
      localStorage.setItem(lastFilesKey(selectedClient.id), JSON.stringify({
        axelId: fileAxel.id, sheetAxel, dmsId: fileDms.id, sheetDms,
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id, fileAxel?.id, fileDms?.id, sheetAxel, sheetDms])

  const [sharedConds, setSharedConds] = useState([])
  useEffect(() => {
    getShared().then(s => setSharedConds(Array.isArray(s) ? s : [])).catch(() => {})
  }, [])

  // Load this client's saved AXEL data-source queries (for the source picker).
  useEffect(() => {
    if (!selectedClient) { setAxelQueries([]); return }
    getAxelQueries(selectedClient.id).then(q => setAxelQueries(Array.isArray(q) ? q : [])).catch(() => setAxelQueries([]))
  }, [selectedClient?.id])

  // Shared conditions apply to every client and run first.
  const conditions = [
    ...sharedConds.map(c => ({ ...c, _shared: true })),
    ...(selectedClient?.conditions || []),
  ]
  const enabled    = conditions.filter(c => c.enabled)
  const recipients = selectedClient?.recipients || []

  const handleRunAll = async (email = false) => {
    if (email) setEmailing(true); else setRunning(true)
    setError(null); setRunResults(null); setCombinedId(null)
    try {
      const call = email ? runAllAndEmail : runAll
      const res = await call({ client_id: selectedClient.id, file_dms_id: fileDms.id, sheet_dms: sheetDms, ...axelPayload() })
      setRunResults(res.conditions)
      setCombinedId(res.combined_result_id)
      const failed = res.conditions.filter(r => r.error).length
      if (failed) toast(`Completed — ${failed} condition${failed > 1 ? 's' : ''} had errors`, 'warning')
      else toast(`All ${res.conditions.length} conditions passed`, 'success')
      if (res.email_sent) toast(`Report emailed to ${res.email_to.join(', ')}`, 'success')
    } catch (e) {
      const msg = e.response?.data?.detail || 'Run failed'
      setError(msg); toast(msg, 'error')
    } finally { setRunning(false); setEmailing(false) }
  }

  const handleRunOne = async (cond) => {
    setSingleRunning(p => ({ ...p, [cond.id]: true }))
    try {
      const res = await runCondition({ client_id: selectedClient.id, condition_id: cond.id, file_dms_id: fileDms.id, sheet_dms: sheetDms, ...axelPayload() })
      setRunResults(prev => {
        const arr = prev ? [...prev] : []
        const i = arr.findIndex(r => r.condition_id === cond.id)
        const entry = { condition_id: cond.id, condition_name: cond.name, type: cond.type, metrics: res.metrics, result_id: res.result_id }
        if (i >= 0) arr[i] = entry; else arr.push(entry)
        return arr
      })
      toast(`"${cond.name}" completed`, 'success')
    } catch (e) {
      const msg = e.response?.data?.detail || `"${cond.name}" failed`
      setRunResults(prev => {
        const arr = prev ? [...prev] : []
        const i = arr.findIndex(r => r.condition_id === cond.id)
        const entry = { condition_id: cond.id, condition_name: cond.name, type: cond.type, error: msg }
        if (i >= 0) arr[i] = entry; else arr.push(entry)
        return arr
      })
      toast(msg, 'error')
    } finally { setSingleRunning(p => ({ ...p, [cond.id]: false })) }
  }

  if (!selectedClient) return (
    <div className="flex items-center justify-center flex-1 p-12 text-center">
      <div>
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <GitCompare size={24} className="text-slate-300" />
        </div>
        <p className="font-semibold text-slate-900 mb-1">No client selected</p>
        <p className="text-sm text-slate-500 mb-5">Select a client from the sidebar or create a new one.</p>
        <button onClick={() => onNavigate('settings')}
          className="inline-flex items-center gap-2 bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors">
          Configure Clients <ArrowRight size={13} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{selectedClient.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {enabled.length} of {conditions.length} condition{conditions.length !== 1 ? 's' : ''} enabled
            {runResults && <span className="ml-2 text-emerald-600 font-medium">· Last run complete</span>}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {combinedId && (
            <a href={downloadUrl(combinedId)} download
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap">
              <Download size={13} /> Full Report
            </a>
          )}
          <button onClick={() => handleRunAll(true)}
            disabled={running || emailing || !filesReady || enabled.length === 0}
            title={recipients.length ? `Email to ${recipients.join(', ')}` : 'Add recipients in Settings first'}
            className="inline-flex items-center gap-1.5 bg-white border border-brand-200 text-brand-700 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
            {emailing ? <><Spin /> Sending…</> : <><Mail size={13} /> Run All &amp; Email</>}
          </button>
          <button onClick={() => handleRunAll(false)}
            disabled={running || emailing || !filesReady || enabled.length === 0}
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
            {running ? <><Spin /> Running…</> : <><Play size={13} /> Run All</>}
          </button>
        </div>
      </div>

      {/* Source for this run — AXEL file/.xlsx or a saved DB query, plus DMS file */}
      <FileSelectionBar fs={fs} axelQueries={axelQueries} />

      {/* Banners */}
      {!filesReady && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800">Provide both sources above — AXEL (upload a sheet or load a data-source query) and the DMS file — to run validations.</p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle size={14} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Aggregate metrics after run */}
      {runResults && runResults.length > 0 && (() => {
        const valid   = runResults.filter(r => !r.error && r.metrics)
        const passed  = runResults.filter(r => !r.error).length
        const failed  = runResults.length - passed
        const matched = valid.filter(r => r.type === 'sheet_diff').reduce((s, r) => s + (r.metrics.matched || 0), 0)
        const unmatched = valid.filter(r => r.type === 'sheet_diff').reduce((s, r) => s + (r.metrics.only_in_a || 0) + (r.metrics.only_in_b || 0), 0)
        return (
          <div className="flex gap-3 flex-wrap">
            <MetricCard label="Total Run"   value={runResults.length} color="neutral" />
            <MetricCard label="Passed"      value={passed}            color="green"   />
            {failed > 0 && <MetricCard label="Errors" value={failed}  color="red"     />}
            {matched > 0 && <MetricCard label="Matched Rows" value={matched.toLocaleString()} color="indigo" />}
            {unmatched > 0 && <MetricCard label="Unmatched"  value={unmatched.toLocaleString()} color="amber" />}
          </div>
        )
      })()}

      {/* Conditions table */}
      {conditions.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <GitCompare size={20} className="text-slate-300" />
          </div>
          <p className="font-semibold text-slate-900 mb-1">No conditions configured</p>
          <p className="text-sm text-slate-500 mb-5">Add validation conditions for {selectedClient.name} in Settings.</p>
          <button onClick={() => onNavigate('settings')}
            className="inline-flex items-center gap-2 bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors">
            Go to Settings <ArrowRight size={13} />
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400">Condition</th>
                <th className="px-5 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400 hidden sm:table-cell">Validation</th>
                <th className="px-5 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400 hidden md:table-cell">Type</th>
                <th className="px-5 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-5 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400 hidden lg:table-cell">Key Metric</th>
                <th className="px-5 py-3 text-right text-2xs font-bold uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((cond, i) => {
                const result    = runResults?.find(r => r.condition_id === cond.id)
                const isRunning = singleRunning[cond.id]
                const meta      = TYPE_META[cond.type] || {}
                const Icon      = meta.Icon || GitCompare
                return (
                  <tr key={cond.id}
                    className={`border-b border-slate-50 last:border-transparent hover:bg-slate-50/60 transition-colors ${!cond.enabled ? 'opacity-40' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Icon size={13} className="text-slate-500" />
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900">{cond.name}</span>
                          {cond._shared && <span className="ml-2 text-2xs font-medium text-violet-700 bg-violet-50 ring-1 ring-violet-200/60 px-1.5 py-0.5 rounded-full">Shared</span>}
                          {!cond.enabled && <span className="ml-2 text-2xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">off</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      {cond.validation_name
                        ? <span className="text-slate-700">{cond.validation_name}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className={`inline-block text-2xs font-semibold px-2 py-0.5 rounded-full ${meta.chip || 'bg-slate-100 text-slate-600'}`}>
                        {meta.label || cond.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {isRunning ? (
                        <span className="flex items-center gap-1.5 text-xs text-slate-500"><Spin sm /> Running…</span>
                      ) : !result ? (
                        <span className="flex items-center gap-1.5 text-xs text-slate-400"><Clock size={12} /> Not run</span>
                      ) : result.error ? (
                        <span className="flex items-center gap-1.5 text-xs text-red-500"><XCircle size={12} /> Error</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium"><CheckCircle2 size={12} /> Complete</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <KeyMetric result={result} type={cond.type} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {result?.result_id && !result?.error && (
                          <a href={`/api/compare/download/${result.result_id}`} download
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors">
                            <Download size={11} /> Export
                          </a>
                        )}
                        <button onClick={() => handleRunOne(cond)} disabled={isRunning || !filesReady || !cond.enabled}
                          className="inline-flex items-center gap-1 text-xs font-semibold bg-brand-600 text-white px-2.5 py-1 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          {isRunning ? <><Spin sm /> Running</> : <><Play size={11} /> Run</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function KeyMetric({ result, type }) {
  if (!result?.metrics) return <span className="text-xs text-slate-300">—</span>
  const m = result.metrics
  if (type === 'sheet_diff') return <span className="text-xs font-semibold text-slate-700 tabular-nums">{m.match_rate}% · {m.matched?.toLocaleString()} matched</span>
  if (type === 'stacked')    return <span className="text-xs font-semibold text-slate-700 tabular-nums">{m.pair_rate}% · {m.paired?.toLocaleString()} paired</span>
  if (type === 'calc_diff')  return <span className="text-xs font-semibold text-slate-700 tabular-nums">{m.match_rate}% · avg Δ {m.mean_diff}</span>
  if (type === 'custom_rule') return <span className="text-xs font-semibold text-slate-700 tabular-nums">{m.pass_rate}% · {m.passed?.toLocaleString()}/{m.matched?.toLocaleString()} pass</span>
  return null
}

function Spin({ sm }) {
  return <div className={`border-[1.5px] border-current border-t-transparent rounded-full animate-spin flex-shrink-0 ${sm ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
}
