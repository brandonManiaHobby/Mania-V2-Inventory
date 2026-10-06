// ============================================================
// SHARED COMPONENT — MiniBars
// Two (or more) horizontal bars sharing a scale, so differences are
// VISIBLE at a glance (e.g. gross vs net — the gap = fees eaten).
// bars: [{ label, value, colour }], max = shared scale max.
// ============================================================
export default function MiniBars({ bars = [], max, formatValue = (v) => v }) {
  const scale = max || Math.max(1, ...bars.map((b) => b.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
      {bars.map((b, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 8, background: '#f0efec', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(2, (b.value / scale) * 100)}%`, height: '100%', background: b.colour, borderRadius: 999 }} />
          </div>
          <span style={{ fontSize: 11, color: '#888', width: 54, textAlign: 'right' }}>{formatValue(b.value)}</span>
        </div>
      ))}
    </div>
  )
}
