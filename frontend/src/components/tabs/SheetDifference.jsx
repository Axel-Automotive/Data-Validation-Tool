import { useState, useEffect } from 'react'
import { Play, Download, Info, GitCompare, XCircle } from 'lucide-react'
import { runSheetDiff, downloadUrl } from '../../api/client'
import ColumnSelector from '../common/ColumnSelector'
import MetricCard from '../common/MetricCard'
import DataTable from '../common/DataTable'

export default function SheetDifference({ fileAxel, fileDms, sheetAxel, sheetDms, columnsAxel, columnsDms }) {
  const [selAxel,  setSelAxel]  = useState([])
  const [selDms,   setSelDms]   = useState([])
  const [running,  setRunning]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState(null)
  const [preview,  setPreview]  = useState('notInDms')

  // Reset selections + results when the underlying columns change (e.g. user
  // switched sheets in the sidebar), so we never run with stale column names.
  useEffect(() => {
    setSelAxel([]); setSelDms([]); setResult(null); setError(null)
  }, [columnsAxel, columnsDms])

  const filesReady = fileAxel && fileDms && sheetAxel && sheetDms

  const handleRun = async () => {
    if (selAxel.length === 0) { setError('Select at least one column from each file.'); return }
    if (selAxel.length !== selDms.length) { setError(`Column count must match: ${selAxel.length} AXEL vs ${selDms.length} DMS.`); return }
    setRunning(true); setError(null); setResult(null)
    try {
      const res = await runSheetDiff({
        file_a_id: fileAxel.id, file_b_id: fileDms.id,
        sheet_a: sheetAxel,     sheet_b: sheetDms,
        cols_a: selAxel,        cols_b: selDms,
      })
      setResult(res)
    } catch (e) { setError(e.response?.data?.detail || 'Comparison failed.') }
    finally { setRunning(false) }
  }

  const m = result?.metrics
  const activePreview = result?.preview?.[preview === 'notInDms' ? 'not_in_b' : 'not_in_a']

  return (
    <div>
      {/* ── Sticky action bar ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-6">
        <span className="text-sm text-slate-500">Identify rows present in one file but missing in the other.</span>
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
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Map Columns</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xs font-medium text-slate-500 mb-1.5">AXEL Columns</p>
                <ColumnSelector label="AXEL" columns={columnsAxel} selected={selAxel} onChange={setSelAxel} />
              </div>
              <div>
                <p className="text-2xs font-medium text-slate-500 mb-1.5">DMS Columns</p>
                <ColumnSelector label="DMS"  columns={columnsDms}  selected={selDms}  onChange={setSelDms}  />
              </div>
            </div>
            {selAxel.length > 0 && selDms.length > 0 && selAxel.length !== selDms.length && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                Select an equal number of columns: {selAxel.length} AXEL vs {selDms.length} DMS.
              </p>
            )}
          </div>
        )}

        {m && (
          <>
            <div className="flex gap-3 flex-wrap">
              <MetricCard label="Matched"    value={m.matched?.toLocaleString()}   color="green"   />
              <MetricCard label="Only AXEL"  value={m.only_in_a?.toLocaleString()} color="amber"   />
              <MetricCard label="Only DMS"   value={m.only_in_b?.toLocaleString()} color="indigo"  />
              <MetricCard label="Match Rate" value={`${m.match_rate}%`}            color="neutral" />
            </div>

            <div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-4">
                {[
                  { key: 'notInDms',  label: `Only AXEL · ${m.only_in_a?.toLocaleString()}` },
                  { key: 'notInAxel', label: `Only DMS · ${m.only_in_b?.toLocaleString()}`  },
                ].map(t => (
                  <button key={t.key} onClick={() => setPreview(t.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${preview === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {activePreview?.total === 0 ? (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <GitCompare size={14} className="text-emerald-600 flex-shrink-0" />
                  <p className="text-sm text-emerald-800 font-medium">All rows match — no differences for this view.</p>
                </div>
              ) : (
                <DataTable columns={activePreview?.columns} data={activePreview?.data} total={activePreview?.total} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Spin() { return <div className="w-3.5 h-3.5 border-[1.5px] border-white border-t-transparent rounded-full animate-spin" /> }
