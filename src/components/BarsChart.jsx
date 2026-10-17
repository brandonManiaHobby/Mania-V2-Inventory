// Bars for actuals + an optional projection line (least-squares trend over the
// historic bars). Replaces line charts across V2 — bars read the takings, the
// line reads the trajectory. Pure SVG, theme-aware, no deps.
export default function BarsChart({ labels = [], values = [], formatY = (v) => v, height = 200, barColor = 'var(--orange)', showProjection = true, projLabel = 'Projected', projectedBar = null }) {
  // projectedBar: { index, total, color } — draws the gap between the actual bar
  // and its projected total in `color` (e.g. a dark-orange "projected" cap on the
  // current, still-running period). Independent of the dashed trend line.
  const n = values.length
  if (n === 0) return null

  // least-squares line y = a + b·x over the actual bars
  let projection = null
  if (showProjection && n >= 2) {
    const xs = values.map((_, i) => i)
    const sx = xs.reduce((a, b) => a + b, 0)
    const sy = values.reduce((a, b) => a + b, 0)
    const sxx = xs.reduce((a, x) => a + x * x, 0)
    const sxy = xs.reduce((a, x, i) => a + x * values[i], 0)
    const denom = n * sxx - sx * sx
    if (denom !== 0) {
      const b = (n * sxy - sx * sy) / denom
      const a = (sy - b * sx) / n
      projection = xs.map((x) => Math.max(0, a + b * x))
    }
  }

  const projTotal = projectedBar ? Number(projectedBar.total) || 0 : 0
  const max = Math.max(1, ...values, ...(projection || []), projTotal)
  const padL = 46, padB = 24, padT = 8, padR = 10
  const W = Math.max(320, n * 60), H = height
  const plotW = W - padL - padR, plotH = H - padT - padB
  const band = plotW / n
  const barW = Math.min(52, band * 0.66)
  const cx = (i) => padL + band * i + band / 2
  const y = (v) => padT + plotH - (v / max) * plotH
  const ticks = 4
  const grid = Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i)

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', minWidth: W > 520 ? W : undefined }}>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeDasharray={i === 0 ? '0' : '3 3'} />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{formatY(g)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const isProj = projectedBar && i === projectedBar.index && projTotal > v
          return (
            <g key={i}>
              {/* projected remainder (drawn first, behind the actual cap) */}
              {isProj && (
                <rect x={cx(i) - barW / 2} y={y(projTotal)} width={barW} height={Math.max(0, y(v) - y(projTotal))} rx="5" fill={projectedBar.color || '#b4440a'} />
              )}
              {/* actual value */}
              <rect x={cx(i) - barW / 2} y={y(v)} width={barW} height={Math.max(0, padT + plotH - y(v))} rx="5" fill={barColor} />
              <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{labels[i]}</text>
            </g>
          )
        })}
        {projection && (
          <polyline fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="5 4" opacity="0.7"
            points={projection.map((p, i) => `${cx(i)},${y(p)}`).join(' ')} />
        )}
      </svg>
      {(projection || projectedBar) && (
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)', marginTop: 4, paddingLeft: padL, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 8, borderRadius: 2, background: barColor, display: 'inline-block' }} />Actual</span>
          {projectedBar && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 8, borderRadius: 2, background: projectedBar.color || '#b4440a', display: 'inline-block' }} />{projLabel}</span>}
          {projection && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, borderTop: '2px dashed var(--ink)', display: 'inline-block', opacity: 0.7 }} />Trend</span>}
        </div>
      )}
    </div>
  )
}
