import { gbp, gbp0, int } from '../data'
import { splitWaves } from '../waveSegments'

// ============================================================
// WAVE ROWS — shared <tbody> rows for a product's wave table.
// Renders the per-wave rows and, when the product is divided (waveSegments),
// inserts a clearly-separated labelled band header + subtotal before each
// band. Always closes with a bold "All waves" grand-total row so the
// sub-groups still roll up to one overall figure. Used by Products and
// Inventory so the visual divide is identical in both.
// Columns (must match the table's <thead>): Wave · Qty · Unit cost · Recovered · status
// ============================================================
export default function WaveRows({ waves = [], productName }) {
  const sum = (rows, f) => rows.reduce((a, w) => a + Number(f(w) || 0), 0)

  const row = (w) => (
    <tr key={w.id ?? w.waveNo} style={{ borderTop: '1px solid #f5f5f5', textAlign: 'right' }}>
      <td style={{ textAlign: 'left' }}>W{w.waveNo}</td>
      <td>{int(w.qty)}</td>
      <td>{gbp(w.unitCost)}</td>
      <td>{gbp0(w.revenueRecovered)}</td>
      <td>{w.paidOff ? <span style={{ color: '#1a7f37' }}>paid off</span> : ''}</td>
    </tr>
  )

  // A clearly-separated band header: tinted background, strong top rule, and
  // breathing room above so the next wave reads as a NEW group (not the prior).
  const band = (label, rows) => (
    <tr key={'band-' + label}>
      <td colSpan={5} style={{ background: '#f4f2ee', borderTop: '3px solid #cbc7bf', padding: '10px 10px 7px' }}>
        <div style={{ fontWeight: 800, fontSize: 12 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#777' }}>
          {rows.length} wave{rows.length === 1 ? '' : 's'} · {int(sum(rows, (w) => w.qty))} units · cost {gbp0(sum(rows, (w) => w.totalCost))} · recovered <span style={{ color: '#1a7f37' }}>{gbp0(sum(rows, (w) => w.revenueRecovered))}</span>
        </div>
      </td>
    </tr>
  )

  // Bold overall total — regroups every wave into one line.
  const grandTotal = (rows) => (
    <tr key="all-waves-total" style={{ borderTop: '3px solid #333', fontWeight: 800, textAlign: 'right' }}>
      <td style={{ textAlign: 'left' }}>All waves</td>
      <td>{int(sum(rows, (w) => w.qty))}</td>
      <td></td>
      <td>{gbp0(sum(rows, (w) => w.revenueRecovered))}</td>
      <td></td>
    </tr>
  )

  const sorted = [...waves].sort((a, b) => a.waveNo - b.waveNo)
  if (!sorted.length) return null
  const split = splitWaves(productName, sorted)

  if (!split) {
    // Undivided: flat rows, plus a grand total when there's more than one wave.
    return <>{sorted.map(row)}{sorted.length > 1 && grandTotal(sorted)}</>
  }
  return (
    <>
      {band(split.cfg.before, split.before)}
      {split.before.map(row)}
      {band(split.cfg.after, split.after)}
      {split.after.map(row)}
      {grandTotal(sorted)}
    </>
  )
}
