import { useState, useEffect, useCallback, useRef } from 'react'
import { getColumns } from '../api/client'
import { previewAxelQuery } from '../api/axelSources'
import { toast } from '../lib/toast'

/**
 * Self-contained AXEL/DMS source state for ONE page/tab.
 *
 * The DMS side is always an uploaded file. The AXEL side can be either an
 * uploaded file (default) OR — when a `clientId` is supplied — a saved DB query
 * ("data source"). Callers that pass no clientId keep the original file-only
 * behaviour unchanged.
 */
export default function useFileSelection(clientId = null) {
  const [fileAxel,    setFileAxel]    = useState(null)
  const [fileDms,     setFileDms]     = useState(null)
  const [sheetAxel,   setSheetAxel]   = useState('')
  const [sheetDms,    setSheetDms]    = useState('')
  const [columnsAxel, setColumnsAxel] = useState([])
  const [columnsDms,  setColumnsDms]  = useState([])
  const [datasetInfo, setDatasetInfo] = useState({ axel: null, dms: null })

  // AXEL data-source (query) state — only used when axelMode === 'query'.
  const [axelMode,   setAxelMode]   = useState('file')   // 'file' | 'query'
  const [axelQuery,  setAxelQuery]  = useState(null)      // selected query object
  const [axelParams, setAxelParams] = useState({})        // { paramName: value }
  const [queryLoading, setQueryLoading] = useState(false)
  // Bumped whenever the active AXEL source changes (query pick, mode switch,
  // clear). A slow loadQueryColumns response checks this to avoid writing its
  // columns over a newer selection.
  const axelSourceToken = useRef(0)

  // File-mode AXEL columns (skipped in query mode — those load via preview).
  useEffect(() => {
    if (axelMode !== 'file' || !fileAxel || !sheetAxel) return
    let stale = false
    getColumns(fileAxel.id, sheetAxel)
      .then(info => { if (stale) return; setColumnsAxel(info.columns); setDatasetInfo(p => ({ ...p, axel: info })) })
      .catch(() => { if (stale) return; setColumnsAxel([]); setDatasetInfo(p => ({ ...p, axel: null })); toast('Could not read columns from the AXEL sheet.', 'error') })
    return () => { stale = true }
  }, [axelMode, fileAxel, sheetAxel])

  useEffect(() => {
    if (!fileDms || !sheetDms) return
    let stale = false
    getColumns(fileDms.id, sheetDms)
      .then(info => { if (stale) return; setColumnsDms(info.columns); setDatasetInfo(p => ({ ...p, dms: info })) })
      .catch(() => { if (stale) return; setColumnsDms([]); setDatasetInfo(p => ({ ...p, dms: null })); toast('Could not read columns from the DMS sheet.', 'error') })
    return () => { stale = true }
  }, [fileDms, sheetDms])

  const onAxelUploaded = useCallback(info => {
    setFileAxel(info); setSheetAxel(info.sheets[0] || ''); setColumnsAxel([]); setDatasetInfo(p => ({ ...p, axel: null }))
  }, [])
  const onDmsUploaded = useCallback(info => {
    setFileDms(info); setSheetDms(info.sheets[0] || ''); setColumnsDms([]); setDatasetInfo(p => ({ ...p, dms: null }))
  }, [])

  // ── AXEL data-source helpers ──────────────────────────────────────────────
  const switchAxelMode = useCallback(mode => {
    axelSourceToken.current++
    setAxelMode(mode)
    setColumnsAxel([]); setDatasetInfo(p => ({ ...p, axel: null }))   // active source changed
  }, [])

  const selectAxelQuery = useCallback(query => {
    axelSourceToken.current++
    setAxelQuery(query)
    setColumnsAxel([]); setDatasetInfo(p => ({ ...p, axel: null }))
    // Seed params with declared defaults.
    const seed = {}
    ;(query?.params || []).forEach(p => { seed[p.name] = p.default ?? '' })
    setAxelParams(seed)
  }, [])

  const setAxelParam = useCallback((name, value) => {
    setAxelParams(p => ({ ...p, [name]: value }))
  }, [])

  // Run the query (limited) to load AXEL columns + a sample, ready for rules/runs.
  const loadQueryColumns = useCallback(async () => {
    if (!clientId || !axelQuery) return
    const token = axelSourceToken.current
    setQueryLoading(true)
    try {
      const info = await previewAxelQuery(clientId, axelQuery.id, axelParams)
      if (token !== axelSourceToken.current) return   // selection changed mid-flight
      setColumnsAxel(info.columns)
      setDatasetInfo(p => ({ ...p, axel: info }))
      toast(`Loaded ${info.columns.length} columns from "${axelQuery.name}"`, 'success')
    } catch (e) {
      if (token !== axelSourceToken.current) return
      setColumnsAxel([]); setDatasetInfo(p => ({ ...p, axel: null }))
      toast(e.response?.data?.detail || 'Could not run the AXEL query.', 'error')
    } finally { setQueryLoading(false) }
  }, [clientId, axelQuery, axelParams])

  // Payload for run requests: a query source ref, or null (→ use file fields).
  const axelSourceRef = (axelMode === 'query' && axelQuery)
    ? { kind: 'query', query_id: axelQuery.id, params: axelParams }
    : null

  const axelReady = axelMode === 'query'
    ? !!(axelQuery && columnsAxel.length)
    : !!(fileAxel && sheetAxel && columnsAxel.length)
  const dmsReady  = !!(fileDms && sheetDms && columnsDms.length)
  const filesReady = axelReady && dmsReady

  // Restore a previously-used file+sheet directly (e.g. remembered per client).
  const selectAxel = useCallback((info, sheet) => { setFileAxel(info); setSheetAxel(sheet || info?.sheets?.[0] || '') }, [])
  const selectDms  = useCallback((info, sheet) => { setFileDms(info);  setSheetDms(sheet  || info?.sheets?.[0] || '') }, [])
  const clear = useCallback(() => {
    setFileAxel(null); setFileDms(null); setSheetAxel(''); setSheetDms('')
    setColumnsAxel([]); setColumnsDms([]); setDatasetInfo({ axel: null, dms: null })
    setAxelMode('file'); setAxelQuery(null); setAxelParams({})
  }, [])

  return {
    fileAxel, fileDms, sheetAxel, sheetDms, columnsAxel, columnsDms, datasetInfo, filesReady,
    setSheetAxel, setSheetDms, onAxelUploaded, onDmsUploaded, selectAxel, selectDms, clear,
    // AXEL data-source surface:
    axelMode, axelQuery, axelParams, queryLoading, axelSourceRef,
    switchAxelMode, selectAxelQuery, setAxelParam, loadQueryColumns,
  }
}
