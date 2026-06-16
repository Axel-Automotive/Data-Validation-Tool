import { useState, useEffect, useCallback } from 'react'
import { getColumns } from '../api/client'
import { toast } from '../lib/toast'

/**
 * Self-contained AXEL/DMS file + sheet + column state for ONE page/tab.
 * Each caller gets an independent instance (independent upload per tab).
 */
export default function useFileSelection() {
  const [fileAxel,    setFileAxel]    = useState(null)
  const [fileDms,     setFileDms]     = useState(null)
  const [sheetAxel,   setSheetAxel]   = useState('')
  const [sheetDms,    setSheetDms]    = useState('')
  const [columnsAxel, setColumnsAxel] = useState([])
  const [columnsDms,  setColumnsDms]  = useState([])
  const [datasetInfo, setDatasetInfo] = useState({ axel: null, dms: null })

  useEffect(() => {
    if (!fileAxel || !sheetAxel) return
    let stale = false
    getColumns(fileAxel.id, sheetAxel)
      .then(info => { if (stale) return; setColumnsAxel(info.columns); setDatasetInfo(p => ({ ...p, axel: info })) })
      .catch(() => { if (stale) return; setColumnsAxel([]); setDatasetInfo(p => ({ ...p, axel: null })); toast('Could not read columns from the AXEL sheet.', 'error') })
    return () => { stale = true }
  }, [fileAxel, sheetAxel])

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

  const filesReady = !!(fileAxel && fileDms && sheetAxel && sheetDms && columnsAxel.length && columnsDms.length)

  // Restore a previously-used file+sheet directly (e.g. remembered per client).
  const selectAxel = useCallback((info, sheet) => { setFileAxel(info); setSheetAxel(sheet || info?.sheets?.[0] || '') }, [])
  const selectDms  = useCallback((info, sheet) => { setFileDms(info);  setSheetDms(sheet  || info?.sheets?.[0] || '') }, [])
  const clear = useCallback(() => {
    setFileAxel(null); setFileDms(null); setSheetAxel(''); setSheetDms('')
    setColumnsAxel([]); setColumnsDms([]); setDatasetInfo({ axel: null, dms: null })
  }, [])

  return {
    fileAxel, fileDms, sheetAxel, sheetDms, columnsAxel, columnsDms, datasetInfo, filesReady,
    setSheetAxel, setSheetDms, onAxelUploaded, onDmsUploaded, selectAxel, selectDms, clear,
  }
}
