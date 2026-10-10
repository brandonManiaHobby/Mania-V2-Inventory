import { useState, useMemo } from 'react'
import { computeMoney, sumMoney, exVat } from '../money'
import { gbp0, gbp, pct, int } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'
import StatCard from '../components/StatCard'
import MiniBars from '../components/MiniBars'
import WaveRows from '../components/WaveRows'
import StockPnL from './StockPnL'

// ============================================================
// PRODUCTS (Stage 5 — FULL V1 PARITY + money layers)
// Leaderboard ranking (by the money toggle). Tap -> deep dive: full 9-layer
// P&L, per-wave breakdown, cost recovery (Option C), which streamers sell it,
// and stream-vs-distro split. Sales from stream lines AND distro.
// ============================================================
const short = (p) => String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '')
const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }

export default function Products({ scoped }) {
  const [mode, setMode] = useState('performance')
  const [view, setView] = useState('gross')
  const [openId, setOpenId] = useState(null)
  const field = VIEW_FIELD[view]
  const vatOf = (id) => scoped.stockItems.find((s) => s.id === id)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'

  const rows = useMemo(() => {
    const byItem = {}
    const ensure = (id, product, vat) => byItem[id] || (byItem[id] = {
      id, product, vat, ladders: [], units: 0, streamSales: 0, distroSales: 0, streamerUnits: {},
    })
    for (const l of scoped.streamLines) {
      if (l.brokered || !l.stockItemId) continue
      const item = scoped.stockItems.find((s) => s.id === l.stockItemId); if (!item) continue
      const stream = scoped.streams.find((s) => s.id === l.streamId)
      let lineNet = l.lineTotal
      if (stream && stream.net != null && stream.totalSales > 0) lineNet = (l.lineTotal / stream.totalSales) * stream.net
      const r = ensure(item.id, item.product, item.vatTreatment)
      r.ladders.push(computeMoney({ gross: l.lineTotal, net: lineNet, costPaid: l.qty * l.unitCost, vatTreatment: item.vatTreatment }))
      r.units += l.qty; r.streamSales += l.lineTotal
      if (stream?.streamerName) r.streamerUnits[stream.streamerName] = (r.streamerUnits[stream.streamerName] || 0) + l.qty
    }
    for (const d of scoped.distroSales) {
      const item = scoped.stockItems.find((s) => s.id === d.stockItemId); if (!item) continue
      const r = ensure(item.id, item.product, item.vatTreatment)
      r.ladders.push(computeMoney({ gross: d.revenue, net: d.revenue, costPaid: d.cost, vatTreatment: item.vatTreatment }))
      r.units += d.qty; r.distroSales += d.revenue
    }
    return Object.values(byItem).map((r) => {
      const t = sumMoney(r.ladders)
      const waves = scoped.waves.filter((w) => w.stockItemId === r.id).sort((a, b) => a.waveNo - b.waveNo)
      const costExVatTotal = waves.reduce((a, w) => a + exVat(w.totalCost, r.vat), 0)
      const recovered = t.recoveryContribution
      const recoveryPct = costExVatTotal > 0 ? Math.min(1, recovered / costExVatTotal) : 0
      return { ...r, t, waves, costExVatTotal, recovered, recoveryPct }
    }).filter((r) => r.ladders.length > 0).sort((a, b) => b.t[field.value] - a.t[field.value])
  }, [scoped, field.value])

  const totals = useMemo(() => sumMoney(rows.map((r) => r.t)), [rows])
  const grandMax = Math.max(1, ...rows.map((r) => r.t.gross))

  const modeSeg = (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999 }}>
      {[['performance', 'Performance'], ['totals', 'Totals']].map(([k, l]) => (
        <button key={k} onClick={() => setMode(k)}
          style={{ padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13,
            fontWeight: mode === k ? 700 : 400, background: mode === k ? '#fff' : 'transparent' }}>{l}</button>
      ))}
    </div>
  )

  if (mode === 'totals') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Products</h2>{modeSeg}
        </div>
        <StockPnL scoped={scoped} embedded />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Products</h2>{modeSeg}
        </div>
        <MoneyToggle view={view} onChange={setView} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <StatCard label={LABEL[view]} value={gbp0(totals[field.value])} sub={`${rows.length} products sold`} />
        <StatCard label="VAT owed" value={gbp0(totals.vatOwed)} accent="#b8700a" />
        <StatCard label="True profit" value={gbp0(totals.trueProfit)} accent="#1a7f37" sub={`${pct(totals.netMarginPct)} net margin`} />
      </div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 16, marginBottom: 6 }}>
        Ranked by {LABEL[view].toLowerCase()} · tap for P&L, waves, streamers + recovery
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, rank) => {
          const open = openId === r.id
          return (
            <div key={r.id} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
              <button onClick={() => setOpenId(open ? null : r.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap' }}>
                <div style={{ width: 22, fontWeight: 700, color: '#bbb' }}>{rank + 1}</div>
                <div style={{ flex: '1 1 180px', minWidth: 150 }}>
                  <div style={{ fontWeight: 700 }}>
                    {short(r.product)}
                    {r.vat === 'second_hand' && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#e6f0e6', color: '#1a7f37' }}>VAT-free</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#999' }}>{int(r.units)} sold · {r.waves.length} wave{r.waves.length === 1 ? '' : 's'}</div>
                </div>
                <div style={{ flex: '1 1 150px', minWidth: 130 }}>
                  <MiniBars max={grandMax} formatValue={gbp0} bars={[{ label: 'Gross', value: r.t.gross, colour: '#4a7fe0' }, { label: 'Net', value: r.t.net, colour: '#1a7f37' }]} />
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{gbp0(r.t[field.value])}</div>
                  {field.margin && <div style={{ fontSize: 12, color: '#888' }}>{pct(r.t[field.margin])}</div>}
                </div>
              </button>

              {open && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Full P&L</div>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <tbody>
                      {[['Gross', r.t.gross], ['Fees', r.t.fees], ['Net', r.t.net], ['VAT portion', r.t.vatPortion], ['Net ex-VAT', r.t.netExVat], ['Cost paid', r.t.costPaid], ['Cost ex-VAT', r.t.costExVat], ['Gross margin', r.t.grossMargin], ['VAT owed', r.t.vatOwed], ['True profit', r.t.trueProfit]].map(([k, v]) => (
                        <tr key={k} style={{ borderTop: '1px solid #f5f5f5', fontWeight: k === 'True profit' ? 700 : 400 }}>
                          <td style={{ padding: '4px 0', color: '#555' }}>{k}</td><td style={{ padding: '4px 0', textAlign: 'right' }}>{gbp(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* stream vs distro split */}
                  <div style={{ fontSize: 13, margin: '12px 0' }}>
                    <span style={{ color: '#999' }}>Channel split: </span>
                    <strong>{gbp0(r.streamSales)} stream</strong>{r.distroSales > 0 && <> · <strong>{gbp0(r.distroSales)} distro</strong></>}
                  </div>

                  {/* per-wave breakdown */}
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Waves</div>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 10 }}>
                    <thead><tr style={{ color: '#999', textAlign: 'right' }}><th style={{ textAlign: 'left' }}>Wave</th><th>Qty</th><th>Unit cost</th><th>Recovered</th><th></th></tr></thead>
                    <tbody>
                      <WaveRows waves={r.waves} productName={r.product} />
                    </tbody>
                  </table>

                  {/* which streamers sell it */}
                  {Object.keys(r.streamerUnits).length > 0 && (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Sold by</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {Object.entries(r.streamerUnits).sort((a, b) => b[1] - a[1]).map(([name, u]) => (
                          <span key={name} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: '#f5f4f1' }}>{name}: {int(u)}</span>
                        ))}
                      </div>
                    </>
                  )}

                  {/* recovery bar */}
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Cost recovery (net ex-VAT vs cost ex-VAT)</div>
                  <div style={{ height: 12, background: '#f0efec', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${r.recoveryPct * 100}%`, height: '100%', background: r.recoveryPct >= 1 ? '#1a7f37' : '#d9820a', borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {gbp0(r.recovered)} of {gbp0(r.costExVatTotal)} · {pct(r.recoveryPct)}{r.recoveryPct >= 1 ? ' · paid off ✓' : ''}
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
