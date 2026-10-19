import { useState, useMemo } from 'react'
import { computeStream, sumMoney } from '../money'
import { gbp0, gbp, int, useSource, reassignDepartment } from '../data'
import StreamerInspectModal from '../components/StreamerInspectModal'

// ============================================================
// TEAMS — departments as collapsible BRAND tiles. Each tile carries the
// department's logo(s); tap to expand the people in it. Per person: role,
// stock value, shows, gross, inspect performance, peek stock, reassign.
// ============================================================
const short = (p) => String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '')
const ROLE_LABEL = { breaker: 'Streamer', channel_lead: 'Lead', warehouse: 'Warehouse', manager: 'Manager', admin: 'Admin' }

// Real department strings -> display group (tile).
function groupOf(dept) {
  const d = String(dept || '').trim().toLowerCase()
  if (d === 'gc mania') return 'GC Mania'
  if (d === 'mania tcg') return 'Mania TCG'
  if (d === 'mania' || d === '101' || d === 'mania/101') return 'Mania/101'
  return 'Warehouse / Management'
}
// Tile definitions, in display order. Logos read on the tile's background.
const GROUPS = [
  { key: 'Warehouse / Management', sub: 'Unassigned', logos: [], dark: false },
  { key: 'GC Mania', logos: ['/logo-gcmania.png'], dark: false },
  { key: 'Mania/101', logos: ['/mania-logo-dark.png', '/logo-101-login-dark.png'], dark: false },
  { key: 'Mania TCG', logos: ['/mania-logo-white.png'], dark: true },
]

export default function Teams({ scoped }) {
  const { refresh } = useSource()
  const [openGroup, setOpenGroup] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [inspect, setInspect] = useState(null)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const canManage = scoped.cap?.isAdmin || scoped.cap?.isManager
  const vatOf = (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'

  const departments = useMemo(() => [...new Set(scoped.profiles.map((p) => p.department).filter(Boolean))].sort(), [scoped])

  const people = useMemo(() => scoped.profiles.map((p) => {
    const holdings = scoped.holdings.filter((h) => h.holderId === p.id && h.qty > 0)
    const stockValue = holdings.reduce((a, h) => a + h.qty * h.unitCost, 0)
    const stockUnits = holdings.reduce((a, h) => a + h.qty, 0)
    const streams = scoped.streams.filter((s) => s.streamerId === p.id)
    const ladders = streams.map((s) => {
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      return computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping, promo: s.promo },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
    })
    const t = sumMoney(ladders)
    return { ...p, holdings, stockValue, stockUnits, shows: streams.length, gross: t.gross }
  }), [scoped])

  const byGroup = useMemo(() => {
    const g = {}
    for (const p of people) { const k = groupOf(p.department); (g[k] = g[k] || []).push(p) }
    for (const k of Object.keys(g)) g[k].sort((a, b) => b.gross - a.gross)
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
      <div style={{ fontSize: 12, color: '#999', marginBottom: 14 }}>{people.length} people · tap a department to open it</div>
      {err && <div style={{ color: '#c82828', marginBottom: 8 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {GROUPS.filter((g) => (byGroup[g.key] || []).length).map((g) => {
          const members = byGroup[g.key]
          const open = openGroup === g.key
          const totShows = members.reduce((a, m) => a + m.shows, 0)
          const totGross = members.reduce((a, m) => a + m.gross, 0)
          const dark = g.dark
          return (
            <div key={g.key} style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid ' + (dark ? '#2c231d' : '#eee'), background: dark ? '#241c17' : '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <button onClick={() => setOpenGroup(open ? null : g.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '16px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 auto', minWidth: 0 }}>
                  {g.logos.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {g.logos.map((src, i) => <img key={i} src={src} alt={g.key} style={{ height: 32, width: 'auto', objectFit: 'contain' }} />)}
                    </div>
                  ) : (
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{g.key}{g.sub && <span style={{ fontWeight: 400, color: '#999', fontSize: 13 }}> · {g.sub}</span>}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: dark ? '#fff' : '#111' }}>{members.length} {members.length === 1 ? 'person' : 'people'}</div>
                  <div style={{ fontSize: 12, color: dark ? '#b7a99c' : '#999' }}>{totShows > 0 ? `${totShows} shows · ${gbp0(totGross)}` : 'no shows yet'}</div>
                </div>
                <div style={{ fontSize: 18, color: dark ? '#b7a99c' : '#bbb', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</div>
              </button>

              {open && (
                <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: dark ? '#241c17' : '#fff' }}>
                  {members.map((p) => {
                    const mo = openId === p.id
                    return (
                      <div key={p.id} style={{ border: '1px solid ' + (dark ? '#2c231d' : '#eee'), borderRadius: 12, background: dark ? '#1c1612' : '#fff', overflow: 'hidden' }}>
                        <button onClick={() => setOpenId(mo ? null : p.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap', color: dark ? '#f3ede7' : 'inherit' }}>
                          <div style={{ width: 10, height: 10, borderRadius: 999, background: p.colour || '#ccc', flexShrink: 0 }} />
                          <div style={{ flex: '1 1 150px', minWidth: 120 }}>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 12, color: dark ? '#b7a99c' : '#999' }}>{ROLE_LABEL[p.role] || p.role || '—'}{p.shows > 0 ? ` · ${p.shows} shows · ${gbp0(p.gross)}` : ''}</div>
                          </div>
                          <div style={{ textAlign: 'right', minWidth: 90 }}>
                            <div style={{ fontWeight: 700 }}>{int(p.stockUnits)} units</div>
                            <div style={{ fontSize: 12, color: dark ? '#b7a99c' : '#888' }}>{gbp0(p.stockValue)} on shelf</div>
                          </div>
                        </button>

                        {mo && (
                          <div style={{ borderTop: '1px solid ' + (dark ? '#2c231d' : '#f0f0f0'), padding: '12px 14px', background: dark ? '#1c1612' : '#fff', color: dark ? '#f3ede7' : 'inherit' }}>
                            <button onClick={() => setInspect(p)} style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--orange, #e8702a)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                              📊 Inspect performance
                            </button>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>On their shelf</div>
                            {p.holdings.length === 0 ? <p style={{ color: dark ? '#b7a99c' : '#888', fontSize: 13 }}>Nothing on shelf.</p> : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                {p.holdings.map((h, i) => (
                                  <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: dark ? '#2c231d' : '#f5f4f1' }}>
                                    {short(nameOfProduct(h.stockItemId))}: {int(h.qty)} (W{h.waveNo})
                                  </span>
                                ))}
                              </div>
                            )}
                            {canManage && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13, color: dark ? '#b7a99c' : '#999' }}>Department:</span>
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
              )}
            </div>
          )
        })}
      </div>
      {people.length === 0 && <p style={{ color: '#888' }}>No people in scope.</p>}

      {inspect && <StreamerInspectModal person={inspect} scoped={scoped} onClose={() => setInspect(null)} />}
    </div>
  )
}
