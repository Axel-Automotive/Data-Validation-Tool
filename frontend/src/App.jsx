import { useState, useEffect, useCallback } from 'react'
import { GitCompare, Layers, TrendingUp } from 'lucide-react'
import { ToastContainer, toast } from './lib/toast'
import Sidebar from './components/layout/Sidebar'
import Header  from './components/layout/Header'
import Dashboard from './pages/Dashboard'
import Settings  from './pages/Settings'
import Schedules from './pages/Schedules'
import SheetDifference   from './components/tabs/SheetDifference'
import StackedComparison from './components/tabs/StackedComparison'
import CalcDifference    from './components/tabs/CalcDifference'
import { getColumns }    from './api/client'
import { getClients }    from './api/clients'

const TABS = [
  { id: 'sheet-diff', label: 'Sheet Difference',    Icon: GitCompare },
  { id: 'stacked',    label: 'Stacked Comparison',  Icon: Layers     },
  { id: 'calc-diff',  label: 'Calc. Difference',    Icon: TrendingUp },
]

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [page,        setPage]        = useState('dashboard')

  // ── Client state ─────────────────────────────────────────────────────────
  const [clients,        setClients]        = useState([])
  const [selectedClient, setSelectedClient] = useState(null)

  useEffect(() => {
    getClients().then(list => {
      const arr = Array.isArray(list) ? list : []
      setClients(arr)
      if (arr.length > 0) setSelectedClient(prev => prev || arr[0])
    }).catch(() => toast('Could not load clients from the server.', 'error'))
  }, [])

  const refreshClients = useCallback(() =>
    getClients()
      .then(list => {
        const arr = Array.isArray(list) ? list : []
        setClients(arr)
        setSelectedClient(prev => arr.find(c => c.id === prev?.id) || arr[0] || null)
      })
      .catch(() => toast('Could not refresh clients.', 'error')), [])

  // ── File / sheet state ────────────────────────────────────────────────────
  const [fileAxel, setFileAxel] = useState(null)
  const [fileDms,  setFileDms]  = useState(null)
  const [sheetAxel, setSheetAxel] = useState('')
  const [sheetDms,  setSheetDms]  = useState('')
  const [columnsAxel, setColumnsAxel] = useState([])
  const [columnsDms,  setColumnsDms]  = useState([])
  const [datasetInfo, setDatasetInfo] = useState({ axel: null, dms: null })

  useEffect(() => {
    if (!fileAxel || !sheetAxel) return
    let stale = false
    getColumns(fileAxel.id, sheetAxel)
      .then(info => {
        if (stale) return                       // ignore out-of-order responses
        setColumnsAxel(info.columns)
        setDatasetInfo(p => ({ ...p, axel: info }))
      })
      .catch(() => {
        if (stale) return
        setColumnsAxel([]); setDatasetInfo(p => ({ ...p, axel: null }))
        toast('Could not read columns from the AXEL sheet.', 'error')
      })
    return () => { stale = true }
  }, [fileAxel, sheetAxel])

  useEffect(() => {
    if (!fileDms || !sheetDms) return
    let stale = false
    getColumns(fileDms.id, sheetDms)
      .then(info => {
        if (stale) return
        setColumnsDms(info.columns)
        setDatasetInfo(p => ({ ...p, dms: info }))
      })
      .catch(() => {
        if (stale) return
        setColumnsDms([]); setDatasetInfo(p => ({ ...p, dms: null }))
        toast('Could not read columns from the DMS sheet.', 'error')
      })
    return () => { stale = true }
  }, [fileDms, sheetDms])

  const handleAxelUploaded = useCallback(info => {
    setFileAxel(info); setSheetAxel(info.sheets[0] || '')
    setColumnsAxel([]); setDatasetInfo(p => ({ ...p, axel: null }))
  }, [])

  const handleDmsUploaded = useCallback(info => {
    setFileDms(info); setSheetDms(info.sheets[0] || '')
    setColumnsDms([]); setDatasetInfo(p => ({ ...p, dms: null }))
  }, [])

  const filesReady = !!(fileAxel && fileDms && sheetAxel && sheetDms && columnsAxel.length && columnsDms.length)

  const fileInfo = { fileAxel, fileDms, sheetAxel, sheetDms, columnsAxel, columnsDms }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      <ToastContainer />
      <Sidebar
        open={sidebarOpen}
        clients={clients}
        selectedClient={selectedClient}
        onSelectClient={setSelectedClient}
        onClientsChange={refreshClients}
        fileAxel={fileAxel}
        fileDms={fileDms}
        sheetAxel={sheetAxel}
        sheetDms={sheetDms}
        datasetInfo={datasetInfo}
        onAxelUploaded={handleAxelUploaded}
        onDmsUploaded={handleDmsUploaded}
        onSheetAxelChange={setSheetAxel}
        onSheetDmsChange={setSheetDms}
        currentPage={page}
        onNavigate={setPage}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onToggleSidebar={() => setSidebarOpen(o => !o)} page={page} />

        {/* Tab bar — shown for ad-hoc comparison pages */}
        {!['dashboard', 'settings', 'schedules'].includes(page) && (
          <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6">
            <div className="flex gap-0">
              {TABS.map(tab => {
                const Icon = tab.Icon
                const active = page === tab.id
                return (
                  <button key={tab.id} onClick={() => setPage(tab.id)}
                    className={[
                      'inline-flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                      active
                        ? 'border-brand-600 text-brand-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
                    ].join(' ')}>
                    <Icon size={14} />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto main-scroll">
          {page === 'settings' ? (
            <Settings
              clients={clients}
              selectedClient={selectedClient}
              onSelectClient={setSelectedClient}
              onClientsChange={refreshClients}
              columnsAxel={columnsAxel}
              columnsDms={columnsDms}
            />
          ) : page === 'schedules' ? (
            <Schedules clients={clients} />
          ) : page === 'dashboard' ? (
            <Dashboard
              selectedClient={selectedClient}
              fileInfo={fileInfo}
              filesReady={filesReady}
              onNavigate={setPage}
            />
          ) : (
            <>
              {page === 'sheet-diff' && (
                <SheetDifference
                  fileAxel={fileAxel} fileDms={fileDms}
                  sheetAxel={sheetAxel} sheetDms={sheetDms}
                  columnsAxel={columnsAxel} columnsDms={columnsDms}
                />
              )}
              {page === 'stacked' && (
                <StackedComparison
                  fileAxel={fileAxel} fileDms={fileDms}
                  sheetAxel={sheetAxel} sheetDms={sheetDms}
                  columnsAxel={columnsAxel} columnsDms={columnsDms}
                />
              )}
              {page === 'calc-diff' && (
                <CalcDifference
                  fileAxel={fileAxel} fileDms={fileDms}
                  sheetAxel={sheetAxel} sheetDms={sheetDms}
                  columnsAxel={columnsAxel} columnsDms={columnsDms}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
