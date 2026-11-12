import { useState, useMemo } from 'react'
import { useSource, gbp0, deleteCardShow } from '../data'
import { ShowModal, totalsFor, entrySales, fmtDates, fmtH, StatPill, Figure, Chip } from './CardShowShared'

// PREVIOUS SHOWS — snapshot of every logged show and how it did. Click one to
// open the full record and edit entries / costs.
export default function PastShows({ scoped }) {
  const { refresh } = useSource()
  const shows = scoped?.cardShows || []
  const entries = scoped?.cardShowEntries || []
  const costs = scoped?.cardShowCosts || []
  const profiles = scoped?.profiles || []
  const [open, setOpen] = useState(null)

  const rows = useMemo(() => [...shows].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''))), [shows])
  const totalProfit = rows.reduce((a, s) => a + totalsFor(s, entries, costs).profit, 0)
  const totalHours = entries.reduce((a, e) => a + (e.hours || 0), 0)
  const totalSales = entries.reduce((a, e) => a + entrySales(e), 0)

  async function doDelete(s) {
    if (!window.confirm(`Delete "${s.name}"? This removes the show, its entries and costs.`)) return
    try { await deleteCardShow(s.id); await refresh() } catch (e) { alert(e.message || String(e)) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <StatPill label="Shows" value={rows.length} />
        <StatPill label="Hours logged" value={fmtH(totalHours)} />
        <StatPill label="Total sales" value={gbp0(totalSales)} />
        <StatPill label="Total profit" value={gbp0(totalProfit)} tone={totalProfit >= 0 ? 'good' : 'bad'} />
      </div>

      {rows.length === 0 && <div className="empty">No shows logged yet. Use <strong>Record show</strong> to add one.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((s) => {
          const t = totalsFor(s, entries, costs)
          return (
            <div key={s.id} onClick={() => setOpen(s)}
              style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>{s.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                  {fmtDates(s)}{s.location ? ` · ${s.location}` : ''}{s.days > 1 ? ` · ${s.days} days` : ''}{s.operatingHours ? ` · ${fmtH(s.operatingHours)} open` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {t.depts.map((d) => <Chip key={d}>{d}</Chip>)}
                  {t.revPerHour != null && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{gbp0(t.revPerHour)}/hr{t.revPerDay != null ? ` · ${gbp0(t.revPerDay)}/day` : ''}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <Figure label="Hours" value={fmtH(t.hours)} />
                <Figure label="Sales" value={gbp0(t.sales)} />
                <Figure label="Costs" value={gbp0(t.cost)} />
                <Figure label="Profit" value={gbp0(t.profit)} tone={t.profit >= 0 ? 'good' : 'bad'} big />
              </div>
            </div>
          )
        })}
      </div>

      {open && (
        <ShowModal row={open} profiles={profiles} allEntries={entries} allCosts={costs}
          onClose={() => setOpen(null)} onChanged={refresh} onDelete={doDelete} />
      )}
    </div>
  )
}
