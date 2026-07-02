import { useState, useEffect, useCallback } from 'react'
import { GitCompare, Layers, TrendingUp } from 'lucide-react'
import { ToastContainer, toast } from './lib/toast'
import Sidebar from './components/layout/Sidebar'
import Header  from './components/layout/Header'
import Dashboard from './pages/Dashboard'
import Settings  from './pages/Settings'
import Schedules from './pages/Schedules'
import Runs      from './pages/Runs'
import Breaks    from './pages/Breaks'
import Conditions from './pages/Conditions'
import ErrorBoundary from './components/common/ErrorBoundary'
import SheetDifference   from './components/tabs/SheetDifference'
import StackedComparison from './components/tabs/StackedComparison'
import CalcDifference    from './components/tabs/CalcDifference'
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

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      <ToastContainer />
      <Sidebar
        open={sidebarOpen}
        clients={clients}
        selectedClient={selectedClient}
        onSelectClient={setSelectedClient}
        onClientsChange={refreshClients}
        currentPage={page}
        onNavigate={setPage}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onToggleSidebar={() => setSidebarOpen(o => !o)} page={page} />

        {/* Tab bar — shown for ad-hoc comparison pages */}
        {!['dashboard', 'settings', 'schedules', 'runs', 'conditions', 'breaks'].includes(page) && (
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
          <ErrorBoundary key={page}>
            {page === 'settings' ? (
              <Settings
                clients={clients}
                selectedClient={selectedClient}
                onSelectClient={setSelectedClient}
                onClientsChange={refreshClients}
              />
            ) : page === 'schedules' ? (
              <Schedules clients={clients} />
            ) : page === 'runs' ? (
              <Runs />
            ) : page === 'breaks' ? (
              <Breaks selectedClient={selectedClient} />
            ) : page === 'conditions' ? (
              <Conditions />
            ) : page === 'dashboard' ? (
              <Dashboard
                selectedClient={selectedClient}
                onNavigate={setPage}
              />
            ) : (
              <>
                {page === 'sheet-diff' && <SheetDifference />}
                {page === 'stacked'    && <StackedComparison />}
                {page === 'calc-diff'  && <CalcDifference />}
              </>
            )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
