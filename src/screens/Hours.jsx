import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSource, hoursOf, gbp, setStreamerTarget } from '../data'

// ============================================================
// HOURS — group-wide streaming hours for management (admin + manager).
// The month calendar is the comprehensive "who streamed, how long, where".
// Below it, a this-week block table of each streamer's ACTUAL vs their weekly
// minimum TARGET, with the target editable inline. Runs off the shared source
// (admin/manager see every department unmasked) + the streamer_targets table.
// ============================================================

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DEPT_COLOUR = { 'Mania TCG': '#4f46e5', 'GC Mania': '#0ea5e9', 'Mania': '#16a34a', '101': '#f97316' }
const deptColour = (d) => DEPT_COLOUR[d] || '#64748b'

const pad = (n) => String(n).padStart(2, '0')
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function mondayOf(d) { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); x.setHours(0, 0, 0, 0); return x }
const fmtH = (h) => (Math.round(h * 10) / 10).toFixed(1) + 'h'
const firstName = (n) => String(n || '').split(' ')[0]
const whereOf = (s) => [s.platform, s.channel].filter(Boolean).join(' · ') || s.department || '—'

export default function Hours({ scoped }) {
  const { refresh } = useSource()
  const streams = scoped?.streams || []
  const profiles = scoped?.profiles || []
  const targets = scoped?.streamerTargets || []

  const [dept, setDept] = useState('all')
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [dayKey, setDayKey] = useState(null)
  const [drafts, setDrafts] = useState({})   // streamerId -> editing value
  const [saving, setSaving] = useState({})

  const targetOf = useMemo(() => Object.fromEntries(targets.map((t) => [t.streamerId, t.weeklyHours])), [targets])

  const depts = useMemo(() => [...new Set(streams.map((s) => s.department).filter(Boolean))].sort(), [streams])
  const scopedStreams = useMemo(() => (dept === 'all' ? streams : streams.filter((s) => s.department === dept)), [streams, dept])

  // Streamers = anyone with role 'breaker', plus anyone who has actually streamed.
  const streamers = useMemo(() => {
    const map = {}
    for (const p of profiles) if (p.role === 'breaker') map[p.id] = { id: p.id, name: p.name, department: p.department }
    for (const s of scopedStreams) if (s.streamerId && !map[s.streamerId]) map[s.streamerId] = { id: s.streamerId, name: s.streamerName, department: s.department }
    let list = Object.values(map)
    if (dept !== 'all') list = list.filter((s) => s.department === dept || scopedStreams.some((x) => x.streamerId === s.id))
    return list.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  }, [profiles, scopedStreams, dept])

  // ---- this week (Mon–Sun, local) ----
  const weekStart = mondayOf(new Date())
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
  const wsKey = keyOf(weekStart), weKey = keyOf(weekEnd)
  const inWeek = (ymd) => ymd >= wsKey && ymd <= weKey

  const weekRows = useMemo(() => {
    const rows = streamers.map((s) => {
      const mine = scopedStreams.filter((x) => x.streamerId === s.id && inWeek(x.streamDate))
      const actual = mine.reduce((a, x) => a + hoursOf(x), 0)
      const target = targetOf[s.id] || 0
      const wheres = [...new Set(mine.map(whereOf))]
      return { ...s, actual, target, gap: Math.max(0, target - actual), streams: mine.length, wheres }
    })
    // behind-target first (those with a target they haven't hit), then by actual desc
    return rows.sort((a, b) => {
      const aB = a.target > 0 && a.actual < a.target, bB = b.target > 0 && b.actual < b.target
      if (aB !== bB) return aB ? -1 : 1
      return b.actual - a.actual
    })
  }, [streamers, scopedStreams, targetOf, wsKey, weKey])

  const teamHours = weekRows.reduce((a, r) => a + r.actual, 0)
  const withTarget = weekRows.filter((r) => r.target > 0)
  const onTarget = withTarget.filter((r) => r.actual >= r.target).length

  // ---- month calendar ----
  const { y, m } = cursor
  const lead = (new Date(y, m, 1).getDay() + 6) % 7
  const days = new Date(y, m + 1, 0).getDate()
  const todayKey = keyOf(new Date())
  const byDay = useMemo(() => {
    const map = {}
    for (const s of scopedStreams) if (s.streamDate) (map[s.streamDate] || (map[s.streamDate] = [])).push(s)
    return map
  }, [scopedStreams])
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= days; d++) { const k = `${y}-${pad(m + 1)}-${pad(d)}`; cells.push({ d, k, list: byDay[k] || [], isToday: k === todayKey }) }

  async function commit(id) {
    const v = drafts[id]
    if (v == null || v === '') { setDrafts((s) => { const n = { ...s }; delete n[id]; return n }); return }
    setSaving((s) => ({ ...s, [id]: true }))
    try { await setStreamerTarget(id, Number(v)); await refresh() } catch (e) { alert(e.message || String(e)) }
    setSaving((s) => { const n = { ...s }; delete n[id]; return n })
    setDrafts((s) => { const n = { ...s }; delete n[id]; return n })
  }

  return (
    <div>
      <PageHead eyebrow="Operations · Management" title="Hours"
        hint="Who streamed, how long, and where — group-wide. The table shows this week’s actual hours against each streamer’s weekly minimum." />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={field}>
          <option value="all">All departments</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <StatPill label="Team hours this week" value={fmtH(teamHours)} />
        <StatPill label="On / over target" value={`${onTarget} / ${withTarget.length}`} />
      </div>

      {/* MONTH CALENDAR */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{MONTHS[m]} {y}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <CalBtn onClick={() => setCursor({ y: m === 0 ? y - 1 : y, m: (m + 11) % 12 })}>‹</CalBtn>
            <CalBtn onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }}>•</CalBtn>
            <CalBtn onClick={() => setCursor({ y: m === 11 ? y + 1 : y, m: (m + 1) % 12 })}>›</CalBtn>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {cells.map((c, i) => {
            if (!c) return <div key={i} />
            const total = c.list.reduce((a, s) => a + hoursOf(s), 0)
            const has = c.list.length > 0
            return (
              <div key={i} onClick={has ? () => setDayKey(c.k) : undefined}
                style={{ minHeight: 76, borderRadius: 9, padding: '4px 4px 5px', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden', cursor: has ? 'pointer' : 'default', background: c.isToday ? 'rgba(245,158,11,0.10)' : 'var(--card)', border: `1px solid ${c.isToday ? '#f59e0b' : 'var(--line)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.isToday ? '#b45309' : 'var(--muted)' }}>{c.d}</span>
                  {has && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--good)' }}>{fmtH(total)}</span>}
                </div>
                {c.list.slice(0, 3).map((s) => (
                  <span key={s.id} title={`${s.streamerName} · ${fmtH(hoursOf(s))} · ${whereOf(s)}`} style={{ fontSize: 9.5, fontWeight: 600, color: '#fff', background: deptColour(s.department), borderRadius: 4, padding: '2px 4px', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstName(s.streamerName)} {fmtH(hoursOf(s))}</span>
                ))}
                {c.list.length > 3 && <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--muted)' }}>+{c.list.length - 3} more</span>}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {depts.map((d) => <span key={d} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}><i style={{ width: 9, height: 9, borderRadius: 3, background: deptColour(d) }} />{d}</span>)}
        </div>
      </div>

      {/* THIS WEEK — actual vs target */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 2 }}>This week · actual vs target</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>{weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · set each streamer’s weekly minimum inline</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560, fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <th style={th}>Streamer</th><th style={th}>Where</th>
                <th style={{ ...th, textAlign: 'right' }}>Actual</th>
                <th style={{ ...th, textAlign: 'right' }}>Target</th>
                <th style={{ ...th, width: 150 }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((r) => {
                const ratio = r.target > 0 ? Math.min(1, r.actual / r.target) : null
                const col = ratio == null ? 'var(--line)' : ratio >= 0.9 ? 'var(--good)' : ratio >= 0.7 ? '#c98a00' : 'var(--bad)'
                const val = drafts[r.id] != null ? drafts[r.id] : (r.target || '')
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.name || '—'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.department || '—'} · {r.streams} stream{r.streams === 1 ? '' : 's'}</div>
                    </td>
                    <td style={{ ...td, color: 'var(--muted)', fontSize: 12.5 }}>{r.wheres.join(', ') || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtH(r.actual)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input type="number" step="0.5" min="0" value={val} disabled={!!saving[r.id]}
                        onChange={(e) => setDrafts((s) => ({ ...s, [r.id]: e.target.value }))}
                        onBlur={() => drafts[r.id] != null && commit(r.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        style={{ width: 64, textAlign: 'right', border: '1px solid var(--line)', borderRadius: 7, padding: '5px 7px', background: 'var(--card)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }} />
                    </td>
                    <td style={td}>
                      {r.target > 0 ? (
                        <div>
                          <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: ratio * 100 + '%', height: '100%', background: col }} /></div>
                          <div style={{ fontSize: 11, color: r.gap > 0 ? '#c98a00' : 'var(--good)', marginTop: 3 }}>{r.gap > 0 ? `${fmtH(r.gap)} to go` : '✓ met'}</div>
                        </div>
                      ) : <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>no target set</span>}
                    </td>
                  </tr>
                )
              })}
              {weekRows.length === 0 && <tr><td colSpan={5} style={{ ...td, color: 'var(--muted)' }}>No streamers in scope.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {dayKey && <DayModal dateKey={dayKey} streams={byDay[dayKey] || []} onClose={() => setDayKey(null)} />}
    </div>
  )
}

function DayModal({ dateKey, streams, onClose }) {
  const label = new Date(dateKey + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const total = streams.reduce((a, s) => a + hoursOf(s), 0)
  const sorted = [...streams].sort((a, b) => String(a.streamStart || '').localeCompare(String(b.streamStart || '')))
  return createPortal((
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <h3 className="h2" style={{ margin: 0, fontSize: 18 }}>{label}</h3>
          <button onClick={onClose} style={xBtn}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>{streams.length} stream{streams.length === 1 ? '' : 's'} · {fmtH(total)} total</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((s) => (
            <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.streamerName || '—'}</div>
                <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtH(hoursOf(s))}</div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: deptColour(s.department), marginRight: 6 }} />
                {whereOf(s)}{s.streamStart ? ` · ${s.streamStart}–${s.streamEnd || '?'}` : ''}{s.totalSales ? ` · ${gbp(s.totalSales)}` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ), document.body)
}

function CalBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ font: 'inherit', fontSize: 15, lineHeight: 1, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer' }}>{children}</button>
}
function StatPill({ label, value }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 14px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
function PageHead({ eyebrow, title, hint }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '14px 18px', marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>{eyebrow}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{title}</div>
      </div>
      {hint && <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right', maxWidth: 420, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

const card = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: 16, marginBottom: 18 }
const th = { padding: '6px 10px', fontWeight: 700 }
const td = { padding: '10px' }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', zIndex: 60, overflowY: 'auto' }
const sheet = { background: 'var(--card)', borderRadius: 14, maxWidth: 520, width: '100%', padding: 20, boxShadow: 'var(--shadow)', margin: 'auto' }
const field = { border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)' }
const xBtn = { border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }
