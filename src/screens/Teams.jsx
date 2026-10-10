import { useState, useMemo } from 'react'
import { computeStream, sumMoney } from '../money'
import { gbp0, gbp, int, useSource, reassignDepartment } from '../data'

// ============================================================
// TEAMS (Stage 5 — V1 parity)
// People roster grouped by department. Per person: role, stock value, shows,
// gross. Tap -> peek their stock + reassign department (admin/manager).
// Scoped: lead sees own department only (via scopeSource).
// ============================================================
const short = (p) => String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '')
const ROLE_LABEL = { breaker: 'Streamer', channel_lead: 'Lead', warehouse: 'Warehouse', manager: 'Manager', admin: 'Admin' }

export default function Teams({ scoped }) {
  const { refresh } = useSource()
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const canManage = scoped.cap?.isAdmin || scoped.cap?.isManager
  const vatOf = (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'

  // departments present
  const departments = useMemo(() => [...new Set(scoped.profiles.map((p) => p.department).filter(Boolean))].sort(), [scoped])

  const people = useMemo(() => {
    return scoped.profiles.map((p) => {
      const holdings = scoped.holdings.filter((h) => h.holderId === p.id && h.qty > 0)
      const stockValue = holdings.reduce((a, h) => a + h.qty * h.unitCost, 0)
      const stockUnits = holdings.reduce((a, h) => a + h.qty, 0)
      const streams = scoped.streams.filter((s) => s.streamerId === p.id)
      const ladders = streams.map((s) => {
        const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
        return computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
          lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
      })
      const t = sumMoney(ladders)
      return { ...p, holdings, stockValue, stockUnits, shows: streams.length, gross: t.gross }
    })
  }, [scoped])

  const byDept = useMemo(() => {
    const g = {}
    for (const p of people) { const d = p.department || '— Unassigned'; (g[d] = g[d] || []).push(p) }
    for (const d of Object.keys(g)) g[d].sort((a, b) => b.gross - a.gross)
    return g
  }, [people])

  const reassign = async (id, dept) => {
    setBusy(id); setErr(null)
    try { await reassignDepartment(id, dept); await refresh() }
    catch (e) { setErr(e.message) } finally { setBusy(null) }
  }
  const nameOfProduct = (sid) => scoped.stockItems.find((x) => x.id === sid)?.product || '—'

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Teams</h2>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>{people.length} people across {Object.keys(byDept).length} departments</div>
      {err && <div style={{ color: '#c82828', marginBottom: 8 }}>{err}</div>}

      {Object.entries(byDept).sort((a, b) => a[0].localeCompare(b[0])).map(([dept, members]) => (
        <div key={dept} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#777', marginBottom: 6 }}>{dept} · {members.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {members.map((p) => {
              const open = openId === p.id
              return (
                <div key={p.id} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
                  <button onClick={() => setOpenId(open ? null : p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 999, background: p.colour || '#ccc', flexShrink: 0 }} />
                    <div style={{ flex: '1 1 150px', minWidth: 120 }}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>{ROLE_LABEL[p.role] || p.role || '—'}{p.shows > 0 ? ` · ${p.shows} shows · ${gbp0(p.gross)}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 90 }}>
                      <div style={{ fontWeight: 700 }}>{int(p.stockUnits)} units</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{gbp0(p.stockValue)} on shelf</div>
                    </div>
                  </button>

                  {open && (
                    <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 14px' }}>
                      {/* peek their stock */}
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>On their shelf</div>
                      {p.holdings.length === 0 ? <p style={{ color: '#888', fontSize: 13 }}>Nothing on shelf.</p> : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          {p.holdings.map((h, i) => (
                            <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: '#f5f4f1' }}>
                              {short(nameOfProduct(h.stockItemId))}: {int(h.qty)} (W{h.waveNo})
                            </span>
                          ))}
                        </div>
                      )}
                      {/* reassign */}
                      {canManage && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, color: '#999' }}>Department:</span>
                          <select value={p.department || ''} disabled={busy === p.id}
                            onChange={(e) => reassign(p.id, e.target.value || null)}
                            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }}>
                            <option value="">Unassigned</option>
                            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                          {busy === p.id && <span style={{ fontSize: 12, color: '#888' }}>saving…</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {people.length === 0 && <p style={{ color: '#888' }}>No people in scope.</p>}
    </div>
  )
}
