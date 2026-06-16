import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const _listeners = new Set()

export function toast(message, type = 'success') {
  const id = Math.random().toString(36).slice(2, 9)
  _listeners.forEach(fn => fn({ id, message, type }))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const handler = (t) => {
      setToasts(p => [...p, t])
      setTimeout(() => setToasts(p => p.filter(x => x.id !== t.id)), 4000)
    }
    _listeners.add(handler)
    return () => _listeners.delete(handler)
  }, [])

  const dismiss = (id) => setToasts(p => p.filter(x => x.id !== id))

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const { Icon, border, iconCls } = {
          success: { Icon: CheckCircle2, border: 'border-emerald-200', iconCls: 'text-emerald-500' },
          error:   { Icon: XCircle,      border: 'border-red-200',     iconCls: 'text-red-500'     },
          warning: { Icon: AlertTriangle, border: 'border-amber-200',   iconCls: 'text-amber-500'  },
          info:    { Icon: Info,          border: 'border-slate-200',   iconCls: 'text-slate-400'  },
        }[t.type] || { Icon: Info, border: 'border-slate-200', iconCls: 'text-slate-400' }

        return (
          <div key={t.id}
            className={`pointer-events-auto flex items-start gap-3 w-80 bg-white border ${border} shadow-panel rounded-xl px-4 py-3 toast-in`}>
            <Icon size={15} className={`flex-shrink-0 mt-0.5 ${iconCls}`} />
            <p className="text-sm font-medium text-slate-800 flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)}
              className="flex-shrink-0 text-slate-300 hover:text-slate-500 transition-colors mt-0.5">
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
