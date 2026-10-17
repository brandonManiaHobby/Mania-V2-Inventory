// SHARED COMPONENT — StatCard. One definition, used across all screens.
// Pass `onClick` to make it inspectable (shows a ⌄ affordance + an active ring).
export default function StatCard({ label, value, sub, accent, onClick, active }) {
  const base = {
    flex: '1 1 150px', minWidth: 140, padding: '14px 16px', borderRadius: 12,
    background: '#fff', textAlign: 'left', font: 'inherit',
    border: '1px solid ' + (active ? 'var(--orange)' : '#eee'),
    boxShadow: active ? '0 0 0 2px rgba(255,106,0,0.18)' : 'none',
    cursor: onClick ? 'pointer' : 'default',
  }
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#999', fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
        {onClick && <span style={{ fontSize: 12, color: active ? 'var(--orange)' : '#bbb' }}>{active ? '▴' : '⌄'}</span>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: accent || '#111' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</div>}
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} style={base}>{inner}</button>
    : <div style={base}>{inner}</div>
}
