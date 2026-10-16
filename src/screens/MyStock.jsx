import { useMemo, useState, useEffect, useCallback } from 'react'
import { gbp, gbp0, int, toDateKey, parseLocalDate, displayDate, isConsumable, requestConsumable, loadConsumableRequests } from '../data'
import StatCard from '../components/StatCard'
import BarsChart from '../components/BarsChart'

// ============================================================
// MY STOCK (V1 parity) — one page for a shelf-holder (streamer, lead, or an
// admin who runs breaks): their OWN performance (revenue generated, streams,
// hours, products used) + revenue-by-stream bars with a projection trend, then
// the on-hand shelf grouped by CATEGORY (sports / entertainment / TCG …), then
// request consumables. Scoped data is already the viewer's own.
// ============================================================
const hoursOf = (s) => {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart); return d > 0 ? d : 0
}
const addDays = (ymd, n) => { const d = parseLocalDate(ymd); d.setDate(d.getDate() + n); return toDateKey(d) }

export default function MyStock({ scoped }) {
  const uid = scoped.cap?.userId
  const today = toDateKey(new Date())
  const RANGES = [
    { k: 'this', label: 'This week', from: addDays(today, -6), to: today },
    { k: 'prev', label: 'Previous week', from: addDays(today, -13), to: addDays(today, -7) },
    { k: '2wk', label: 'Last 2 weeks', from: addDays(today, -13), to: today },
    { k: '30d', label: 'Last 30 days', from: addDays(today, -29), to: today },
  ]
  const [rangeK, setRangeK] = useState('this')
  const [q, setQ] = useState('')
  const range = RANGES.find((r) => r.k === rangeK)

  // ---- performance (the viewer's own streams in range) ----
  const perf = useMemo(() => {
    const streams = scoped.streams
      .filter((s) => (uid ? s.streamerId === uid : true) && s.streamDate && s.streamDate >= range.from && s.streamDate <= range.to)
      .sort((a, b) => (a.streamDate || '').localeCompare(b.streamDate || ''))
    let revenue = 0, hours = 0, units = 0
    const products = new Set()
    const byDay = {}
    for (const s of streams) {
      const g = Number(s.totalSales) || 0
      revenue += g; hours += hoursOf(s)
      byDay[s.streamDate] = (byDay[s.streamDate] || 0) + g
      for (const l of scoped.streamLines) {
        if (l.streamId === s.id && !l.brokered && l.lineKind !== 'giveaway') { units += Number(l.qty) || 0; if (l.product) products.add(l.product) }
      }
    }
    // One bar per day across the whole rolling window (zeros included).
    const bars = []
    let cur = range.from
    while (cur <= range.to) { bars.push({ label: displayDate(cur, { day: '2-digit', month: 'short' }), value: byDay[cur] || 0 }); cur = addDays(cur, 1) }
    return { streams: streams.length, revenue, hours, units, productCount: products.size, bars }
  }, [scoped, uid, range.from, range.to])

  // ---- on-hand shelf, grouped by product then by CATEGORY ----
  const shelf = useMemo(() => {
    const mine = scoped.holdings.filter((h) => (uid ? h.holderId === uid : !h.isWarehouse) && h.qty > 0)
    const byProduct = {}
    for (const h of mine) {
      const item = scoped.stockItems.find((s) => s.id === h.stockItemId)
      const r = byProduct[h.stockItemId] || (byProduct[h.stockItemId] = { id: h.stockItemId, product: item?.product || '—', category: item?.type || 'Uncategorised', qty: 0, value: 0 })
      r.qty += h.qty; r.value += h.qty * h.unitCost
    }
    let rows = Object.values(byProduct)
    if (q) rows = rows.filter((r) => (r.product + ' ' + r.category).toLowerCase().includes(q.toLowerCase()))
    const cats = {}
    for (const r of rows) { (cats[r.category] || (cats[r.category] = [])).push(r) }
    const groups = Object.entries(cats).map(([category, items]) => ({
      category,
      items: items.sort((a, b) => b.value - a.value),
      units: items.reduce((a, r) => a + r.qty, 0),
      value: items.reduce((a, r) => a + r.value, 0),
    })).sort((a, b) => b.value - a.value)
    const totalUnits = rows.reduce((a, r) => a + r.qty, 0)
    const totalValue = rows.reduce((a, r) => a + r.value, 0)
    return { groups, totalUnits, totalValue, count: rows.length }
  }, [scoped, uid, q])

  const th = { textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '0 10px 6px' }
  const td = { padding: '7px 10px', fontSize: 13, borderTop: '1px solid var(--line)' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>My Stock</h2>
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999, flexWrap: 'wrap' }}>
          {RANGES.map((r) => (
            <button key={r.k} onClick={() => setRangeK(r.k)}
              style={{ padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: rangeK === r.k ? 700 : 400, background: rangeK === r.k ? '#fff' : 'transparent' }}>{r.label}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>{displayDate(range.from, { day: 'numeric', month: 'short' })} – {displayDate(range.to, { day: 'numeric', month: 'short' })} · rolling 7-day</div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
        <StatCard label="Revenue generated" value={gbp0(perf.revenue)} />
        <StatCard label="Streams" value={int(perf.streams)} />
        <StatCard label="Hours streamed" value={perf.hours > 0 ? perf.hours.toFixed(1) : '—'} />
        <StatCard label="Products used" value={int(perf.units)} sub={`${perf.productCount} different`} />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Revenue generated by stream</div>
        {perf.bars.length === 0 ? <p className="note" style={{ margin: 0 }}>No streams with sales in this window.</p> : (
          <BarsChart labels={perf.bars.map((b) => b.label)} values={perf.bars.map((b) => b.value)} formatY={gbp0} projLabel="Projected" height={240} />
        )}
      </div>

      {/* On-hand shelf, grouped by category */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0 12px' }}>
        <StatCard label="Products on shelf" value={int(shelf.count)} />
        <StatCard label="Total units" value={int(shelf.totalUnits)} />
        <StatCard label="Stock value" value={gbp(shelf.totalValue)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>On hand ({int(shelf.totalUnits)} units)</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your stock…"
          style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)', minWidth: 220 }} />
      </div>

      {shelf.groups.length === 0 ? (
        <p className="note">Nothing on your shelf right now.</p>
      ) : shelf.groups.map((g) => (
        <div key={g.category} className="panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontWeight: 800 }}>{g.category}</span>
            <span className="note">{int(g.units)} units · {gbp0(g.value)}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 420 }}>
              <thead><tr><th style={th}>Product</th><th style={{ ...th, textAlign: 'right' }}>Cost / unit</th><th style={{ ...th, textAlign: 'right' }}>Qty on hand</th><th style={{ ...th, textAlign: 'right' }}>Value</th></tr></thead>
              <tbody>
                {g.items.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{shortName(r.product)}</td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>{gbp(r.qty > 0 ? r.value / r.qty : 0)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{int(r.qty)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{gbp0(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <RequestConsumables scoped={scoped} uid={uid} />
    </div>
  )
}

// ---- streamer requests consumables (sleeves, top loaders, etc.) ----
function RequestConsumables({ scoped, uid }) {
  const consumables = useMemo(() => scoped.stockItems.filter((s) => !s.archived && isConsumable(s)).sort((a, b) => a.product.localeCompare(b.product)), [scoped])
  const [stockItemId, setStockItemId] = useState('')
  const [itemText, setItemText] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [mine, setMine] = useState([])

  const loadMine = useCallback(async () => {
    const { rows } = await loadConsumableRequests()
    setMine(rows.filter((r) => r.streamer_id === uid).slice(0, 6))
  }, [uid])
  useEffect(() => { loadMine() }, [loadMine])

  const submit = async () => {
    setErr(null); setMsg(null)
    if (!(Number(qty) > 0)) return setErr('Enter a quantity')
    if (!stockItemId && !itemText.trim()) return setErr('Pick a consumable or describe it')
    setBusy(true)
    try {
      await requestConsumable({ streamerId: uid, stockItemId: stockItemId || null, itemText: stockItemId ? null : itemText, qty: Number(qty), note })
      setMsg('Request sent ✓'); setStockItemId(''); setItemText(''); setQty(''); setNote(''); await loadMine()
    } catch (e) { setErr(e.message || 'Could not send') } finally { setBusy(false) }
  }

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)' }
  const statusPill = (s) => <span className="pill" style={{ background: s === 'fulfilled' ? 'rgba(31,157,85,0.16)' : s === 'declined' ? 'rgba(228,0,43,0.12)' : 'rgba(255,106,0,0.14)', color: s === 'fulfilled' ? 'var(--good)' : s === 'declined' ? 'var(--red)' : 'var(--orange)' }}>{s}</span>

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Request consumables</div>
      <div className="note" style={{ marginTop: 0, marginBottom: 10 }}>Sleeves, top loaders, team bags, labels, postage. Your request goes to the warehouse to fulfil.</div>
      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
      {msg && <div className="ok" style={{ marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        {consumables.length > 0 && (
          <label style={{ fontSize: 13 }}>Consumable<br />
            <select style={{ ...field, marginTop: 4, minWidth: 180 }} value={stockItemId} onChange={(e) => { setStockItemId(e.target.value); if (e.target.value) setItemText('') }}>
              <option value="">Select…</option>
              {consumables.map((s) => <option key={s.id} value={s.id}>{shortName(s.product)}</option>)}
            </select>
          </label>
        )}
        {!stockItemId && (
          <label style={{ fontSize: 13 }}>{consumables.length > 0 ? 'or describe it' : 'Item'}<br />
            <input style={{ ...field, marginTop: 4, minWidth: 160 }} value={itemText} onChange={(e) => setItemText(e.target.value)} placeholder="e.g. Penny sleeves" />
          </label>
        )}
        <label style={{ fontSize: 13 }}>Qty<br /><input style={{ ...field, marginTop: 4, width: 80 }} type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label style={{ fontSize: 13, flex: 1, minWidth: 140 }}>Note<br /><input style={{ ...field, marginTop: 4, width: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></label>
        <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Request'}</button>
      </div>

      {mine.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="note" style={{ marginBottom: 4 }}>Your recent requests</div>
          {mine.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{int(r.qty)} × {r.stock_item_id ? shortName(scoped.stockItems.find((s) => s.id === r.stock_item_id)?.product || '—') : (r.item_text || '—')}</span>
              {statusPill(r.status)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function shortName(p) { return String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '') }
