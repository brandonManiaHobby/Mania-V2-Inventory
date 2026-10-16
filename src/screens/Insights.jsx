import { useState, useMemo } from 'react'
import { computeStream, sumMoney } from '../money'
import { gbp0, pct, canonPlatform, toDateKey } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'

// ============================================================
// INSIGHTS (V1 parity) — one calendar MONTH at a time (pick the month; step
// back through previous months). Revenue / Profit / Streams headline, then
// breakdowns By Department / Channel / Platform / Stream type. Money toggle +
// CSV export. Scoped data is already role-filtered.
// ============================================================
const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }
const BRAND = { 'mania/101': '#ff6a00', 'mania 101': '#ff6a00', '101': '#ff6a00', 'mania tcg': '#3a6fd8', 'gc mania': '#c0531f' }
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()
function hue(str) { let h = 0; const s = String(str); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360 }
const dotColour = (k) => BRAND[norm(k)] || BRAND[norm(k).replace(/[/ ]/g, '')] || `hsl(${hue(k)} 60% 52%)`
const hoursOf = (s) => {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart); return d > 0 ? d : 0
}

export default function Insights({ scoped }) {
  const [view, setView] = useState('gross')
  const [month, setMonth] = useState(() => toDateKey(new Date()).slice(0, 7))
  const field = VIEW_FIELD[view]
  const vatOf = (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'
  const maxMonth = toDateKey(new Date()).slice(0, 7)

  const model = useMemo(() => {
    const streams = scoped.streams.filter((s) => s.streamDate && s.streamDate.slice(0, 7) === month)
    const rows = streams.map((s) => {
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const m = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
      return { s, m, hours: hoursOf(s) }
    })
    const totals = sumMoney(rows.map((r) => r.m))
    const totalHours = rows.reduce((a, r) => a + r.hours, 0)
    const group = (keyOf) => {
      const g = {}
      for (const r of rows) {
        const k = keyOf(r.s) || '—'
        const e = g[k] || (g[k] = { key: k, ladders: [], hours: 0, count: 0 })
        e.ladders.push(r.m); e.hours += r.hours; e.count += 1
      }
      return Object.values(g).map((e) => ({ ...e, t: sumMoney(e.ladders) })).sort((a, b) => b.t[field.value] - a.t[field.value])
    }
    return {
      count: rows.length, totals, totalHours,
      byDepartment: group((s) => s.department),
      byChannel: group((s) => (s.channel || '').trim()),
      byPlatform: group((s) => canonPlatform(s.platform)),
      byType: group((s) => s.streamType),
    }
  }, [scoped, month, field.value])

  const monthName = (() => { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) })()

  const exportCsv = () => {
    const q = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const m = (n) => (Number(n) || 0).toFixed(2)
    const out = [`Mania Insights,${monthName}`, '']
    const sect = (title, rows) => { out.push(title, 'Name,Streams,Hours,Revenue,Profit'); rows.forEach((r) => out.push([q(r.key), r.count, r.hours.toFixed(1), m(r.t[field.value]), m(r.t.trueProfit)].join(','))); out.push('') }
    sect('BY DEPARTMENT', model.byDepartment); sect('BY CHANNEL', model.byChannel); sect('BY PLATFORM', model.byPlatform); sect('BY STREAM TYPE', model.byType)
    const url = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `mania-insights-${month}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const monthField = { border: '1px solid var(--line)', borderRadius: 9, padding: '7px 10px', background: 'var(--card)', color: 'var(--ink)', font: 'inherit' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Insights</h2>
        <input type="month" style={monthField} value={month} max={maxMonth} onChange={(e) => setMonth(e.target.value)} />
        <MoneyToggle view={view} onChange={setView} />
        <button className="btn ghost sm" onClick={exportCsv} disabled={model.count === 0} style={{ marginLeft: 'auto' }}>Export CSV</button>
      </div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>{monthName} · {model.count} streams · {model.totalHours.toFixed(1)}h</div>

      <div className="cards" style={{ marginTop: 14 }}>
        <div className="stat"><div className="label">{LABEL[view]}</div><div className="value">{gbp0(model.totals[field.value])}</div></div>
        <div className="stat"><div className="label">Profit</div><div className="value pos">{gbp0(model.totals.trueProfit)}</div></div>
        <div className="stat"><div className="label">Streams</div><div className="value">{model.count}</div></div>
      </div>

      <Section title="By department" rows={model.byDepartment} field={field} dot />
      <Section title="By channel" rows={model.byChannel} field={field} dot />
      <Section title="By platform" rows={model.byPlatform} field={field} />
      <Section title="By stream type" rows={model.byType} field={field} />
    </div>
  )
}

function Section({ title, rows, field, dot }) {
  const th = { textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '0 10px 6px' }
  const td = { padding: '7px 10px', fontSize: 13, borderTop: '1px solid var(--line)', textAlign: 'right' }
  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? <p className="note" style={{ margin: 0 }}>No streams this month.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 460 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Name</th><th style={th}>Streams</th><th style={th}>Hours</th><th style={th}>Revenue</th><th style={th}>Profit</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {dot && <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColour(r.key), flex: '0 0 auto' }} />}
                      {r.key}
                    </span>
                  </td>
                  <td style={td}>{r.count}</td>
                  <td style={td}>{r.hours.toFixed(1)}</td>
                  <td style={td}>{gbp0(r.t[field.value])}</td>
                  <td style={{ ...td, color: r.t.trueProfit >= 0 ? 'var(--good)' : 'var(--red)' }}>{gbp0(r.t.trueProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
