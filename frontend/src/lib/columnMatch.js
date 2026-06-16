// Fuzzy match AXEL columns to DMS columns to pre-fill column pairs.

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = s => new Set(norm(s).split(' ').filter(Boolean))

function jaccard(a, b) {
  const A = tokens(a), B = tokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

/**
 * Returns [{ axel, dms }] for confident matches.
 * Pass 1: exact normalised equality. Pass 2: best token-overlap ≥ threshold.
 */
export function autoMapColumns(axelCols = [], dmsCols = [], threshold = 0.5) {
  const pairs = []
  const usedDms = new Set()

  // Pass 1 — exact normalised match
  for (const a of axelCols) {
    const na = norm(a)
    const hit = dmsCols.find(d => !usedDms.has(d) && norm(d) === na)
    if (hit) { pairs.push({ axel: a, dms: hit }); usedDms.add(hit) }
  }

  // Pass 2 — best fuzzy match for the rest
  const pairedAxel = new Set(pairs.map(p => p.axel))
  for (const a of axelCols) {
    if (pairedAxel.has(a)) continue
    let best = null, bestScore = threshold
    for (const d of dmsCols) {
      if (usedDms.has(d)) continue
      const score = jaccard(a, d)
      if (score >= bestScore) { best = d; bestScore = score }
    }
    if (best) { pairs.push({ axel: a, dms: best }); usedDms.add(best) }
  }

  return pairs
}
