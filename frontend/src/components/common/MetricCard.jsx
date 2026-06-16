const SCHEMES = {
  neutral: { dot: 'bg-slate-300',   val: 'text-slate-900' },
  green:   { dot: 'bg-emerald-400', val: 'text-emerald-700' },
  indigo:  { dot: 'bg-indigo-400',  val: 'text-indigo-700' },
  amber:   { dot: 'bg-amber-400',   val: 'text-amber-700' },
  red:     { dot: 'bg-red-400',     val: 'text-red-600'   },
  cyan:    { dot: 'bg-cyan-400',    val: 'text-cyan-700'  },
}

export default function MetricCard({ label, value, sub, color = 'neutral' }) {
  const { dot, val } = SCHEMES[color] || SCHEMES.neutral
  return (
    <div className="flex-1 min-w-[130px] bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-card">
      <div className="flex items-center gap-1.5 mb-2">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        <p className="text-2xs font-semibold uppercase tracking-wider text-slate-400 truncate">{label}</p>
      </div>
      <p className={`text-2xl font-bold leading-none tabular-nums ${val}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400 mt-1.5 font-medium">{sub}</p>}
    </div>
  )
}
