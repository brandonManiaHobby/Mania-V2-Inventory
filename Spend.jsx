import { useState, useMemo } from 'react'
import { gbp0, monthKey, parseLocalDate, toDateKey } from '../data'
import StatCard from '../components/StatCard'

// ============================================================
// SPEND (Finance group, Stage 5)
// The home for platform cost: fees paid + shipping spend, rolled up by
// day / week / month. Reads the new stream.net/shipping/fees fields.
// Hero-number-first: total spend big, period breakdown below.
// ============================================================
const PERIODS = [{ k: 'day', label: 'Day' }, { k: 'week', label: 'Week' }, { k: 'month', label: 'Month' }]

function weekKey(ymd) {
  const d = parseLocalDate(ymd); if (!d) return null
  // ISO-ish week start (Mon)
  const day = (d.getDay() + 6) % 7
  const monday = new Date(d); monday.setDate(d.getDate() - day)
  return toDateKey(monday)
}

export default function Spend({ scoped, embedded }) {
  const [period, setPeriod] = useState('month')

  // Giveaway cost per stream — the cost of stock given away (line_kind='giveaway').
  const giftByStream = useMemo(() => {
    const m = {}
    for (const l of scoped.streamLines) {
      if (l.lineKind === 'giveaway') m[l.streamId] = (m[l.streamId] || 0) + (Number(l.qty) || 0) * (Number(l.unitCost) || 0)
    }
    return m
  }, [scoped])

  // Each stream carries fees + shipping + promo (nullable) and may have giveaway
  // cost from its lines. All four are money out -> Total Spend.
  const rows = useMemo(() => {
    const bucket = {}
    for (const s of scoped.streams) {
      const fees = Number(s.fees) || 0            // note: source normalises; may be null->0
      const shipping = Number(s.shipping) || 0
      const promo = Number(s.promo) || 0
      const giveaway = giftByStream[s.id] || 0
      if (fees === 0 && shipping === 0 && promo === 0 && giveaway === 0) continue
      let key
      if (period === 'day') key = s.streamDate
      else if (period === 'week') key = weekKey(s.streamDate)
      else key = monthKey(s.streamDate)
      if (!key) continue
      bucket[key] = bucket[key] || { key, fees: 0, shipping: 0, promo: 0, giveaway: 0, streams: 0 }
      bucket[key].fees += fees
      bucket[key].shipping += shipping
      bucket[key].promo += promo
      bucket[key].giveaway += giveaway
      bucket[key].streams += 1
    }
    return Object.values(bucket).sort((a, b) => b.key.localeCompare(a.key))
  }, [scoped, period, giftByStream])

  const rowTotal = (r) => r.fees + r.shipping + r.promo + r.giveaway
  const totals = useMemo(() => rows.reduce((a, r) => ({
    fees: a.fees + r.fees, shipping: a.shipping + r.shipping, promo: a.promo + r.promo,
    giveaway: a.giveaway + r.giveaway, total: a.total + rowTotal(r),
  }), { fees: 0, shipping: 0, promo: 0, giveaway: 0, total: 0 }), [rows])

  const label = (k) => {
    if (period === 'month') { const d = parseLocalDate(k + '-01'); return d ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : k }
    const d = parseLocalDate(k)
    if (period === 'week') return 'Week of ' + (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : k)
    return d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : k
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        {!embedded && <h2 style={{ margin: 0 }}>Spend</h2>}
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999 }}>
          {PERIODS.map((p) => (
            <button key={p.k} onClick={() => setPeriod(p.k)}
              style={{ padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13,
                fontWeight: period === p.k ? 700 : 400, background: period === p.k ? '#fff' : 'transparent' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero totals */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <StatCard label="Total spend" value={gbp0(totals.total)} accent="#c0392b" sub="fees + shipping + promo + giveaways" />
        <StatCard label="Platform fees" value={gbp0(totals.fees)} />
        <StatCard label="Shipping" value={gbp0(totals.shipping)} />
        <StatCard label="Promo / boosts" value={gbp0(totals.promo)} />
        <StatCard label="Giveaways" value={gbp0(totals.giveaway)} />
      </div>

      {/* Period breakdown */}
      <div style={{ marginTop: 20, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>By {period}</div>
        {rows.length === 0 ? (
          <p style={{ color: '#888' }}>No spend recorded yet. Fees, shipping and promo appear once streams are saved with those entered; giveaways appear from stock given away on stream.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr style={{ textAlign: 'right', color: '#999', fontSize: 12 }}>
                  <th style={{ textAlign: 'left', padding: '6px 0' }}>{PERIODS.find((p) => p.k === period).label}</th>
                  <th>Fees</th><th>Shipping</th><th>Promo</th><th>Giveaways</th><th>Total</th><th>Streams</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} style={{ borderTop: '1px solid #f3f3f3', textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '7px 0' }}>{label(r.key)}</td>
                    <td>{gbp0(r.fees)}</td>
                    <td>{gbp0(r.shipping)}</td>
                    <td>{gbp0(r.promo)}</td>
                    <td>{gbp0(r.giveaway)}</td>
                    <td style={{ fontWeight: 700 }}>{gbp0(rowTotal(r))}</td>
                    <td style={{ color: '#888' }}>{r.streams}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
