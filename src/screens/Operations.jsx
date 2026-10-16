import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import StreamReceipt from '../components/StreamReceipt'

// ============================================================================
// OPERATIONS AUDIT — admin only, Mania TCG only.
// Lays each day's rota'd projection beside actual streamed hours (from receipts)
// and the streamer's logged Operations time. Contained: reads only via the
// admin-gated RPCs; never feeds any shared view.
// ============================================================================

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Monthly eBay airtime target: 100 hours streamed across the whole TCG team.
const TARGET_H = 100
const CAT_LABEL = {
  packing_orders: 'Packing Orders',
  customer_service: 'Customer Service',
  stream_prep: 'Stream Prep',
  uninterrupted_break: 'Uninterrupted Break',
  platform_outage: 'Platform Outage',
  post_stream_consolidation: 'Post Stream Consolidation',
  other: 'Other',
}

const hrs = (m) => (Number(m || 0) / 60)
const fmtH = (m) => {
  const h = hrs(m)
  return (Math.round(h * 10) / 10).toString().replace(/\.0$/, '') + 'h'
}
// Local-date ISO key (YYYY-MM-DD) built from LOCAL parts, NOT toISOString().
// toISOString() converts to UTC first, so in BST (UTC+1) local midnight on the
// 1st becomes 23:00 on the previous day in UTC -> the date string comes out one
// day early, shifting every calendar cell/bucket back a day. This avoids that.
const isoLocal = (x) => {
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const monthBounds = (d) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from: isoLocal(start), to: isoLocal(end) }
}
// Fetch range padded to whole Mon–Sun weeks, so a week straddling the month
// boundary has all its days available (not clipped). The monthly summary still
// filters to the true calendar month; only the weekly rows use the padding.
const fetchBounds = (d) => {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  const end = new Date(last); end.setDate(last.getDate() + (7 - ((last.getDay() + 6) % 7) - 1))
  return { from: isoLocal(start), to: isoLocal(end) }
}

export default function Operations({ profile }) {
  const [streamers, setStreamers] = useState([])
  const [who, setWho] = useState('all')
  const [month, setMonth] = useState(new Date())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [openDay, setOpenDay] = useState(null)
  const [rotaFor, setRotaFor] = useState(null)   // streamer id when editing a rota
  const [selDays, setSelDays] = useState([])     // selected calendar days (ISO)
  const [selAnchor, setSelAnchor] = useState(null) // for shift-range select
  const [weeksOpen, setWeeksOpen] = useState(false) // weekly breakdown collapsed by default
  const [receipt, setReceipt] = useState(null)       // stream opened from a calendar day
  const [dayPick, setDayPick] = useState(null)       // { iso, streams: [...] } when a day has several

  const { from, to } = fetchBounds(month)
  const monthCal = monthBounds(month)   // true calendar month, for the summary card

  // TCG streamers only.
  useEffect(() => {
    supabase.from('profiles').select('id,name,role,department,full_time')
      .eq('status', 'approved').eq('department', 'Mania TCG').order('name')
      .then(({ data }) => setStreamers((data || []).filter((p) => p.role === 'breaker')))
  }, [])

  useEffect(() => {
    setLoading(true)
    supabase.rpc('rota_vs_actual', {
      p_from: from, p_to: to, p_streamer_id: who === 'all' ? null : who,
    }).then(({ data }) => { setRows(data || []); setLoading(false) })
  }, [from, to, who])

  // Pull each day's logged categories for the drill-down.
  const [dayLogs, setDayLogs] = useState({})
  useEffect(() => {
    if (who === 'all') { setDayLogs({}); return }
    supabase.rpc('non_stream_reconcile', { p_from: from, p_to: to, p_streamer_id: who })
      .then(({ data }) => {
        const m = {}
        for (const r of (data || [])) m[r.work_date] = r
        setDayLogs(m)
      })
  }, [from, to, who])

  // Calendar-month rows only (rows may include padding days for the weekly view).
  const monthRows = useMemo(
    () => rows.filter((r) => r.work_date >= monthCal.from && r.work_date <= monthCal.to),
    [rows, monthCal.from, monthCal.to]
  )

  const totals = useMemo(() => {
    let expected = 0, actual = 0
    for (const r of monthRows) { expected += Number(r.expected_stream_min || 0); actual += Number(r.actual_stream_min || 0) }
    return { expected, actual, gap: expected - actual }
  }, [monthRows])

  // All-TCG view reads as a chronological timeline (newest first), not grouped
  // by streamer. Single-streamer view keeps the server's date order.
  const displayRows = useMemo(() => {
    if (who !== 'all') return monthRows
    return [...monthRows].sort((a, b) => {
      const d = String(b.work_date).localeCompare(String(a.work_date))
      return d !== 0 ? d : String(a.streamer_name || '').localeCompare(String(b.streamer_name || ''))
    })
  }, [monthRows, who])

  // Weekdays (Mon-Fri) between two dates inclusive — for honest contracted hours.
  const weekdaysBetween = (a, b) => {
    let n = 0
    const d = new Date(a)
    while (d <= b) { const wd = d.getDay(); if (wd >= 1 && wd <= 5) n++; d.setDate(d.getDate() + 1) }
    return n
  }

  const selected = streamers.find((s) => s.id === who)
  const monthSummary = useMemo(() => {
    if (who === 'all') return null
    const y = month.getFullYear(), m = month.getMonth()
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0)
    const contractedH = (selected?.full_time) ? weekdaysBetween(first, last) * 8 : null
    // Only calendar-month days — rows may include padding from adjacent months.
    const inMonth = rows.filter((r) => r.work_date >= monthCal.from && r.work_date <= monthCal.to)
    let streamed = 0, nonStream = 0
    for (const r of inMonth) {
      streamed += Number(r.actual_stream_min || 0)
      nonStream += Number(r.break_min || 0) + Number(r.outage_min || 0) + Number(r.other_logged_min || 0)
    }
    return { contractedH, streamedH: streamed / 60, nonStreamH: nonStream / 60 }
  }, [who, rows, month, selected, monthCal.from, monthCal.to])

  // Weekly breakdown uses WHOLE Mon–Sun weeks that overlap the month — never
  // clipped to the calendar boundary, so a week is judged as a full week and a
  // month-edge week doesn't read as a false shortfall. Contracted is that
  // week's own weekdays × 8 (a full working week = 40h). Most recent first.
  const weeks = useMemo(() => {
    if (who === 'all') return []
    const y = month.getFullYear(), m = month.getMonth()
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0)
    // Monday on/before the 1st — the start of the first week that touches the month.
    const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
    const buckets = []
    for (let ws = new Date(start); ws <= last; ws.setDate(ws.getDate() + 7)) {
      const wStart = new Date(ws), wEnd = new Date(ws); wEnd.setDate(wEnd.getDate() + 6)
      buckets.push({ start: new Date(wStart), end: new Date(wEnd) })
    }
    const now = new Date(); const nowMon = new Date(now); nowMon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); nowMon.setHours(0, 0, 0, 0)
    return buckets.map((b) => {
      const iso = (x) => isoLocal(x)
      // full week span — receipts anywhere in the whole Mon–Sun week count.
      const inWeek = rows.filter((r) => r.work_date >= iso(b.start) && r.work_date <= iso(b.end))
      const streamed = inWeek.reduce((a, r) => a + Number(r.actual_stream_min || 0), 0)
      const nonStream = inWeek.reduce((a, r) => a + Number(r.break_min || 0) + Number(r.outage_min || 0) + Number(r.other_logged_min || 0), 0)
      // a full Mon–Sun week always has 5 weekdays, so contracted = 40h for a full-timer.
      const contractedH = (selected?.full_time) ? 5 * 8 : null
      const weeksAgo = Math.round((nowMon - b.start) / (7 * 86400000))
      const label = weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Previous week' : weeksAgo > 1 ? `${weeksAgo} weeks ago` : 'Upcoming'
      return { ...b, streamedH: streamed / 60, nonStreamH: nonStream / 60, contractedH, label, days: inWeek }
    }).reverse()
  }, [who, rows, month, selected])

  // Per-day map for the calendar: streamed minutes + stream count, keyed by ISO date.
  const dayMap = useMemo(() => {
    const m = {}
    for (const r of rows) {
      m[r.work_date] = m[r.work_date] || { streamed: 0, count: 0 }
      m[r.work_date].streamed += Number(r.actual_stream_min || 0)
      m[r.work_date].count += 1
    }
    return m
  }, [rows])

  // The calendar grid: full Mon–Sun weeks covering the selected month.
  const calGrid = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth()
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0)
    const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
    const end = new Date(last); end.setDate(last.getDate() + (7 - ((last.getDay() + 6) % 7) - 1))
    const cells = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      cells.push({ iso: isoLocal(d), day: d.getDate(), inMonth: d.getMonth() === m })
    }
    return cells
  }, [month])

  // Stats for the current selection (or whole month if nothing selected).
  const selStats = useMemo(() => {
    const days = selDays.length ? selDays : null
    const inSel = (iso) => !days || days.includes(iso)
    let streamed = 0, count = 0, weekdays = 0
    const cats = { packing_orders: 0, customer_service: 0, stream_prep: 0, uninterrupted_break: 0, platform_outage: 0, post_stream_consolidation: 0, other: 0 }
    const dayList = days || calGrid.filter((c) => c.inMonth).map((c) => c.iso)
    for (const iso of dayList) {
      const wd = new Date(iso + 'T12:00:00').getDay()
      if (wd >= 1 && wd <= 5) weekdays++
    }
    for (const r of rows) {
      if (!inSel(r.work_date)) continue
      streamed += Number(r.actual_stream_min || 0)
      count += 1
      const log = dayLogs[r.work_date]
      if (log) {
        cats.packing_orders += Number(log.packing_orders || 0)
        cats.customer_service += Number(log.customer_service || 0)
        cats.stream_prep += Number(log.stream_prep || 0)
        cats.uninterrupted_break += Number(log.uninterrupted_break || 0)
        cats.platform_outage += Number(log.platform_outage || 0)
        cats.post_stream_consolidation += Number(log.post_stream_consolidation || 0)
        cats.other += Number(log.other_minutes || 0)
      }
    }
    const nonStream = Object.values(cats).reduce((a, b) => a + b, 0)
    const targetH = (selected?.full_time) ? weekdays * 8 : null
    return { streamedH: streamed / 60, nonStreamH: nonStream / 60, count, cats, targetH,
             unaccountedH: targetH != null ? Math.max(0, targetH - streamed / 60 - nonStream / 60) : null }
  }, [selDays, rows, dayLogs, selected, calGrid])

  function toggleDay(iso, shiftKey) {
    if (shiftKey && selAnchor) {
      const [a, b] = [selAnchor, iso].sort()
      const range = calGrid.filter((c) => c.iso >= a && c.iso <= b).map((c) => c.iso)
      setSelDays(range)
    } else {
      setSelDays((prev) => prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso])
      setSelAnchor(iso)
    }
  }

  // Open the stream receipt(s) for a given day, scoped to the current filter.
  // Also opens for days with no stream, so operational time (or its absence) shows.
  async function openDayReceipt(iso) {
    let q = supabase.from('streams').select('*').eq('stream_date', iso).eq('department', 'Mania TCG')
    if (who !== 'all') q = q.eq('streamer_id', who)
    const { data } = await q.order('stream_start')
    const list = data || []
    // Single stream with no separate op-time question → straight to receipt.
    if (list.length === 1 && (who === 'all' || !dayLogs[iso])) { setReceipt(list[0]); return }
    // Otherwise (multiple streams, a single streamer we can show op-time for, or
    // no stream at all) open the day modal so operational time is visible.
    if (list.length === 0 && who === 'all') return  // all-view + empty day: nothing to show
    setDayPick({ iso, streams: list })
  }
  const target = useMemo(() => {
    const actualH = totals.actual / 60
    const now = new Date()
    const y = month.getFullYear(), m = month.getMonth()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    // How far through THIS month are we? (past months = fully elapsed)
    const isThisMonth = now.getFullYear() === y && now.getMonth() === m
    const isFuture = (y > now.getFullYear()) || (y === now.getFullYear() && m > now.getMonth())
    const dayOfMonth = isFuture ? 0 : isThisMonth ? now.getDate() : daysInMonth
    const elapsed = dayOfMonth / daysInMonth               // 0..1 through the month
    const pacePar = TARGET_H * elapsed                       // where we "should" be by now
    const daysLeft = Math.max(0, daysInMonth - dayOfMonth)
    const remaining = Math.max(0, TARGET_H - actualH)
    const perWeekNeeded = daysLeft > 0 ? (remaining / daysLeft) * 7 : 0
    // status vs pace (only meaningful mid-month)
    let status = 'ontrack'
    if (isThisMonth && pacePar > 0) {
      if (actualH >= pacePar) status = 'ahead'
      else if (actualH >= pacePar * 0.85) status = 'ontrack'
      else status = 'behind'
    } else if (!isThisMonth && !isFuture) {
      status = actualH >= TARGET_H ? 'ahead' : 'behind'   // closed month: hit or missed
    }
    return { actualH, pct: Math.min(100, (actualH / TARGET_H) * 100), pacePar, perWeekNeeded, daysLeft, remaining, status, isThisMonth, isFuture }
  }, [totals.actual, month])

  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const stepMonth = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  if (rotaFor) {
    return <RotaEditor streamerId={rotaFor} streamerName={streamers.find((s) => s.id === rotaFor)?.name || ''} onClose={() => setRotaFor(null)} />
  }

  return (
    <div className="operations">
      {receipt && <StreamReceipt stream={receipt} onClose={() => setReceipt(null)} />}
      {dayPick && (
        <div className="modal-backdrop" onClick={() => setDayPick(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="label" style={{ fontWeight: 700, marginBottom: 8 }}>
              {new Date(dayPick.iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              {dayPick.streams.length > 0 ? ` — ${dayPick.streams.length} stream${dayPick.streams.length === 1 ? '' : 's'}` : ' — no streams'}
            </div>
            {dayPick.streams.map((s) => (
              <button key={s.id} className="btn ghost" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }}
                onClick={() => { setReceipt(s); setDayPick(null) }}>
                {s.stream_start}–{s.stream_end} · {s.streamer_name} · £{Math.round(Number(s.revenue || 0))}
              </button>
            ))}

            {/* Logged operational (non-stream) time for the day, or a clear "not recorded". */}
            {who !== 'all' && (() => {
              const log = dayLogs[dayPick.iso]
              const brk = Number(log?.break_min || 0)
              const out = Number(log?.outage_min || 0)
              const oth = Number(log?.other_logged_min || 0)
              const total = brk + out + oth
              const h = (m) => (m / 60).toFixed(1) + 'h'
              return (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                  <div className="label" style={{ fontWeight: 700, marginBottom: 4 }}>Operational time</div>
                  {total === 0 ? (
                    <p className="note" style={{ margin: 0, color: 'var(--warn, #b8860b)' }}>No operational time logged for this day.</p>
                  ) : (
                    <div style={{ fontSize: 13 }}>
                      {brk > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="note">Breaks / prep</span><span>{h(brk)}</span></div>}
                      {out > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="note">Platform outage</span><span>{h(out)}</span></div>}
                      {oth > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="note">Other logged</span><span>{h(oth)}</span></div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 2 }}><span>Total logged</span><span>{h(total)}</span></div>
                    </div>
                  )}
                </div>
              )
            })()}

            <button className="btn ghost sm" onClick={() => setDayPick(null)} style={{ marginTop: 8 }}>Close</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Operations Audit</h2>
        <span className="pill" style={{ background: 'var(--ink)', color: 'var(--paper)', fontSize: 11 }}>Admin · Mania TCG</span>
      </div>
      <p className="note" style={{ marginTop: 0 }}>Only you can see this. Not shared with streamers or other departments.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
        <select value={who} onChange={(e) => { setWho(e.target.value); setOpenDay(null) }}>
          <option value="all">All TCG streamers</option>
          {streamers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="btn ghost sm" onClick={() => stepMonth(-1)}>‹</button>
          <span className="note" style={{ minWidth: 110, textAlign: 'center' }}>{monthLabel}</span>
          <button className="btn ghost sm" onClick={() => stepMonth(1)}>›</button>
        </div>
        {who !== 'all' && (
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setRotaFor(who)}>Set rota</button>
        )}
      </div>

      {who === 'all' ? (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <div className="label" style={{ fontWeight: 700 }}>eBay airtime — {monthLabel}</div>
            <div className="note">
              <strong style={{ color: 'var(--text-primary)' }}>{target.actualH.toFixed(1)}h</strong> / {TARGET_H}h streamed
            </div>
          </div>
          <div style={{ position: 'relative', height: 10, background: 'var(--line)', borderRadius: 5, overflow: 'hidden', margin: '8px 0 6px' }}>
            <div style={{
              width: target.pct + '%', height: '100%',
              background: target.status === 'ahead' ? 'var(--good)' : target.status === 'behind' ? 'var(--red)' : '#c98a00',
            }} />
            {/* pace marker: where we should be by today */}
            {target.isThisMonth && (
              <div style={{ position: 'absolute', top: -2, bottom: -2, left: Math.min(100, (target.pacePar / TARGET_H) * 100) + '%', width: 2, background: 'var(--ink)' }} title="On-pace mark for today" />
            )}
          </div>
          <div className="note">
            {target.isFuture ? 'Not started yet.'
              : target.status === 'ahead' ? (target.remaining <= 0 ? '✓ Target hit.' : 'Ahead of pace — on track for 100h.')
              : target.status === 'behind' ? `Behind pace${target.daysLeft > 0 ? ` — need ~${target.perWeekNeeded.toFixed(0)}h/week to still land 100` : ' — missed for this month'}.`
              : `On track${target.daysLeft > 0 ? ` — ~${target.perWeekNeeded.toFixed(0)}h/week keeps you on 100` : ''}.`}
            {target.isThisMonth && <> The mark shows where you'd be on pace today.</>}
          </div>
        </div>
      ) : (
        <>
          <div className="panel" style={{ marginBottom: 12 }}>
            <div className="label" style={{ fontWeight: 700, marginBottom: 6 }}>{selected?.name} · {monthLabel}</div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {monthSummary?.contractedH != null && (
                <div>
                  <div className="note">Contracted</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{monthSummary.contractedH.toFixed(0)}h</div>
                </div>
              )}
              <div>
                <div className="note">Streamed</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--good)' }}>{monthSummary.streamedH.toFixed(1)}h</div>
              </div>
              <div>
                <div className="note">Non-stream logged</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{monthSummary.nonStreamH.toFixed(1)}h</div>
              </div>
              {monthSummary?.contractedH != null && (
                <div>
                  <div className="note">Unaccounted</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: '#c98a00' }}>
                    {Math.max(0, monthSummary.contractedH - monthSummary.streamedH - monthSummary.nonStreamH).toFixed(1)}h
                  </div>
                </div>
              )}
            </div>
            {monthSummary?.contractedH == null && (
              <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>Contractor — no fixed contracted hours; showing actuals.</p>
            )}
          </div>

          {/* calendar — click a day or shift-click a range to see stats for it */}
          <div className="panel" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div className="label" style={{ fontWeight: 700 }}>{monthLabel}</div>
              {selDays.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setSelDays([]); setSelAnchor(null) }}>Clear selection</button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <div key={i} className="note" style={{ textAlign: 'center', fontSize: 11 }}>{d}</div>
              ))}
              {calGrid.map((c) => {
                const info = dayMap[c.iso]
                const sel = selDays.includes(c.iso)
                const wd = new Date(c.iso + 'T12:00:00').getDay()
                const weekend = wd === 0 || wd === 6
                return (
                  <div
                    key={c.iso}
                    onClick={(e) => { if (e.shiftKey) toggleDay(c.iso, true); else if (info) openDayReceipt(c.iso); else toggleDay(c.iso, false) }}
                    title={info ? 'Open stream receipt · shift-click to add to selection' : 'shift-click to select'}
                    style={{
                      minHeight: 46, borderRadius: 6, padding: '4px 5px', cursor: 'pointer',
                      border: sel ? '2px solid var(--ink)' : '1px solid var(--line)',
                      background: !c.inMonth ? 'transparent' : sel ? 'var(--paper)' : weekend ? 'var(--line)' : 'var(--paper)',
                      opacity: c.inMonth ? 1 : 0.35,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{c.day}</div>
                    {info && (
                      <div style={{ fontSize: 11, color: 'var(--good)', fontWeight: 600 }}>{(info.streamed / 60).toFixed(1)}h</div>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>Click a stream day to see its receipt · shift-click to select days for stats.</p>
          </div>

          {/* selection summary */}
          {selDays.length > 0 && (
            <div className="panel" style={{ marginBottom: 12 }}>
              <div className="label" style={{ fontWeight: 700, marginBottom: 6 }}>
                {selDays.length} day{selDays.length === 1 ? '' : 's'} selected
              </div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 8 }}>
                {selStats.targetH != null && (
                  <div><div className="note">Target</div><div style={{ fontWeight: 700, fontSize: 18 }}>{selStats.targetH.toFixed(0)}h</div></div>
                )}
                <div><div className="note">Streamed</div><div style={{ fontWeight: 700, fontSize: 18, color: 'var(--good)' }}>{selStats.streamedH.toFixed(1)}h</div></div>
                <div><div className="note">Non-stream</div><div style={{ fontWeight: 700, fontSize: 18 }}>{selStats.nonStreamH.toFixed(1)}h</div></div>
                {selStats.unaccountedH != null && (
                  <div><div className="note">Unaccounted</div><div style={{ fontWeight: 700, fontSize: 18, color: '#c98a00' }}>{selStats.unaccountedH.toFixed(1)}h</div></div>
                )}
                <div><div className="note">Streams</div><div style={{ fontWeight: 700, fontSize: 18 }}>{selStats.count}</div></div>
              </div>
              {selStats.nonStreamH > 0 && (
                <div>
                  <div className="note" style={{ marginBottom: 2 }}>Non-stream makeup</div>
                  {Object.entries(selStats.cats).filter(([, v]) => v > 0).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 320, padding: '1px 0' }}>
                      <span>{CAT_LABEL[k] || k}</span><span style={{ fontWeight: 500 }}>{fmtH(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* weekly breakdown — collapsed by default */}
          <div onClick={() => setWeeksOpen(!weeksOpen)} className="note" style={{ marginBottom: 6, cursor: 'pointer', fontWeight: 600 }}>
            Weekly breakdown {weeksOpen ? '▾' : '▸'}
          </div>
          {weeksOpen && weeks.map((w, i) => {
            const wkKey = 'wk' + i
            const isOpen = openDay === wkKey
            const iso = (x) => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            // group this week's rows by day for the expand
            const byDay = {}
            for (const r of w.days) {
              byDay[r.work_date] = byDay[r.work_date] || { streamed: 0, count: 0 }
              byDay[r.work_date].streamed += Number(r.actual_stream_min || 0)
              byDay[r.work_date].count += 1
            }
            return (
              <div key={wkKey} className="panel" style={{ padding: 0, marginBottom: 8 }}>
                <div onClick={() => setOpenDay(isOpen ? null : wkKey)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 600 }}>
                    {w.label} <span className="note">{iso(w.start)}–{iso(w.end)} {isOpen ? '▾' : '▸'}</span>
                  </div>
                  <div className="note">
                    {w.contractedH != null && <>contracted {w.contractedH.toFixed(0)}h · </>}
                    streamed <strong style={{ color: 'var(--good)' }}>{w.streamedH.toFixed(1)}h</strong> · non-stream {w.nonStreamH.toFixed(1)}h
                  </div>
                </div>
                {isOpen && (
                  <div style={{ padding: '2px 14px 12px 14px', borderTop: '1px solid var(--line)' }}>
                    {Object.keys(byDay).length === 0 ? (
                      <p className="note">No streams this week.</p>
                    ) : Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => {
                      const dt = new Date(d + 'T12:00:00')
                      return (
                        <div key={d} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span>{dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                          <span className="note">{v.count} stream{v.count === 1 ? '' : 's'} · {(v.streamed / 60).toFixed(1)}h live</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* team-overview calendar on the all-TCG view — every stream, click to open its receipt */}
      {who === 'all' && !loading && displayRows.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="label" style={{ fontWeight: 700, marginBottom: 8 }}>{monthLabel} · all streams</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="note" style={{ textAlign: 'center', fontSize: 11 }}>{d}</div>
            ))}
            {calGrid.map((c) => {
              const info = dayMap[c.iso]
              const wd = new Date(c.iso + 'T12:00:00').getDay()
              const weekend = wd === 0 || wd === 6
              return (
                <div
                  key={c.iso}
                  onClick={() => info && openDayReceipt(c.iso)}
                  title={info ? `${info.count} stream${info.count === 1 ? '' : 's'} — click to view` : ''}
                  style={{
                    minHeight: 46, borderRadius: 6, padding: '4px 5px', cursor: info ? 'pointer' : 'default',
                    border: '1px solid var(--line)',
                    background: !c.inMonth ? 'transparent' : weekend ? 'var(--line)' : 'var(--paper)',
                    opacity: c.inMonth ? 1 : 0.35,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{c.day}</div>
                  {info && (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--good)', fontWeight: 600 }}>{(info.streamed / 60).toFixed(1)}h</div>
                      <div style={{ fontSize: 10, color: '#999' }}>{info.count} stream{info.count === 1 ? '' : 's'}</div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>Click a day to view its stream receipts.</p>
        </div>
      )}

      {who === 'all' && (loading ? <p className="note">Loading…</p> : displayRows.length === 0 ? (
        <p className="note">No stream days recorded in {monthLabel}.</p>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          {displayRows.map((r) => {
            const exp = Number(r.expected_stream_min || 0)
            const act = Number(r.actual_stream_min || 0)
            const gap = Math.max(0, exp - act)
            const ratio = exp > 0 ? act / exp : null
            const colour = ratio == null ? 'var(--line)' : ratio >= 0.9 ? 'var(--good)' : ratio >= 0.7 ? '#c98a00' : 'var(--red)'
            const key = r.streamer_id + r.work_date
            const isOpen = openDay === key
            const log = dayLogs[r.work_date]
            const d = new Date(r.work_date + 'T12:00:00')
            const dayName = WEEKDAYS[(d.getDay() + 6) % 7]
            return (
              <div key={key} style={{ borderTop: '1px solid var(--line)' }}>
                <div
                  onClick={() => setOpenDay(isOpen ? null : key)}
                  style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 10, alignItems: 'center', padding: '10px 14px', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {dayName} <span className="note">{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span> <span className="note">{isOpen ? '▾' : '▸'}</span>
                  </div>
                  <div className="note">{who === 'all' ? r.streamer_name : ''}</div>
                  <div style={{ textAlign: 'right', minWidth: 150 }}>
                    <div style={{ fontWeight: 600 }}>
                      {fmtH(act)}{exp > 0 && <> / {fmtH(exp)}</>}
                      {gap > 6 && <span className="note" style={{ color: '#c98a00' }}> ·{fmtH(gap)} gap</span>}
                    </div>
                    {exp > 0 && (
                      <div style={{ height: 5, background: 'var(--line)', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
                        <div style={{ width: Math.min(100, ratio * 100) + '%', height: '100%', background: colour }} />
                      </div>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ padding: '2px 14px 12px 104px' }}>
                    {who === 'all' ? (
                      <p className="note">Pick a single streamer to see the logged breakdown.</p>
                    ) : log ? (
                      <>
                        <div className="note" style={{ marginBottom: 4 }}>Logged this day</div>
                        {['packing_orders', 'customer_service', 'stream_prep', 'uninterrupted_break', 'platform_outage', 'post_stream_consolidation', 'other_minutes'].map((c) => {
                          const key2 = c === 'other_minutes' ? 'other' : c
                          const mins = Number(log[c === 'other_minutes' ? 'other_minutes' : c] || 0)
                          if (mins <= 0) return null
                          return <div key={c} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 340, padding: '2px 0' }}>
                            <span>{CAT_LABEL[key2]}</span><span style={{ fontWeight: 500 }}>{fmtH(mins)}</span>
                          </div>
                        })}
                        {(() => {
                          const unaccounted = Math.max(0, gap - Number(log.uninterrupted_break || 0) - Number(log.platform_outage || 0))
                          return unaccounted > 6 ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 340, padding: '2px 0', color: '#c98a00', fontWeight: 500 }}>
                              <span>Unaccounted</span><span>{fmtH(unaccounted)}</span>
                            </div>
                          ) : null
                        })()}
                      </>
                    ) : <p className="note">Nothing logged for this day.</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// --- Rota editor: fixed weekly blocks with projected stream hours -----------
function RotaEditor({ streamerId, streamerName, onClose }) {
  const [blocks, setBlocks] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.rpc('get_streamer_rota', { p_streamer_id: streamerId }).then(({ data }) => {
      setBlocks((data || []).map((b) => ({
        weekday: b.weekday,
        start: minToHHMM(b.start_min),
        end: minToHHMM(b.end_min),
        activity: b.activity,
        projH: b.projected_min != null ? (b.projected_min / 60).toString() : '',
      })))
    })
  }, [streamerId])

  const setB = (i, patch) => setBlocks(blocks.map((b, x) => (x === i ? { ...b, ...patch } : b)))
  const add = () => setBlocks([...blocks, { weekday: 0, start: '14:00', end: '22:00', activity: 'stream', projH: '' }])
  const drop = (i) => setBlocks(blocks.filter((_, x) => x !== i))

  async function save() {
    setBusy(true); setErr('')
    const p_blocks = blocks.map((b) => ({
      weekday: b.weekday,
      start_min: hhmmToMin(b.start),
      end_min: hhmmToMin(b.end),
      activity: b.activity,
      projected_min: b.activity === 'stream' && b.projH !== '' ? Math.round(Number(b.projH) * 60) : null,
    }))
    const { error } = await supabase.rpc('set_streamer_rota', { p_streamer_id: streamerId, p_blocks })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onClose()
  }

  return (
    <div className="operations">
      <h2 style={{ marginBottom: 2 }}>Rota · {streamerName}</h2>
      <p className="note" style={{ marginTop: 0, marginBottom: 14 }}>
        The fixed weekly pattern. Projected stream hours is your realistic target inside a stream block — what you&rsquo;d expect after breaks and changeover.
      </p>

      <div className="panel">
        {blocks.length === 0 && <p className="note">No rota yet — add the weekly blocks below.</p>}
        {blocks.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <select value={b.weekday} onChange={(e) => setB(i, { weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, x) => <option key={x} value={x}>{d}</option>)}
            </select>
            <input value={b.start} onChange={(e) => setB(i, { start: e.target.value })} placeholder="14:00" style={{ width: 70 }} />
            <span className="note">to</span>
            <input value={b.end} onChange={(e) => setB(i, { end: e.target.value })} placeholder="22:00" style={{ width: 70 }} />
            <select value={b.activity} onChange={(e) => setB(i, { activity: e.target.value })}>
              <option value="stream">Stream</option>
              <option value="packing">Packing</option>
            </select>
            {b.activity === 'stream' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input value={b.projH} onChange={(e) => setB(i, { projH: e.target.value })} placeholder="7" style={{ width: 48 }} />
                <span className="note">h proj.</span>
              </span>
            ) : <span className="note">—</span>}
            <button className="btn ghost sm" onClick={() => drop(i)}>×</button>
          </div>
        ))}
        <button className="btn ghost sm" onClick={add} style={{ marginTop: 4 }}>+ Add block</button>
      </div>

      {err && <p className="note" style={{ color: 'var(--red)' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" onClick={save} disabled={busy}>Save rota</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

function minToHHMM(m) {
  const h = Math.floor(m / 60), mm = m % 60
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
}
function hhmmToMin(s) {
  const m = String(s || '').match(/^(\d{1,2}):?(\d{2})$/)
  if (!m) return 0
  return Math.min(23, +m[1]) * 60 + Math.min(59, +m[2])
}
