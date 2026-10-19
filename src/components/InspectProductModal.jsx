import { useState, useMemo } from 'react'
import { computeMoney, exVat, vatOfInclusive } from '../money'
import { gbp, gbp0, pct, int, displayDate, hoursOf, shortName } from '../data'
import WaveRows from './WaveRows'

// ============================================================
// INSPECT PRODUCT (🔍) — the deep dive. Six tabs:
// Waves · Performance · Per stream · Profit/hour · P&L · Activity.
// Everything runs through the money engine with the product's VAT treatment.
// Per-stream product contribution uses the SAME per-line net allocation as
// the Export (each line's share of stream net = its gross share × net).
// ============================================================
const TABS = ['Recovery', 'Waves', 'Performance', 'Per stream', 'Profit / hour', 'P&L', 'Activity']

export default function InspectProductModal({ product, scoped, onClose, onEdit }) {
  const [tab, setTab] = useState('Recovery')
  const treatment = product.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'
  const onHand = scoped.holdings.filter((h) => h.stockItemId === product.id).reduce((a, h) => a + (Number(h.qty) || 0), 0)

  const m = useMemo(() => {
    const waves = scoped.waves.filter((w) => w.stockItemId === product.id).sort((a, b) => a.waveNo - b.waveNo)
    const costExVatTotal = waves.reduce((a, w) => a + exVat(w.totalCost, treatment), 0)
    const investedTotal = waves.reduce((a, w) => a + Number(w.totalCost || 0), 0)

    // ---- per-stream contribution of THIS product ----
    const byStream = {}
    for (const s of scoped.streams) {
      const allLive = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const mine = allLive.filter((l) => l.stockItemId === product.id)
      if (mine.length === 0) continue
      const grossOfLines = allLive.reduce((a, l) => a + (Number(l.lineTotal) || 0), 0) || Number(s.totalSales) || 1
      const net = (s.net === null || s.net === undefined) ? Number(s.totalSales) || 0 : Number(s.net) || 0
      let gP = 0, netShare = 0, vatP = 0, netExVatP = 0, costPaid = 0, costExVatP = 0, units = 0
      for (const l of mine) {
        const lg = Number(l.lineTotal) || 0
        const share = grossOfLines > 0 ? (lg / grossOfLines) * net : 0
        const vat = vatOfInclusive(share, treatment)
        const cp = (Number(l.qty) || 0) * (Number(l.unitCost) || 0)
        gP += lg; netShare += share; vatP += vat; netExVatP += share - vat
        costPaid += cp; costExVatP += exVat(cp, treatment); units += Number(l.qty) || 0
      }
      const hrs = hoursOf(s)
      byStream[s.id] = {
        id: s.id, date: s.streamDate, streamer: s.streamerName || '—', platform: s.platform || '',
        units, gross: gP, netExVat: netExVatP, vat: vatP, cost: costPaid, profit: netExVatP - costExVatP,
        hours: hrs, perHour: hrs > 0 ? (netExVatP - costExVatP) / hrs : null,
      }
    }
    const streamRows = Object.values(byStream).sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    // ---- distro contribution ----
    const distro = scoped.distroSales.filter((d) => d.stockItemId === product.id)
      .map((d) => { const mm = computeMoney({ gross: d.revenue, net: d.revenue, costPaid: d.cost, vatTreatment: treatment }); return { d, mm } })

    // ---- totals (stream + distro) ----
    const sSum = streamRows.reduce((a, r) => ({ gross: a.gross + r.gross, netExVat: a.netExVat + r.netExVat, vat: a.vat + r.vat, costPaid: a.costPaid + r.cost, profit: a.profit + r.profit, units: a.units + r.units }), { gross: 0, netExVat: 0, vat: 0, costPaid: 0, profit: 0, units: 0 })
    const dSum = distro.reduce((a, { d, mm }) => ({ gross: a.gross + d.revenue, netExVat: a.netExVat + mm.netExVat, vat: a.vat + mm.vatOwed, costPaid: a.costPaid + d.cost, profit: a.profit + mm.trueProfit, units: a.units + d.qty }), { gross: 0, netExVat: 0, vat: 0, costPaid: 0, profit: 0, units: 0 })
    const grossAll = sSum.gross + dSum.gross
    const netExVatAll = sSum.netExVat + dSum.netExVat
    const vatAll = sSum.vat + dSum.vat
    const costPaidAll = sSum.costPaid + dSum.costPaid
    const costExVatAll = exVat(sSum.costPaid, treatment) + distro.reduce((a, { mm }) => a + mm.costExVat, 0)
    const profitAll = netExVatAll - costExVatAll
    const recovered = netExVatAll
    const recoveryPct = costExVatTotal > 0 ? Math.min(1, recovered / costExVatTotal) : 0

    const totalHours = streamRows.reduce((a, r) => a + (r.hours || 0), 0)

    // ---- activity timeline ----
    const activity = []
    for (const r of streamRows) activity.push({ date: r.date, kind: 'stream', text: `${r.streamer} sold ${int(r.units)} on stream · ${gbp0(r.gross)}`, profit: r.profit })
    for (const { d } of distro) activity.push({ date: d.soldOn, kind: 'distro', text: `Distro ${int(d.qty)}${d.saleChannel === 'b2b' ? ' (B2B' + (d.customerName ? ' · ' + d.customerName : '') + ')' : ''} · ${gbp0(d.revenue)}`, profit: d.profit })
    for (const w of waves) if (w.createdAt) activity.push({ date: String(w.createdAt).slice(0, 10), kind: 'wave', text: `Wave ${w.waveNo} added · ${int(w.qty)} @ ${gbp(w.unitCost)}/unit`, profit: null })
    activity.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    return { waves, streamRows, distro, totals: { grossAll, netExVatAll, vatAll, costPaidAll, costExVatAll, profitAll, units: sSum.units + dSum.units, recovered, recoveryPct, investedTotal, costExVatTotal }, sSum, dSum, totalHours, activity }
  }, [scoped, product.id, treatment])

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', zIndex: 50, overflowY: 'auto', animation: 'modal-fade 0.14s ease-out' }
  const card = { background: '#fff', borderRadius: 16, maxWidth: 820, width: '100%', margin: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.28)', animation: 'modal-rise 0.16s ease-out' }
  const th = { padding: '0 8px 6px', fontSize: 11, color: '#999', fontWeight: 700, textAlign: 'right' }
  const td = { padding: '6px 8px', fontSize: 13, textAlign: 'right', borderTop: '1px solid #f3f3f3' }

  const Stat = ({ label, value, sub, accent }) => (
    <div style={{ flex: '1 1 130px', minWidth: 120, padding: '10px 12px', border: '1px solid #eee', borderRadius: 10 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: accent || '#111' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#888' }}>{sub}</div>}
    </div>
  )

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={card}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px 0' }}>
          <div>
            <h3 style={{ margin: 0 }}>{shortName(product.product)}</h3>
            <div style={{ fontSize: 12, color: '#999' }}>{product.type || 'Uncategorised'}{treatment === 'second_hand' ? ' · 2nd-hand (VAT-free)' : ''}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onEdit && <button className="btn" onClick={onEdit} style={{ fontSize: 13 }}>Edit product &amp; waves</button>}
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#999' }}>×</button>
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '12px 22px 0', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '7px 13px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13,
                fontWeight: tab === t ? 700 : 400, background: tab === t ? '#faf9f7' : 'transparent', color: tab === t ? '#111' : '#888', borderBottom: tab === t ? '2px solid #1a7f37' : '2px solid transparent' }}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: 22, background: '#faf9f7', borderRadius: '0 0 14px 14px', minHeight: 200 }}>
          {/* ---- RECOVERY (V1 waterfall) ---- */}
          {tab === 'Recovery' && (() => {
            const total = m.totals.costExVatTotal || 0
            const contribs = [
              ...m.streamRows.map((r) => ({ date: r.date, label: `${r.streamer}`, value: r.netExVat })),
              ...m.distro.map(({ d, mm }) => ({ date: d.soldOn, label: `Distro${d.customerName ? ' · ' + d.customerName : ''}`, value: mm.netExVat })),
            ].filter((c) => c.value > 0).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
            const scale = Math.max(total, m.totals.recovered, 1)
            const Bar = ({ label, value, colour, strong }) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
                <div style={{ width: 150, fontSize: 12, color: strong ? '#111' : '#666', fontWeight: strong ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                <div style={{ flex: 1, height: 16, background: '#f0efec', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (value / scale) * 100)}%`, height: '100%', background: colour, borderRadius: 5 }} />
                </div>
                <div style={{ width: 90, textAlign: 'right', fontSize: 12, fontWeight: strong ? 700 : 400, color: colour === '#1a7f37' ? '#1a7f37' : '#111' }}>{gbp(value)}</div>
              </div>
            )
            return (
              <div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  <Stat label="Total cost" value={gbp0(total)} />
                  <Stat label="Revenue generated" value={gbp0(m.totals.recovered)} accent="#1a7f37" />
                  <Stat label="Stock on hand" value={int(onHand)} />
                  <Stat label="Left to recover" value={gbp0(Math.max(0, total - m.totals.recovered))} accent="#b8700a" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Cost recovery</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Each stream chips away at this product’s cost until it pays for itself.</div>
                <Bar label="Total cost" value={total} colour="#d9cdbf" strong />
                {contribs.map((c, i) => <Bar key={i} label={`${c.date ? c.date.slice(5) : ''} · ${c.label}`} value={c.value} colour="#9fc7a8" />)}
                <div style={{ borderTop: '2px solid #e8e6e2', marginTop: 6, paddingTop: 2 }}>
                  <Bar label="Recovered so far" value={m.totals.recovered} colour="#1a7f37" strong />
                </div>
                {contribs.length === 0 && <p style={{ color: '#888', marginTop: 10 }}>No sales yet — nothing recovered.</p>}
              </div>
            )
          })()}

          {/* ---- WAVES ---- */}
          {tab === 'Waves' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Wave</th><th style={th}>Qty</th><th style={th}>Unit cost</th><th style={th}>Recovered</th><th style={th}></th></tr></thead>
              <tbody><WaveRows waves={m.waves} productName={product.product} /></tbody>
            </table>
          )}

          {/* ---- PERFORMANCE ---- */}
          {tab === 'Performance' && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Stat label="Units sold" value={int(m.totals.units)} sub={`${int(m.sSum.units)} stream · ${int(m.dSum.units)} distro`} />
                <Stat label="Gross" value={gbp0(m.totals.grossAll)} />
                <Stat label="Net ex-VAT" value={gbp0(m.totals.netExVatAll)} />
                <Stat label="VAT" value={gbp0(m.totals.vatAll)} accent="#b8700a" />
                <Stat label="Realised profit" value={gbp0(m.totals.profitAll)} accent="#1a7f37" />
                <Stat label="Cost recovered" value={pct(m.totals.recoveryPct)} sub={`${gbp0(m.totals.recovered)} of ${gbp0(m.totals.costExVatTotal)} ex-VAT`} />
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 10 }}>Invested in stock (all waves): {gbp0(m.totals.investedTotal)}.</div>
            </>
          )}

          {/* ---- PER STREAM ---- */}
          {tab === 'Per stream' && (
            m.streamRows.length === 0 ? <p style={{ color: '#999' }}>Not sold on any stream yet.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead><tr><th style={{ ...th, textAlign: 'left' }}>Date</th><th style={{ ...th, textAlign: 'left' }}>Streamer</th><th style={th}>Units</th><th style={th}>Gross</th><th style={th}>Profit</th><th style={th}>£/hr</th></tr></thead>
                  <tbody>
                    {m.streamRows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...td, textAlign: 'left' }}>{displayDate(r.date, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                        <td style={{ ...td, textAlign: 'left' }}>{r.streamer}</td>
                        <td style={td}>{int(r.units)}</td><td style={td}>{gbp0(r.gross)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{gbp0(r.profit)}</td>
                        <td style={td}>{r.perHour == null ? '—' : gbp0(r.perHour)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ---- PROFIT / HOUR ---- */}
          {tab === 'Profit / hour' && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Stat label="Stream profit" value={gbp0(m.sSum.profit)} accent="#1a7f37" />
                <Stat label="Hours streamed" value={m.totalHours.toFixed(1)} />
                <Stat label="Profit / hour" value={m.totalHours > 0 ? gbp0(m.sSum.profit / m.totalHours) : '—'} accent="#1a7f37" sub="across streams selling this" />
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 10, marginBottom: 6 }}>Best streams by £/hour (needs logged start/end times):</div>
              {m.streamRows.filter((r) => r.perHour != null).sort((a, b) => b.perHour - a.perHour).slice(0, 6).map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderTop: '1px solid #eee' }}>
                  <span>{displayDate(r.date, { day: 'numeric', month: 'short' })} · {r.streamer}</span>
                  <strong>{gbp0(r.perHour)}/hr</strong>
                </div>
              ))}
              {m.streamRows.every((r) => r.perHour == null) && <div style={{ fontSize: 13, color: '#999' }}>No streams have logged hours yet.</div>}
            </>
          )}

          {/* ---- P&L ---- */}
          {tab === 'P&L' && (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Gross (stream + distro)', m.totals.grossAll],
                  ['VAT', m.totals.vatAll],
                  ['Net ex-VAT', m.totals.netExVatAll],
                  ['Cost paid', m.totals.costPaidAll],
                  ['Cost ex-VAT', m.totals.costExVatAll],
                  ['Realised profit', m.totals.profitAll],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderTop: '1px solid #eee', fontWeight: k === 'Realised profit' ? 700 : 400 }}>
                    <td style={{ padding: '6px 0', color: '#555' }}>{k}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>{gbp(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ---- ACTIVITY ---- */}
          {tab === 'Activity' && (
            m.activity.length === 0 ? <p style={{ color: '#999' }}>No activity yet.</p> : (
              <div>
                {m.activity.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderTop: i ? '1px solid #eee' : 'none' }}>
                    <span style={{ fontSize: 11, color: '#999', minWidth: 72 }}>{displayDate(e.date, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: e.kind === 'stream' ? '#eef3ff' : e.kind === 'distro' ? '#f3f0e8' : '#eafaf0', color: e.kind === 'stream' ? '#2a52be' : e.kind === 'distro' ? '#8a6d1a' : '#1a7f37' }}>{e.kind}</span>
                    <span style={{ fontSize: 13, flex: 1 }}>{e.text}</span>
                    {e.profit != null && <span style={{ fontSize: 13, fontWeight: 700, color: e.profit >= 0 ? '#1a7f37' : '#c82828' }}>{gbp0(e.profit)}</span>}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
