import { useMemo, useState } from 'react'
import { computeStream, sumMoney } from '../money'
import { gbp, gbp0, int, displayDate, shortName, toDateKey, parseLocalDate } from '../data'
import StatCard from './StatCard'
import BarsChart from './BarsChart'

// ============================================================
// STREAMER INSPECT — a MyStock-style performance modal for ANY streamer,
// openable from Teams / Performance. Revenue, streams, hours, products used,
// and a revenue-by-day bar graph, over a pickable window (this/last week,
// this month, or a custom range). Blurred pop modal, consistent with the app.
// ============================================================
const hoursOf = (s) => {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  let d = p(s.streamEnd) - p(s.streamStart); if (d < 0) d += 24; return d > 0 ? d : 0
}
const todayKey = () => toDateKey(new Date())
function weekBounds(offset = 0) {
  const now = new Date()
  const day = (now.getDay() + 6) % 7            // 0 = Monday
  const mon = new Date(now); mon.setDate(now.getDate() - day + offset * 7)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { from: toDateKey(mon), to: toDateKey(sun) }
}
function monthBounds() {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth()
  const last = new Date(y, m + 1, 0).getDate()
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

const PRESETS = [
  { k: 'week', label: 'This week' },
  { k: 'lastweek', label: 'Last week' },
  { k: 'month', label: 'This month' },
  { k: 'range', label: 'Range' },
]

export default function StreamerInspectModal({ person, scoped, onClose }) {
  const [preset, setPreset] = useState('month')
  const [from, setFrom] = useState(monthBounds().from)
  const [to, setTo] = useState(todayKey())

  const range = useMemo(() => {
    if (preset === 'week') return weekBounds(0)
    if (preset === 'lastweek') return weekBounds(-1)
    if (preset === 'month') return monthBounds()
    return { from, to }
  }, [preset, from, to])

  const vatOf = (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'

  const perf = useMemo(() => {
    const streams = scoped.streams
      .filter((s) => s.streamerId === person.id && s.streamDate && s.streamDate >= range.from && s.streamDate <= range.to)
      .sort((a, b) => (a.streamDate || '').localeCompare(b.streamDate || ''))
    let hours = 0, units = 0
    const products = new Set()
    const ladders = []
    const byDay = {}
    for (const s of streams) {
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      ladders.push(computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping, promo: s.promo },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf))
      hours += hoursOf(s)
      const g = Number(s.totalSales) || 0
      const d = byDay[s.streamDate] || (byDay[s.streamDate] = { total: 0, items: [] })
      d.total += g; d.items.push({ title: s.title || s.streamType || 'Stream', value: g })
      for (const l of lines) { if (l.lineKind !== 'giveaway') { units += Number(l.qty) || 0; if (l.product) products.add(l.product) } }
    }
    const t = sumMoney(ladders)
    const bars = Object.keys(byDay).filter((d) => byDay[d].total > 0).sort().map((d) => ({
      label: displayDate(d, { day: '2-digit', month: 'short' }),
      value: byDay[d].total,
      meta: [`${byDay[d].items.length} stream${byDay[d].items.length === 1 ? '' : 's'}`,
        ...byDay[d].items.map((it) => `${shortName(it.title).slice(0, 28)} · ${gbp(it.value)}`)],
    }))
    return {
      streams: streams.length, hours, units, productCount: products.size,
      products: [...products], gross: t.gross, profit: t.trueProfit,
      revPerHour: hours > 0 ? t.gross / hours : null, bars,
    }
  }, [scoped, person.id, range])

  const presetBtn = (k, l) => (
    <button key={k} onClick={() => setPreset(k)} style={{ padding: '6px 13px', borderRadius: 999, border: '1px solid ' + (preset === k ? 'var(--orange, #e8702a)' : '#ddd'), background: preset === k ? 'var(--orange, #e8702a)' : '#fff', color: preset === k ? '#fff' : '#777', fontWeight: preset === k ? 700 : 500, cursor: 'pointer', fontSize: 13 }}>{l}</button>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', zIndex: 60, overflowY: 'auto', animation: 'modal-fade 0.14s ease-out' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 720, width: '100%', margin: 'auto', padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.28)', animation: 'modal-rise 0.16s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 11, height: 11, borderRadius: 999, background: person.colour || '#ccc', display: 'inline-block' }} />
            {person.name}
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#999' }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>{range.from} → {range.to}</div>

        {/* range picker */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>{PRESETS.map((p) => presetBtn(p.k, p.label))}</div>
        {preset === 'range' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: '#777' }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }} /></label>
            <label style={{ fontSize: 12, color: '#777' }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }} /></label>
          </div>
        )}

        {/* headline stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          <StatCard label="Revenue generated" value={gbp(perf.gross)} accent="#111" />
          <StatCard label="Streams" value={int(perf.streams)} />
          <StatCard label="Hours streamed" value={perf.hours > 0 ? perf.hours.toFixed(1) : '—'} />
          <StatCard label="Revenue / hour" value={perf.revPerHour != null ? gbp0(perf.revPerHour) : '—'} />
          <StatCard label="Products used" value={int(perf.units)} sub={`${perf.productCount} different`} />
          <StatCard label="Profit" value={gbp(perf.profit)} accent="#1a7f37" />
        </div>

        {/* revenue-by-day bars */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Revenue by day</div>
          {perf.bars.length === 0
            ? <p style={{ color: '#999', fontSize: 13 }}>No streams in this window.</p>
            : <BarsChart labels={perf.bars.map((b) => b.label)} values={perf.bars.map((b) => b.value)} meta={perf.bars.map((b) => b.meta)} formatY={gbp0} showProjection={false} height={230} barColor="#3a6fd8" />}
        </div>

        {/* products used */}
        {perf.products.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Products used</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {perf.products.map((p, i) => <span key={i} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: '#f5f4f1' }}>{shortName(p)}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
