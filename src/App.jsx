import { useState } from 'react'
import { useSource, gbp, pct, int, displayDate } from './data'
import { computeMoney } from './money'

// ============================================================
// STAGE 2 GATE — proves the money engine:
// A live, editable worked example runs through computeMoney() and shows
// all 9 layers. Change the inputs, watch the ladder recompute. This is
// the ONE function every real screen will call in Stage 5.
// ============================================================
export default function App() {
  const { source, status } = useSource()
  const [gross, setGross] = useState(120)
  const [net, setNet] = useState(110)
  const [cost, setCost] = useState(100)
  const [secondHand, setSecondHand] = useState(false)

  const m = computeMoney({
    gross: Number(gross), net: Number(net), costPaid: Number(cost),
    vatTreatment: secondHand ? 'second_hand' : 'standard',
  })

  const rungs = [
    ['1 · Gross', gbp(m.gross)],
    ['2 · Fees (gross − net)', gbp(m.fees)],
    ['3 · Net (streamer-entered)', gbp(m.net)],
    ['4 · VAT portion', gbp(m.vatPortion)],
    ['5 · Net ex-VAT', gbp(m.netExVat)],
    ['6a · Cost paid', gbp(m.costPaid)],
    ['6b · Cost incl-VAT', gbp(m.costInclVat)],
    ['· Cost ex-VAT', gbp(m.costExVat)],
    ['7 · Gross margin', gbp(m.grossMargin)],
    ['8 · VAT owed (to HMRC)', gbp(m.vatOwed)],
    ['9 · True profit', gbp(m.trueProfit)],
  ]

  const field = { padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd', width: 90, font: 'inherit' }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Mania V2</h1>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: '#fde68a', color: '#7c5e00', fontWeight: 700 }}>
          BUILD · STAGE 2
        </span>
      </div>
      <p style={{ color: '#666', marginTop: 4 }}>Money engine — one function, the 9-layer ladder. Edit the inputs.</p>

      {/* Live worked example */}
      <div style={{ marginTop: 20, padding: 16, border: '1px solid #e5e5e5', borderRadius: 12 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
          <label>Gross £<br /><input style={field} type="number" value={gross} onChange={(e) => setGross(e.target.value)} /></label>
          <label>Net £<br /><input style={field} type="number" value={net} onChange={(e) => setNet(e.target.value)} /></label>
          <label>Cost £<br /><input style={field} type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={secondHand} onChange={(e) => setSecondHand(e.target.checked)} />
            Second-hand (VAT-free)
          </label>
        </div>

        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <tbody>
            {rungs.map(([k, v], i) => (
              <tr key={k} style={{ borderTop: '1px solid #f0f0f0', fontWeight: k.startsWith('9') ? 700 : 400 }}>
                <td style={{ padding: '5px 0', color: '#444' }}>{k}</td>
                <td style={{ padding: '5px 0', textAlign: 'right' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10, color: '#666', fontSize: 13 }}>
          Gross margin {pct(m.grossMarginPct)} · Net margin {pct(m.netMarginPct)}
          {' · '}Waterfall recovers {gbp(m.recoveryContribution)} vs cost {gbp(m.recoveryCostBasis)} (Option C)
        </div>
      </div>

      <p style={{ color: '#666', fontSize: 13, marginTop: 14 }}>
        ✓ Engine live. {status === 'ready' && source ? `Data layer: ${int(source.holdings.length)} holdings loaded.` : ''}
        {' '}Next: Stage 3 — scoping.
      </p>
    </div>
  )
}
