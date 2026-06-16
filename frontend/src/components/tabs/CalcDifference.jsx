import { useState, useEffect } from 'react'
import { Play, Download, Info, AlertTriangle, XCircle, ChevronDown } from 'lucide-react'
import { runCalcDiff, downloadUrl } from '../../api/client'
import MetricCard from '../common/MetricCard'
import DataTable from '../common/DataTable'

function ColSelect({ value, onChange, options, placeholder }) {
  if (options?.length > 0) {
    return (
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent cursor-pointer">
          <option value="">— select —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    )
  }
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
  )
}

export default function CalcDifference({ fileAxel, fileDms, sheetAxel, sheetDms, columnsAxel, columnsDms }) {
  const [nameAxel, setNameAxel] = useState('AXEL')
  const [nameDms,  setNameDms]  = useState('DMS')
  const [keyCol,   setKeyCol]   = useState('')
  const [numColA,  setNumColA]  = useState('')
  const [numColB,  setNumColB]  = useState('')
  const [running,  setRunning]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState(null)

  // Clear stale key/value selections + results when the columns change.
  useEffect(() => {
    setKeyCol(''); setNumColA(''); setNumColB(''); setResult(null); setError(null)
  }, [columnsAxel, columnsDms])

  const filesReady = fileAxel && fileDms && sheetAxel && sheetDms

  const handleRun = async () => {
    if (!keyCol || !numColA || !numColB) { setError('Key column and both value columns are required.'); return }
    if (keyCol === numColA)               { setError('Key column and AXEL value column must be different.'); return }
    setRunning(true); setError(null); setResult(null)
    try {
      const res = await runCalcDiff({
        file_a_id: fileAxel.id, file_b_id: fileDms.id,
        sheet_a: sheetAxel,     sheet_b: sheetDms,
        name_a: nameAxel,       name_b: nameDms,
        key_col: keyCol,
        num_col_a: numColA,     num_col_b: numColB,
      })
      setResult(res)
    } catch (e) { setError(e.response?.data?.detail || 'Comparison failed.') }
    finally { setRunning(false) }
  }

  const m = result?.metrics
  const preview = result?.preview?.differences

  return (
    <div>
      {/* ── Sticky action bar ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-6">
        <span className="text-sm text-slate-500">Join records by a key and compute the numeric delta between value columns.</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {result?.result_id && (
            <a href={downloadUrl(result.result_id)} download
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
              <Download size={13} /> Export
            </a>
          )}
          <button onClick={handleRun} disabled={running || !filesReady}
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {running ? <><Spin /> Running…</> : <><Play size={13} /> Run</>}
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-6 space-y-5 max-w-4xl">
        {error && (
          <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <XCircle size={14} className="flex-shrink-0" /> {error}
          </div>
        )}

        {!filesReady ? (
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
            <Info size={15} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-700">Files not uploaded</p>
              <p className="text-sm text-slate-500 mt-0.5">Upload AXEL and DMS files using the sidebar, then select a sheet to continue.</p>
            </div>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Configuration</p>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">AXEL Label</label>
                  <input value={nameAxel} onChange={e => setNameAxel(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">DMS Label</label>
                  <input value={nameDms} onChange={e => setNameDms(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Join Key</p>
                <div className="max-w-xs">
                  <label className="block text-2xs font-semibold text-slate-500 mb-1.5">Key Column (AXEL)</label>
                  <ColSelect value={keyCol} onChange={setKeyCol} options={columnsAxel} placeholder="e.g. Deal Number" />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Value Columns</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-2xs font-semibold text-slate-500 mb-1.5">Value Column — AXEL</label>
                    <ColSelect value={numColA} onChange={setNumColA} options={columnsAxel} placeholder="e.g. Front Gross" />
                  </div>
                  <div>
                    <label className="block text-2xs font-semibold text-slate-500 mb-1.5">Value Column — DMS</label>
                    <ColSelect value={numColB} onChange={setNumColB} options={columnsDms} placeholder="e.g. Front Revenue" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {m && (
          <>
            <div className="flex gap-3 flex-wrap">
              <MetricCard label="Matched"    value={m.matched?.toLocaleString()}   color="green"   />
              <MetricCard label="Match Rate" value={`${m.match_rate}%`}            color="neutral" />
              <MetricCard label="AXEL > DMS" value={m.a_gt_b?.toLocaleString()}   color="amber"   />
              <MetricCard label="DMS > AXEL" value={m.a_lt_b?.toLocaleString()}   color="indigo"  />
              <MetricCard label="Avg Delta"  value={m.mean_diff}                   color="neutral" />
            </div>

            {(m.excluded_a > 0 || m.excluded_b > 0) && (
              <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                <AlertTriangle size={14} className="flex-shrink-0" />
                {m.excluded_a > 0 && `${m.excluded_a.toLocaleString()} AXEL rows had no match. `}
                {m.excluded_b > 0 && `${m.excluded_b.toLocaleString()} DMS rows had no match. `}
                Excluded from delta calculation.
              </div>
            )}

            {preview && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Difference Output</p>
                  <p className="text-xs text-slate-400">{preview.total?.toLocaleString()} rows</p>
                </div>
                <DataTable columns={preview.columns} data={preview.data} total={preview.total} emptyMessage="No differences found." />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Spin() { return <div className="w-3.5 h-3.5 border-[1.5px] border-white border-t-transparent rounded-full animate-spin" /> }
