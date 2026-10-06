import { useState, useMemo } from 'react'
import { computeMoney, sumMoney } from '../money'
import { gbp0, gbp, pct } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'
import StatCard from '../components/StatCard'
import MiniBars from '../components/MiniBars'

// ============================================================
// PRODUCTS (Stage 5) — per-product performance with the full P&L ladder
// and wave recovery (Option C: net ex-VAT vs cost ex-VAT) on expand.
// Sales come from BOTH stream lines and distro sales. VAT per product
// treatment. Everything via the money engine.
// ============================================================
export default function Products({ scoped }) {
  const [view, setView] = useState('gross')
  const [openId, setOpenId] = useState(null)
  const field = VIEW_FIELD[view]

  const rows = useMemo(() => {
    const byItem = {}
    const ensure = (id, product, vat) => byItem[id] || (byItem[id] = {
      id, product, vat, ladders: [], units: 0,
    })

    // Stream-line sales (net apportioned via the parent stream's net).
    for (const l of scoped.streamLines) {
      if (l.brokered || !l.stockItemId) continue
      const item = scoped.stockItems.find((s) => s.id === l.stockItemId)
      if (!item) continue
      const stream = scoped.streams.find((s) => s.id === l.streamId)
      // net share: if the stream has a net, apportion by this line's gross share.
      let lineNet = l.lineTotal
      if (stream && stream.net != null && stream.totalSales > 0) {
        lineNet = (l.lineTotal / stream.totalSales) * stream.net
      }
      const r = ensure(item.id, item.product, item.vatTreatment)
      r.ladders.push(computeMoney({
        gross: l.lineTotal, net: lineNet, costPaid: l.qty * l.unitCost,
        vatTreatment: item.vatTreatment,
      }))
      r.units += l.qty
    }

    // Distro sales (no platform fees -> net = gross).
    for (const d of scoped.distroSales) {
      const item = scoped.stockItems.find((s) => s.id === d.stockItemId)
      if (!item) continue
      const r = ensure(item.id, item.product, item.vatTreatment)
      r.ladders.push(computeMoney({
        gross: d.revenue, net: d.revenue, costPaid: d.cost,
        vatTreatment: item.vatTreatment,
      }))
      r.units += d.qty
    }

    return Object.values(byItem).map((r) => {
      const t = sumMoney(r.ladders)
      // wave recovery (Option C): cumulative net ex-VAT vs total cost ex-VAT
      const waves = scoped.waves.filter((w) => w.stockItemId === r.id)
      const costExVatTotal = waves.reduce((a, w) => a + (r.vat === 'second_hand' ? w.totalCost : w.totalCost / 1.2), 0)
      const recovered = t.recoveryContribution
      const recoveryPct = costExVatTotal > 0 ? Math.min(1, recovered / costExVatTotal) : 0
      return { ...r, t, costExVatTotal, recovered, recoveryPct, waveCount: waves.length }
    }).filter((r) => r.ladders.length > 0)
      .sort((a, b) => b.t[field.value] - a.t[field.value])
  }, [scoped, field.value])

  const totals = useMemo(() => sumMoney(rows.map((r) => r.t)), [rows])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Products</h2>
        <MoneyToggle view={view} onChange={setView} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <StatCard label={LABEL[view]} value={gbp0(totals[field.value])} sub={`${rows.length} products sold`} />
        <StatCard label="VAT owed" value={gbp0(totals.vatOwed)} accent="#b8700a" />
        <StatCard label="True profit" value={gbp0(totals.trueProfit)} accent="#1a7f37" sub={`${pct(totals.netMarginPct)} net margin`} />
      </div>

      <div style={{ fontSize: 12, color: '#999', marginTop: 16, marginBottom: 6 }}>
        Ranked by {LABEL[view].toLowerCase()} · tap a product for its full P&L + wave recovery
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const open = openId === r.id
          return (
            <div key={r.id} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
              <button onClick={() => setOpenId(open ? null : r.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 14px',
                  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px', minWidth: 150 }}>
                  <div style={{ fontWeight: 700 }}>
                    {shortName(r.product)}
                    {r.vat === 'second_hand' && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#e6f0e6', color: '#1a7f37' }}>VAT-free</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#999' }}>{r.units} sold · {r.waveCount} wave{r.waveCount === 1 ? '' : 's'}</div>
                </div>
                <div style={{ flex: '1 1 150px', minWidth: 130 }}>
                  <MiniBars max={Math.max(1, ...rows.map((x) => x.t.gross))} formatValue={gbp0}
                    bars={[
                      { label: 'Gross', value: r.t.gross, colour: '#4a7fe0' },
                      { label: 'Net', value: r.t.net, colour: '#1a7f37' },
                    ]} />
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{gbp0(r.t[field.value])}</div>
                  {field.margin && <div style={{ fontSize: 12, color: '#888' }}>{pct(r.t[field.margin])}</div>}
                </div>
              </button>

              {open && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 14px' }}>
                  {/* Full 9-layer P&L */}
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Full P&L</div>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['Gross', r.t.gross], ['Fees', r.t.fees], ['Net', r.t.net],
                        ['VAT portion', r.t.vatPortion], ['Net ex-VAT', r.t.netExVat],
                        ['Cost paid', r.t.costPaid], ['Cost ex-VAT', r.t.costExVat],
                        ['Gross margin', r.t.grossMargin], ['VAT owed', r.t.vatOwed], ['True profit', r.t.trueProfit],
                      ].map(([k, v]) => (
                        <tr key={k} style={{ borderTop: '1px solid #f5f5f5', fontWeight: k === 'True profit' ? 700 : 400 }}>
                          <td style={{ padding: '4px 0', color: '#555' }}>{k}</td>
                          <td style={{ padding: '4px 0', textAlign: 'right' }}>{gbp(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Wave recovery (Option C) */}
                  <div style={{ fontWeight: 700, fontSize: 13, margin: '12px 0 6px' }}>
                    Cost recovery (net ex-VAT vs cost ex-VAT)
                  </div>
                  <div style={{ height: 12, background: '#f0efec', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${r.recoveryPct * 100}%`, height: '100%', background: r.recoveryPct >= 1 ? '#1a7f37' : '#d9820a', borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {gbp0(r.recovered)} recovered of {gbp0(r.costExVatTotal)} cost ex-VAT · {pct(r.recoveryPct)}
                    {r.recoveryPct >= 1 ? ' · paid off ✓' : ''}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {rows.length === 0 && <p style={{ color: '#888' }}>No product sales in scope.</p>}
      </div>
    </div>
  )
}

function shortName(p) {
  return String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '')
}
const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }
