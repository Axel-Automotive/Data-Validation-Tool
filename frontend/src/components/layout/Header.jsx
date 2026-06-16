import { Menu, ChevronRight } from 'lucide-react'

const CRUMBS = {
  dashboard:   ['Dashboard'],
  'sheet-diff': ['Sheet Difference'],
  stacked:     ['Stacked Comparison'],
  'calc-diff': ['Calculation Difference'],
  schedules:   ['Schedules'],
  runs:        ['Run History'],
  settings:    ['Settings'],
}

export default function Header({ onToggleSidebar, page }) {
  const crumbs = CRUMBS[page] || [page]

  return (
    <header className="flex-shrink-0 h-14 bg-white/80 backdrop-blur-sm border-b border-slate-200 flex items-center px-4 gap-3 z-10">
      <button
        onClick={onToggleSidebar}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu size={16} />
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={13} className="text-slate-300" />}
            <span className={`text-sm ${i === crumbs.length - 1 ? 'text-slate-900 font-semibold' : 'text-slate-400 font-medium'}`}>
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-2xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
          v2.0
        </span>
      </div>
    </header>
  )
}
