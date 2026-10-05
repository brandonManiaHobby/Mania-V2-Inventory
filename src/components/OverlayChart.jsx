// ============================================================
// SHARED COMPONENT — OverlayChart (lightweight SVG line chart)
// Draws one or more series over the same x-axis. Used for the Dashboard's
// gross+net overlay. No chart library — self-contained, themeable.
// series: [{ label, colour, points: [{x, y}] }], x shared across series.
// ============================================================
export default function OverlayChart({ series = [], labels = [], height = 220, formatY = (v) => v }) {
  const W = 760, H = height, padL = 54, padR = 16, padT = 16, padB = 34
  const allY = series.flatMap((s) => s.points.map((p) => p.y))
  const maxY = Math.max(1, ...allY)
  const n = labels.length || Math.max(...series.map((s) => s.points.length), 1)

  const xAt = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR))
  const yAt = (v) => H - padB - (v / maxY) * (H - padT - padB)

  const pathFor = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.x).toFixed(1)} ${yAt(p.y).toFixed(1)}`).join(' ')

  // y gridlines (4)
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: yAt(maxY * f), v: maxY * f }))
  // x labels — show up to ~8 to avoid crowding
  const step = Math.ceil(n / 8) || 1

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520 }}>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={W - padR} y2={g.y} stroke="#f0f0f0" />
            <text x={padL - 8} y={g.y + 4} textAnchor="end" fontSize="10" fill="#aaa">{formatY(g.v)}</text>
          </g>
        ))}
        {labels.map((lb, i) => (i % step === 0) && (
          <text key={i} x={xAt(i)} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#aaa">{lb}</text>
        ))}
        {series.map((s, si) => (
          <path key={si} d={pathFor(s.points)} fill="none" stroke={s.colour} strokeWidth="2" />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 12 }}>
        {series.map((s, si) => (
          <span key={si} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 3, background: s.colour, display: 'inline-block', borderRadius: 2 }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
