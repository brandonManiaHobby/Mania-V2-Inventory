import { useState, useMemo } from 'react'
import { computeMoney, sumMoney } from '../money'
import { gbp0, pct, monthKey, displayDate, parseLocalDate } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'
import StatCard from '../components/StatCard'
import OverlayChart from '../components/OverlayChart'

// ============================================================
// DASHBOARD (Stage 5 — first real lens)
// Derives entirely from the scoped source + money engine. Computes NOTHING
// of its own — every figure is a ladder layer. The money toggle switches
// which layer the stats/graph show; gross+net overlay always on the graph.
// ============================================================
export default function Dashboard({ scoped }) {
  const [view, setView] = useState('gross')

  // Build a ladder for every stream from raw facts via the engine.
  // (A stream's cost basis = its stored total stock cost proxy; for now we
  // use line costs where present. Net = streamer-entered if present, else gross.)
  const ladders = useMemo(() => {
    return scoped.streams.map((s) => {
      // cost for the stream = sum of its lines' qty*unitCost (stock cost)
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const cost = lines.reduce((a, l) => a + l.qty * l.unitCost, 0)
      // VAT treatment: streams are mixed product; treat as standard for now
      // (per-product VAT refinement comes with the product screens).
      return {
        streamDate: s.streamDate,
        ...computeMoney({
          gross: s.totalSales,
          net: s.net,              // source of truth if entered; else = gross
          costPaid: cost,
          vatTreatment: 'standard',
        }),
      }
    })
  }, [scoped])

  const totals = useMemo(() => sumMoney(ladders), [ladders])
  const field = VIEW_FIELD[view]

  // Monthly series for the overlay graph (gross + net).
  const monthly = useMemo(() => {
    const byMonth = {}
    for (const l of ladders) {
      const m = monthKey(l.streamDate)
      if (!m) continue
      byMonth[m] = byMonth[m] || { gross: 0, net: 0 }
      byMonth[m].gross += l.gross
      byMonth[m].net += l.net
    }
    const months = Object.keys(byMonth).sort()
    return { months, data: months.map((m) => byMonth[m]) }
  }, [ladders])

  const monthLabel = (m) => {
    const d = parseLocalDate(m + '-01')
    return d ? d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : m
  }

  const headlineValue = gbp0(totals[field.value])
  const headlineMargin = field.margin ? pct(totals[field.margin]) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <MoneyToggle view={view} onChange={setView} />
      </div>

      {/* Headline stats — follow the toggle */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <StatCard label={MONEY_LABEL[view]} value={headlineValue}
          sub={headlineMargin ? `${headlineMargin} margin` : `${scoped.streams.length} streams`} />
        <StatCard label="Gross" value={gbp0(totals.gross)} />
        <StatCard label="Fees paid" value={gbp0(totals.fees)} accent="#c0392b" />
        <StatCard label="VAT owed" value={gbp0(totals.vatOwed)} accent="#b8700a" />
        <StatCard label="True profit" value={gbp0(totals.trueProfit)} accent="#1a7f37"
          sub={`${pct(totals.netMarginPct)} net margin`} />
      </div>

      {/* Overlay graph — gross + net together */}
      <div style={{ marginTop: 22, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Revenue by month — gross vs net</div>
        {monthly.months.length === 0 ? (
          <p style={{ color: '#888' }}>No stream data in scope.</p>
        ) : (
          <OverlayChart
            labels={monthly.months.map(monthLabel)}
            formatY={(v) => gbp0(v)}
            series={[
              { label: 'Gross', colour: '#4a7fe0', points: monthly.data.map((d, i) => ({ x: i, y: d.gross })) },
              { label: 'Net', colour: '#1a7f37', points: monthly.data.map((d, i) => ({ x: i, y: d.net })) },
            ]}
          />
        )}
      </div>

      <p style={{ color: '#888', fontSize: 12, marginTop: 12 }}>
        Every figure is a money-engine ladder layer — no number computed here. Toggle switches the lens.
      </p>
    </div>
  )
}

const MONEY_LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }
