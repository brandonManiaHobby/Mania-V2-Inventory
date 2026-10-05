// SHARED COMPONENT — StatCard. One definition, used across all screens.
export default function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140, padding: '14px 16px', border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#999', fontWeight: 700, letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: accent || '#111' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
