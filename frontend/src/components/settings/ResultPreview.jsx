// Static preview of what the result sheet(s) will look like for a condition,
// driven purely by the in-progress config — no backend call, no real data.
// Helps users understand the output format before running anything.

function MiniTable({ sheet, columns, rows }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
        <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Sheet</span>
        <span className="text-xs font-semibold text-slate-700">{sheet}</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((c, i) => (
                <th key={i} className="px-3 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-slate-50 last:border-transparent">
                {columns.map((c, ci) => {
                  const cell = row[ci]
                  const val = cell && typeof cell === 'object' ? cell.v : cell
                  const bg  = cell && typeof cell === 'object' ? cell.bg : undefined
                  return (
                    <td key={ci} className="px-3 py-1.5 text-slate-600 whitespace-nowrap" style={bg ? { backgroundColor: bg } : undefined}>
                      {val ?? <span className="text-slate-300">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// A key can be a single column (string) or a composite (array of columns).
const keyLabel = (k, fallback = 'Key') =>
  (Array.isArray(k) ? k.filter(Boolean).join(' + ') : k) || fallback

// Build the sheet layout(s) for a given type + config.
function buildSheets(type, config) {
  const cfg = config || {}
  if (type === 'sheet_diff') {
    const cols = (cfg.col_pairs || []).map(p => p.axel || p.dms).filter(Boolean)
    const headers = cols.length ? cols : ['Column']
    const sample = headers.map((_, i) => `value ${i + 1}`)
    return [
      { sheet: 'In_A_Not_in_B', columns: headers, rows: [sample, headers.map(() => '…')] },
      { sheet: 'In_B_Not_in_A', columns: headers, rows: [sample, headers.map(() => '…')] },
    ]
  }

  if (type === 'stacked') {
    const a = cfg.axel_label || 'AXEL', b = cfg.dms_label || 'DMS'
    const key = keyLabel(cfg.control_axel)
    const BLUE = '#DBEAFE', YELLOW = '#FFF9C4'
    const cols = ['Source', key, 'PairStatus']
    return [{
      sheet: 'Combined', columns: cols, rows: [
        [{ v: a, bg: BLUE }, { v: '1001', bg: BLUE }, { v: 'Paired', bg: BLUE }],
        [{ v: b, bg: YELLOW }, { v: '1001', bg: YELLOW }, { v: 'Paired', bg: YELLOW }],
        [a, '1002', `${a}-only`],
        [{ v: b, bg: YELLOW }, { v: '1003', bg: YELLOW }, { v: `${b}-only`, bg: YELLOW }],
      ],
    }]
  }

  if (type === 'calc_diff') {
    const a = cfg.axel_label || 'AXEL', b = cfg.dms_label || 'DMS'
    const key = keyLabel(cfg.key_axel)
    const cols = [key, `${cfg.val_axel || 'value'} [${a}]`, `${cfg.val_dms || 'value'} [${b}]`, 'Difference']
    return [{ sheet: 'Differences', columns: cols, rows: [
      ['1001', '1200', '1000', '200'],
      ['1002', '500', '500', '0'],
    ] }]
  }

  if (type === 'custom_rule') {
    const a = cfg.axel_label || 'AXEL', b = cfg.dms_label || 'DMS'
    const key = keyLabel(cfg.key_axel)
    const checks = (cfg.checks || []).filter(c => c.axel_col || c.dms_col)
    const RED = '#FECACA'
    const cols = [key]
    checks.forEach(c => { cols.push(`${c.axel_col || 'col'} [${a}]`, `${c.dms_col || 'col'} [${b}]`) })
    checks.forEach((c, i) => cols.push(`Check ${i + 1}`))
    cols.push('Result', 'Failing Columns')

    const passRow = ['1001']
    checks.forEach(() => passRow.push('100', '100'))
    checks.forEach(() => passRow.push('Pass'))
    passRow.push('Pass', '')

    const failRow = ['1002']
    checks.forEach((c, i) => failRow.push(
      i === 0 ? { v: '200', bg: RED } : '200',
      i === 0 ? { v: '999', bg: RED } : '200',
    ))
    checks.forEach((c, i) => failRow.push(i === 0 ? 'Fail' : 'Pass'))
    failRow.push({ v: 'Fail', bg: RED }, checks.length ? `${checks[0].axel_col || 'col'} [${a}], ${checks[0].dms_col || 'col'} [${b}]` : '')

    return [
      { sheet: 'Rule_Results', columns: cols, rows: [passRow, failRow] },
      { sheet: 'Failures', columns: cols, rows: [failRow] },
    ]
  }

  if (type === 'agg_compare') {
    const a = cfg.axel_label || 'AXEL', b = cfg.dms_label || 'DMS'
    const group = keyLabel(cfg.group_axel, 'Group')
    const metric = cfg.metric || 'sum'
    const val = cfg.value_axel || (metric === 'count' ? 'rows' : 'value')
    const RED = '#FECACA'
    const m = `${metric}(${val})`
    const cols = [group, `${m} [${a}]`, `${m} [${b}]`, 'Difference', 'Result']
    return [{ sheet: 'Aggregate', columns: cols, rows: [
      ['205', '677105.62', '677105.62', '0', 'Pass'],
      [{ v: '206', bg: RED }, { v: '12000', bg: RED }, { v: '11500', bg: RED }, { v: '500', bg: RED }, { v: 'Fail', bg: RED }],
    ] }]
  }

  return []
}

export default function ResultPreview({ type, config }) {
  const sheets = buildSheets(type, config)
  if (!sheets.length) return null
  return (
    <div className="space-y-3">
      <p className="text-2xs text-slate-400">
        Sample layout only — real values come from your files. Colours match the downloaded Excel.
      </p>
      {sheets.map((s, i) => <MiniTable key={i} {...s} />)}
    </div>
  )
}
