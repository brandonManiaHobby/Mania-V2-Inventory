import { useState, useMemo } from 'react'
import { computeStream, computeMoney, sumMoney, projectPeriod, monthFractionElapsed } from '../money'
import { gbp0, gbp, pct, int, monthKey, parseLocalDate, todayKey } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'
import StatCard from '../components/StatCard'
import MiniBars from '../components/MiniBars'
import BarsChart from '../components/BarsChart'

// ============================================================
// STREAMERS (Stage 5 — FULL V1 PARITY + money layers)
// List with gap bars + rank. Tap -> deep dive: month-by-month trend,
// vs-prior-period delta, product sub-sections (what they sell + margins),
// owned vs brokered split. Money toggle throughout.
// ============================================================
function hoursOf(s) {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  let d = p(s.streamEnd) - p(s.streamStart)
  if (d < 0) d += 24   // overnight streams cross midnight
  return d > 0 ? d : 0
}
const monL = (m) => { const d = parseLocalDate(m + '-01'); return d ? d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : m }
const short = (p) => String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '')
const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }

// Distinct colour per streamer — their saved colour if set, else a stable one
// from the name (never orange, which is reserved for the brand).
const FALLBACK = ['#2563eb', '#16a34a', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#0d9488', '#7c3aed', '#c026d3', '#4a7fe0']
function colourOf(name, map) {
  if (map && map[name]) return map[name]
  let h = 0; const s = String(name || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return FALLBACK[h % FALLBACK.length]
}
const monthLabel = (ym) => { const [y, m] = String(ym).split('-').map(Number); return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
const dayLabel = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }

export default function Streamers({ scoped }) {
  const [view, setView] = useState('gross')
  const [openId, setOpenId] = useState(null)
  const [who, setWho] = useState('all')          // streamer filter toggle
  const [boardOpen, setBoardOpen] = useState(false)
  const [bizOpen, setBizOpen] = useState(false)
  const field = VIEW_FIELD[view]
  const vatOf = (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'
  const colourMap = useMemo(() => Object.fromEntries(scoped.profiles.filter((p) => p.colour).map((p) => [p.name, p.colour])), [scoped])

  // ---- date range — defaults to THIS WEEK (Mon–today), like V1 ----
  const today = todayKey()
  const mondayOf = (ymd) => { const d = new Date(ymd); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString().slice(0, 10) }
  const lifetimeFrom = useMemo(() => {
    const ds = scoped.streams.map((s) => s.streamDate).filter(Boolean).sort()
    return ds[0] || (today.slice(0, 5) + '01-01')
  }, [scoped, today])
  const [from, setFrom] = useState(() => mondayOf(today))
  const [to, setTo] = useState(today)
  const [lifetime, setLifetime] = useState(false)
  const effFrom = lifetime ? lifetimeFrom : from
  const effTo = lifetime ? today : to
  const preset = (f, t) => { setLifetime(false); setFrom(f); setTo(t) }

  const allRows = useMemo(() => {
    const by = {}
    for (const s of scoped.streams) {
      if (!s.streamerId) continue
      if (s.streamDate && (s.streamDate < effFrom || s.streamDate > effTo)) continue
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const m = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
      const r = by[s.streamerId] || (by[s.streamerId] = { id: s.streamerId, name: s.streamerName || '—', streams: [], ladders: [], shows: 0, hours: 0, peak: 0 })
      r.streams.push(s); r.ladders.push({ ...m, month: monthKey(s.streamDate) }); r.shows += 1; r.hours += hoursOf(s)
      r.peak = Math.max(r.peak, Number(s.totalSales) || 0)
    }
    return Object.values(by).map((r) => ({ ...r, t: sumMoney(r.ladders), revPerHour: r.hours > 0 ? sumMoney(r.ladders).gross / r.hours : 0 }))
      .sort((a, b) => b.t[field.value] - a.t[field.value])
  }, [scoped, field.value, effFrom, effTo])

  // The streamer toggle scopes the view (headline, chart, ranked list); the
  // leaderboards below still rank across everyone in the period.
  const rows = useMemo(() => who === 'all' ? allRows : allRows.filter((r) => r.id === who), [allRows, who])
  const grandMax = Math.max(1, ...rows.map((r) => r.t.gross))
  const totals = useMemo(() => sumMoney(rows.map((r) => r.t)), [rows])

  // ---- Streamer leaderboard (period, everyone) ----
  const MIN_SHOWS = 3
  const leaderboard = useMemo(() => {
    const all = allRows
    const ranked = all.filter((r) => r.shows >= MIN_SHOWS)
    const top = (src, val, fmt) => {
      const sorted = [...src].filter((r) => val(r) > 0).sort((a, b) => val(b) - val(a))
      return { winner: sorted[0]?.name || '—', value: sorted[0] ? fmt(val(sorted[0])) : '—', runners: sorted.slice(1, 3).map((r) => `${r.name} ${fmt(val(r))}`) }
    }
    return {
      unranked: all.filter((r) => r.shows < MIN_SHOWS).sort((a, b) => b.shows - a.shows),
      cats: [
        { key: 'Most sales', ...top(all, (r) => r.t.gross, gbp0) },
        { key: 'Most shows', ...top(all, (r) => r.shows, (v) => String(v)) },
        { key: 'Most hours', ...top(all, (r) => r.hours, (v) => v.toFixed(1) + 'h') },
        { key: 'Best profit', ...top(all, (r) => r.t.trueProfit, gbp0) },
        { key: 'Best avg / show', ...top(ranked, (r) => r.shows ? r.t.gross / r.shows : 0, gbp0) },
        { key: 'Best rev / hour', ...top(ranked, (r) => r.revPerHour, gbp0) },
        { key: 'Best margin', ...top(ranked, (r) => r.t.netMarginPct, pct), note: 'total profit ÷ total revenue' },
      ],
    }
  }, [allRows])

  // ---- Business leaderboard (all-time records, every stream on record) ----
  const biz = useMemo(() => {
    const perStream = scoped.streams.filter((s) => s.streamDate).map((s) => {
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const m = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
      return { date: s.streamDate, month: s.streamDate.slice(0, 7), channel: (s.channel || '').trim() || '—', platform: s.platform || '—', streamer: s.streamerName || '—', title: s.title || s.streamType || 'Stream', gross: m.gross, profit: m.trueProfit }
    })
    const sumBy = (keyFn, valFn) => { const m = {}; for (const r of perStream) { const k = keyFn(r); if (k == null) continue; m[k] = (m[k] || 0) + valFn(r) } return Object.entries(m).sort((a, b) => b[1] - a[1])[0] || null }
    const countBy = (keyFn) => { const m = {}; for (const r of perStream) { const k = keyFn(r); m[k] = (m[k] || 0) + 1 } return Object.entries(m).sort((a, b) => b[1] - a[1])[0] || null }
    return {
      count: perStream.length,
      gmvDay: sumBy((r) => r.date, (r) => r.gross),
      gmvMonth: sumBy((r) => r.month, (r) => r.gross),
      topChannel: sumBy((r) => r.channel, (r) => r.gross),
      topPlatform: sumBy((r) => r.platform, (r) => r.gross),
      profitDay: sumBy((r) => r.date, (r) => r.profit),
      busiest: countBy((r) => r.date),
      biggest: perStream.slice().sort((a, b) => b.gross - a.gross)[0] || null,
    }
  }, [scoped])

  const dateField = { padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', fontSize: 13, background: 'var(--card)', color: 'var(--ink)' }
  const thisYear = today.slice(0, 5) + '01-01'
  const shift = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  const monday = (() => { const d = new Date(today); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString().slice(0, 10) })()
  const lastMon = shift(monday, -7), lastSun = shift(monday, -1), monthStart = today.slice(0, 8) + '01'
  const isRange = (f, t) => !lifetime && effFrom === f && effTo === t
  const PRESETS = [
    ['This week', monday, today], ['Last week', lastMon, lastSun], ['2 weeks', lastMon, today],
    ['This month', monthStart, today], ['This year', thisYear, today],
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Streamers</h2>
        <MoneyToggle view={view} onChange={setView} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginTop: 12 }}>
        <label style={{ fontSize: 12, color: '#999' }}>From<br /><input type="date" style={{ ...dateField, marginTop: 4 }} value={effFrom} max={effTo} onChange={(e) => { setLifetime(false); setFrom(e.target.value) }} /></label>
        <label style={{ fontSize: 12, color: '#999' }}>To<br /><input type="date" style={{ ...dateField, marginTop: 4 }} value={effTo} min={effFrom} max={today} onChange={(e) => { setLifetime(false); setTo(e.target.value) }} /></label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(([label, f, t]) => (
            <button key={label} onClick={() => preset(f, t)} className={'chip' + (isRange(f, t) ? ' on' : '')}>{label}</button>
          ))}
          <button onClick={() => setLifetime(true)} className={'chip' + (lifetime ? ' on' : '')}>Lifetime</button>
        </div>
        <label style={{ fontSize: 12, color: '#999', marginLeft: 'auto' }}>Streamer<br />
          <select style={{ ...dateField, marginTop: 4, minWidth: 150 }} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">Everyone</option>
            {allRows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      </div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
        {lifetime ? 'Lifetime — every stream on record' : `${effFrom} → ${effTo}`}{who !== 'all' ? ` · ${rows[0]?.name || ''}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <StatCard label={LABEL[view]} value={gbp0(totals[field.value])} sub={`${rows.length} streamers`} />
        <StatCard label="Fees paid" value={gbp0(totals.fees)} accent="#c0392b" />
        <StatCard label="True profit" value={gbp0(totals.trueProfit)} accent="#1a7f37" sub={`${pct(totals.netMarginPct)} net margin`} />
      </div>

      {/* Two collapsible leaderboards — streamers + business records */}
      <Collapsible
        title="Streamer leaderboard"
        subtitle={`Top: ${leaderboard.cats[0].winner} · ${leaderboard.cats[0].value}`}
        open={boardOpen} onToggle={() => setBoardOpen((o) => !o)}>
        <p className="note" style={{ marginTop: 0 }}>{lifetime ? 'Lifetime' : `${effFrom} → ${effTo}`} · rate categories need {MIN_SHOWS}+ shows. Below that, figures still show but aren&rsquo;t ranked.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {leaderboard.cats.map((c) => (
            <LbCard key={c.key} label={c.key} name={c.winner} value={c.value} sub={[c.runners.join(' · '), c.note].filter(Boolean).join(' · ')} />
          ))}
          {leaderboard.unranked.length > 0 && (
            <div style={{ flex: '1 1 150px', minWidth: 140, padding: '12px 14px', border: '1px dashed var(--line)', borderRadius: 12, background: 'var(--card)', opacity: 0.85 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--muted)', fontWeight: 700 }}>Not ranked yet</div>
              {leaderboard.unranked.slice(0, 4).map((r) => (
                <div key={r.id} className="note" style={{ fontSize: 12, marginTop: 2 }}>{r.name} · {r.shows} show{r.shows === 1 ? '' : 's'} · {gbp0(r.t.gross)}</div>
              ))}
              <div className="note" style={{ fontSize: 11, marginTop: 2 }}>Ranked from {MIN_SHOWS} shows</div>
            </div>
          )}
        </div>
      </Collapsible>

      <Collapsible
        title="Business leaderboard"
        subtitle={biz.gmvDay ? `Highest GMV day: ${gbp0(biz.gmvDay[1])}` : 'All-time records'}
        open={bizOpen} onToggle={() => setBizOpen((o) => !o)}>
        <p className="note" style={{ marginTop: 0 }}>All-time records across every stream on record ({int(biz.count)} streams).</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <LbCard label="Highest GMV day" name={biz.gmvDay ? gbp0(biz.gmvDay[1]) : '—'} value={biz.gmvDay ? dayLabel(biz.gmvDay[0]) : ''} />
          <LbCard label="Highest GMV month" name={biz.gmvMonth ? gbp0(biz.gmvMonth[1]) : '—'} value={biz.gmvMonth ? monthLabel(biz.gmvMonth[0]) : ''} />
          <LbCard label="Top channel" name={biz.topChannel ? biz.topChannel[0] : '—'} value={biz.topChannel ? gbp0(biz.topChannel[1]) : ''} />
          <LbCard label="Top platform" name={biz.topPlatform ? biz.topPlatform[0] : '—'} value={biz.topPlatform ? gbp0(biz.topPlatform[1]) : ''} />
          <LbCard label="Biggest single stream" name={biz.biggest ? gbp0(biz.biggest.gross) : '—'} value={biz.biggest ? short(biz.biggest.title) : ''} sub={biz.biggest ? `${dayLabel(biz.biggest.date)} · ${biz.biggest.streamer}` : ''} />
          <LbCard label="Best day (profit)" name={biz.profitDay ? gbp0(biz.profitDay[1]) : '—'} value={biz.profitDay ? dayLabel(biz.profitDay[0]) : ''} />
          <LbCard label="Busiest day" name={biz.busiest ? `${biz.busiest[1]} streams` : '—'} value={biz.busiest ? dayLabel(biz.busiest[0]) : ''} />
        </div>
      </Collapsible>

      {/* Everyone at a glance — horizontal bars, one per streamer, distinct colours */}
      {rows.length > 0 && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{who === 'all' ? 'Total' : rows[0]?.name + ' —'} {LABEL[view].toLowerCase()} by streamer</div>
          <StreamerBars rows={rows} field={field} colourMap={colourMap} />
        </div>
      )}

      <div style={{ fontSize: 12, color: '#999', marginTop: 16, marginBottom: 6 }}>
        Ranked by {LABEL[view].toLowerCase()} · bars = gross (blue) vs net (green) · tap for the deep dive
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, rank) => (
          <div key={r.id} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
            <button onClick={() => setOpenId(openId === r.id ? null : r.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap' }}>
              <div style={{ width: 22, fontWeight: 700, color: '#bbb' }}>{rank + 1}</div>
              <div style={{ flex: '1 1 130px', minWidth: 110 }}>
                <div style={{ fontWeight: 700 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{r.shows} shows{r.hours > 0 ? ` · ${r.hours.toFixed(1)}h · ${gbp0(r.revPerHour)}/h` : ''}</div>
              </div>
              <div style={{ flex: '1 1 150px', minWidth: 130 }}>
                <MiniBars max={grandMax} formatValue={gbp0} bars={[{ label: 'Gross', value: r.t.gross, colour: '#4a7fe0' }, { label: 'Net', value: r.t.net, colour: '#1a7f37' }]} />
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{gbp0(r.t[field.value])}</div>
                {field.margin && <div style={{ fontSize: 12, color: '#888' }}>{pct(r.t[field.margin])}</div>}
              </div>
            </button>
            {openId === r.id && <StreamerDeep r={r} scoped={scoped} view={view} field={field} vatOf={vatOf} />}
          </div>
        ))}
        {rows.length === 0 && <p style={{ color: '#888' }}>No streamer data in scope.</p>}
      </div>
    </div>
  )
}

function StreamerDeep({ r, scoped, view, field, vatOf }) {
  const dive = useMemo(() => {
    const bm = {}
    for (const l of r.ladders) { if (!l.month) continue; bm[l.month] = bm[l.month] || []; bm[l.month].push(l) }
    const months = Object.keys(bm).sort()
    const monthly = months.map((m) => ({ m, t: sumMoney(bm[m]) }))
    const lastTwo = monthly.slice(-2)
    const delta = lastTwo.length === 2 ? lastTwo[1].t[field.value] - lastTwo[0].t[field.value] : null
    const deltaPct = (lastTwo.length === 2 && lastTwo[0].t[field.value]) ? delta / lastTwo[0].t[field.value] : null

    const byProduct = {}; let brokeredSales = 0, ownedSales = 0
    for (const s of r.streams) {
      for (const l of scoped.streamLines.filter((x) => x.streamId === s.id)) {
        if (l.brokered) { brokeredSales += l.lineTotal; continue }
        ownedSales += l.lineTotal
        const item = scoped.stockItems.find((x) => x.id === l.stockItemId)
        const name = item?.product || l.product || '—'
        const key = l.stockItemId || name
        const m = computeMoney({ gross: l.lineTotal, net: l.lineTotal, costPaid: l.qty * l.unitCost, vatTreatment: vatOf(l.stockItemId) })
        const p = byProduct[key] || (byProduct[key] = { name, units: 0, ladders: [] })
        p.units += l.qty; p.ladders.push(m)
      }
    }
    const products = Object.values(byProduct).map((p) => ({ ...p, t: sumMoney(p.ladders) })).sort((a, b) => b.t.gross - a.t.gross)
    return { monthly, delta, deltaPct, products, brokeredSales, ownedSales }
  }, [r, scoped, field.value, vatOf])

  const tile = { flex: '1 1 110px', minWidth: 96, padding: '10px 12px', border: '1px solid #eee', borderRadius: 10, background: '#faf9f7' }
  const tileLbl = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, color: '#999', fontWeight: 700 }
  const tileVal = { fontSize: 18, fontWeight: 700, marginTop: 2 }

  return (
    <div style={{ borderTop: '1px solid #f0f0f0', padding: '14px' }}>
      {/* lifetime / period snapshot */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={tile}><div style={tileLbl}>Streams</div><div style={tileVal}>{int(r.shows)}</div></div>
        <div style={tile}><div style={tileLbl}>Hours</div><div style={tileVal}>{r.hours > 0 ? r.hours.toFixed(1) : '—'}</div></div>
        <div style={tile}><div style={tileLbl}>Peak stream</div><div style={tileVal}>{gbp0(r.peak)}</div></div>
        <div style={tile}><div style={tileLbl}>Avg / stream</div><div style={tileVal}>{gbp0(r.shows > 0 ? r.t.gross / r.shows : 0)}</div></div>
        <div style={tile}><div style={tileLbl}>Rev / hour</div><div style={tileVal}>{r.hours > 0 ? gbp0(r.revPerHour) : '—'}</div></div>
        <div style={tile}><div style={tileLbl}>Profit</div><div style={{ ...tileVal, color: r.t.trueProfit >= 0 ? '#1a7f37' : '#c82828' }}>{gbp0(r.t.trueProfit)}</div></div>
      </div>
      {dive.delta != null && (
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <span style={{ color: '#999' }}>vs previous month: </span>
          <strong style={{ color: dive.delta >= 0 ? '#1a7f37' : '#c82828' }}>
            {dive.delta >= 0 ? '▲ +' : '▼ '}{gbp0(Math.abs(dive.delta))}{dive.deltaPct != null ? ` (${pct(Math.abs(dive.deltaPct))})` : ''}
          </strong>
        </div>
      )}
      {dive.monthly.length > 1 && (() => {
        const now = new Date()
        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const vals = dive.monthly.map((x) => x.t[field.value])
        const lastIsCur = dive.monthly[dive.monthly.length - 1].m === curKey
        const proj = lastIsCur ? projectPeriod(vals.slice(0, -1), vals[vals.length - 1], monthFractionElapsed(now)) : null
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Month by month ({LABEL[view]}){proj ? ` · ${monL(curKey)} projected ${gbp0(proj.projected)}` : ''}</div>
            <BarsChart height={180} labels={dive.monthly.map((x) => monL(x.m))} values={vals} formatY={gbp0}
              showProjection={false} projLabel="Projected"
              projectedBar={proj ? { index: vals.length - 1, total: proj.projected, color: '#b4440a' } : null} />
          </div>
        )
      })()}
      {dive.brokeredSales > 0 && (
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          <span style={{ color: '#999' }}>Owned vs brokered: </span>
          <strong>{gbp0(dive.ownedSales)} owned</strong> · <strong>{gbp0(dive.brokeredSales)} brokered</strong>
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Products ran</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 560 }}>
          <thead><tr style={{ textAlign: 'right', color: '#999', fontSize: 12 }}>
            <th style={{ textAlign: 'left' }}>Product</th><th>Units</th><th>Gross</th><th>Cost/unit</th><th>Profit/unit</th><th>Profit</th><th>Margin</th>
          </tr></thead>
          <tbody>
            {dive.products.map((p) => {
              const costPerUnit = p.units > 0 ? p.t.costPaid / p.units : 0
              const profitPerUnit = p.units > 0 ? p.t.trueProfit / p.units : 0
              return (
                <tr key={p.name} style={{ borderTop: '1px solid #f5f5f5', textAlign: 'right' }}>
                  <td style={{ textAlign: 'left', padding: '5px 0' }}>{short(p.name)}</td>
                  <td>{int(p.units)}</td><td>{gbp0(p.t.gross)}</td>
                  <td style={{ color: '#888' }}>{gbp(costPerUnit)}</td>
                  <td style={{ color: profitPerUnit >= 0 ? '#1a7f37' : '#c82828' }}>{gbp(profitPerUnit)}</td>
                  <td style={{ color: p.t.trueProfit >= 0 ? '#1a7f37' : '#c82828' }}>{gbp0(p.t.trueProfit)}</td>
                  <td>{pct(p.t.netMarginPct)}</td>
                </tr>
              )
            })}
            {dive.products.length === 0 && <tr><td colSpan={7} style={{ color: '#888', padding: 8 }}>No product lines.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Horizontal bars — names on the left (so they always fit), bar, value on the
// right, a distinct colour per streamer. Mirrors V1's "total sales by streamer".
function StreamerBars({ rows, field, colourMap }) {
  const max = Math.max(1, ...rows.map((r) => r.t[field.value]))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((r) => {
        const v = r.t[field.value]
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 118, flex: '0 0 118px', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name}</div>
            <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', height: 22 }}>
              <div style={{ width: `${Math.max(2, (v / max) * 100)}%`, height: '100%', background: colourOf(r.name, colourMap), borderRadius: 6 }} />
            </div>
            <div style={{ width: 74, flex: '0 0 74px', fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{gbp0(v)}</div>
          </div>
        )
      })}
    </div>
  )
}

// A collapsible tile — header always visible (with a glanceable subtitle), body
// revealed on click.
function Collapsible({ title, subtitle, open, onToggle, children }) {
  return (
    <div className="panel" style={{ marginTop: 14, padding: 0, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
        <div>
          <div style={{ fontWeight: 800 }}>{title}</div>
          {subtitle && <div className="note" style={{ marginTop: 2 }}>{subtitle}</div>}
        </div>
        <span style={{ color: 'var(--orange)', fontSize: 18, flex: '0 0 auto' }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )
}

// A single leaderboard category card.
function LbCard({ label, name, value, sub }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{name || '—'}</div>
      {value && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 1 }}>{value}</div>}
      {sub && <div className="note" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
