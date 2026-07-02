import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, ChevronDown, Check, Database, Play } from 'lucide-react'
import { uploadFile } from '../../api/client'

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
    <div className="min-w-0">
      <div
        onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]) }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !loading && ref.current?.click()}
        className={[
          'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all',
          dragging ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100' :
          fileInfo  ? 'border-slate-200 bg-white hover:border-slate-300 shadow-card' :
                      'border-slate-200 border-dashed bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50',
          loading   ? 'opacity-60 pointer-events-none' : '',
        ].join(' ')}
      >
        <input ref={ref} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={e => handle(e.target.files[0])} />
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-slate-500">Uploading…</span>
          </>
        ) : fileInfo ? (
          <>
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet size={15} className="text-brand-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">{fileInfo.name}</p>
              <p className="text-xs text-slate-400">Click to replace</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Upload size={15} className="text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">Upload {label} file</p>
              <p className="text-xs text-slate-400">Click or drag .xlsx, .csv or .pdf</p>
            </div>
          </>
        )}
      </div>
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  )
}

function SheetSelect({ value, onChange, sheets }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none bg-white border border-slate-200 text-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400 cursor-pointer transition-colors">
        {sheets.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  )
}

const PARAM_INPUT_TYPE = { int: 'number', float: 'number', date: 'date', text: 'text' }

/** AXEL data-source picker: choose a saved query, fill params, load its columns. */
function QueryPicker({ fs, queries }) {
  const { axelQuery, axelParams, queryLoading, datasetInfo,
          selectAxelQuery, setAxelParam, loadQueryColumns } = fs

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      {queries.length === 0 ? (
        <p className="text-xs text-slate-400 py-1">
          No saved queries for this client yet. Add one in <span className="font-medium text-slate-500">Settings → AXEL Data Source</span>.
        </p>
      ) : (
        <>
          <div className="relative">
            <select
              value={axelQuery?.id || ''}
              onChange={e => selectAxelQuery(queries.find(q => q.id === e.target.value) || null)}
              className="w-full appearance-none bg-white border border-slate-200 text-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400 cursor-pointer">
              <option value="">Select a report query…</option>
              {queries.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {(axelQuery?.params || []).length > 0 && (
            <div className="flex flex-wrap gap-2.5">
              {axelQuery.params.map(p => (
                <div key={p.name}>
                  <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {p.label || p.name}{p.required ? ' *' : ''}
                  </label>
                  <input
                    type={PARAM_INPUT_TYPE[p.type] || 'text'}
                    value={axelParams[p.name] ?? ''}
                    onChange={e => setAxelParam(p.name, e.target.value)}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400" />
                </div>
              ))}
            </div>
          )}

          {axelQuery && (
            <div className="flex items-center gap-2">
              <button onClick={loadQueryColumns} disabled={queryLoading}
                className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
                {queryLoading
                  ? <><span className="w-3.5 h-3.5 border-[1.5px] border-white border-t-transparent rounded-full animate-spin" /> Running…</>
                  : <><Play size={12} /> Load columns</>}
              </button>
              {datasetInfo.axel && (
                <span className="inline-flex items-center gap-1 text-2xs text-emerald-600 font-medium">
                  <Check size={11} /> {datasetInfo.axel.rows.toLocaleString()} × {datasetInfo.axel.cols} (sample)
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ModeToggle({ mode, onChange }) {
  const opt = (val, label, Icon) => (
    <button onClick={() => onChange(val)}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors ${
        mode === val ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}>
      <Icon size={11} /> {label}
    </button>
  )
  return (
    <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
      {opt('file', 'Upload file', FileSpreadsheet)}
      {opt('query', 'Data source', Database)}
    </div>
  )
}

/**
 * AXEL/DMS source bar, driven by a useFileSelection() instance.
 *
 * When `axelQueries` is provided (a client context with saved queries), the AXEL
 * side gains a file ↔ data-source toggle. Without it, the bar is file-only.
 */
export default function FileSelectionBar({ fs, axelLabel = 'AXEL', dmsLabel = 'DMS', axelQueries = null }) {
  const { fileAxel, fileDms, sheetAxel, sheetDms, setSheetAxel, setSheetDms,
          onAxelUploaded, onDmsUploaded, datasetInfo, axelMode, switchAxelMode } = fs

  const queryEnabled = Array.isArray(axelQueries)

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* AXEL side */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{axelLabel}</span>
            {queryEnabled
              ? <ModeToggle mode={axelMode} onChange={switchAxelMode} />
              : (fileAxel && <span className="inline-flex items-center gap-1 text-2xs text-emerald-600 font-medium"><Check size={11} /> Loaded</span>)}
          </div>
          {queryEnabled && axelMode === 'query'
            ? <QueryPicker fs={fs} queries={axelQueries} />
            : <FileSlot label={axelLabel} fileInfo={fileAxel} onUploaded={onAxelUploaded} />}
        </div>

        {/* DMS side (always a file) */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{dmsLabel}</span>
            {fileDms && <span className="inline-flex items-center gap-1 text-2xs text-emerald-600 font-medium"><Check size={11} /> Loaded</span>}
          </div>
          <FileSlot label={dmsLabel} fileInfo={fileDms} onUploaded={onDmsUploaded} />
        </div>
      </div>

      {/* Sheet pickers (file mode only) */}
      {((axelMode === 'file' && fileAxel) || fileDms) && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mt-4 pt-4 border-t border-slate-100">
          {axelMode === 'file' && fileAxel && (
            <div>
              <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{axelLabel} sheet</label>
              <div className="flex items-center gap-2">
                <SheetSelect value={sheetAxel} onChange={setSheetAxel} sheets={fileAxel.sheets} />
                {datasetInfo.axel && <span className="text-xs text-slate-400 tabular-nums">{datasetInfo.axel.rows.toLocaleString()} × {datasetInfo.axel.cols}</span>}
              </div>
            </div>
          )}
          {fileDms && (
            <div>
              <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{dmsLabel} sheet</label>
              <div className="flex items-center gap-2">
                <SheetSelect value={sheetDms} onChange={setSheetDms} sheets={fileDms.sheets} />
                {datasetInfo.dms && <span className="text-xs text-slate-400 tabular-nums">{datasetInfo.dms.rows.toLocaleString()} × {datasetInfo.dms.cols}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
