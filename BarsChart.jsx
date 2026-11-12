import { useState, useRef } from 'react'

// Bars for actuals + an optional projection line (least-squares trend) and/or a
// projected "cap" on one bar. Hover any bar to inspect it (label, value, and any
// per-bar meta lines — e.g. the stream(s) that made up a day). Pure SVG, theme-
// aware, no deps.
export default function BarsChart({ labels = [], values = [], formatY = (v) => v, height = 200, barColor = 'var(--orange)', showProjection = true, projLabel = 'Projected', projectedBar = null, meta = null }) {
  const [hover, setHover] = useState(null)   // { i, x, y } relative to the container
  const wrapRef = useRef(null)
  const n = values.length
  if (n === 0) return null

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
  const barW = band * 0.82
  const cx = (i) => padL + band * i + band / 2
  const y = (v) => padT + plotH - (v / max) * plotH
  const ticks = 4
  const grid = Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i)

  const onMove = (i, e) => {
    const r = wrapRef.current?.getBoundingClientRect()
    setHover({ i, x: r ? e.clientX - r.left : 0, y: r ? e.clientY - r.top : 0 })
  }
  const metaOf = (i) => { const m = meta ? meta[i] : null; return Array.isArray(m) ? m : (m ? [m] : []) }

  return (
    <div ref={wrapRef} style={{ width: '100%', overflowX: 'auto', position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', minWidth: W > 520 ? W : undefined }}>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeDasharray={i === 0 ? '0' : '3 3'} />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{formatY(g)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const isProj = projectedBar && i === projectedBar.index && projTotal > v
          const active = hover && hover.i === i
          return (
            <g key={i}>
              {isProj && (
                <rect x={cx(i) - barW / 2} y={y(projTotal)} width={barW} height={Math.max(0, y(v) - y(projTotal))} rx="5" fill={projectedBar.color || '#b4440a'} />
              )}
              <rect x={cx(i) - barW / 2} y={y(v)} width={barW} height={Math.max(0, padT + plotH - y(v))} rx="5" fill={barColor} opacity={hover && !active ? 0.55 : 1} />
              {/* full-height hit target for easy hovering */}
              <rect x={cx(i) - band / 2} y={padT} width={band} height={plotH} fill="transparent"
                onMouseMove={(e) => onMove(i, e)} onMouseEnter={(e) => onMove(i, e)} style={{ cursor: 'pointer' }} />
              <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{labels[i]}</text>
            </g>
          )
        })}
        {projection && (
          <polyline fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="5 4" opacity="0.7"
            points={projection.map((p, i) => `${cx(i)},${y(p)}`).join(' ')} />
        )}
      </svg>

      {hover && (
        <div style={{ position: 'absolute', left: Math.max(4, Math.min(hover.x + 12, (wrapRef.current?.clientWidth || 400) - 210)), top: Math.max(4, hover.y - 10), zIndex: 20, pointerEvents: 'none', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: '8px 11px', width: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 800, marginBottom: metaOf(hover.i).length ? 5 : 0 }}>
            <span>{labels[hover.i]}</span><span>{formatY(values[hover.i])}</span>
          </div>
          {metaOf(hover.i).map((line, k) => (
            <div key={k} style={{ fontSize: 12, color: 'var(--muted)', padding: '1px 0' }}>{line}</div>
          ))}
        </div>
      )}

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
