import { useState, useMemo } from 'react'
import { computeStream } from '../money'
import { gbp0, gbp, pct, displayDate, todayKey, useSource, deleteStream, editStream } from '../data'

// ============================================================
// PAST STREAMS (Stage 5 — V1 parity, hardened)
// List -> receipt (full money ladder + lines). Delete (atomic, restores
// stock). EDIT (atomic reverse-and-reapply via edit_stream) with a live
// money preview. Both refresh the shared source so every screen recomputes.
// ============================================================
const short = (p) => String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '')
const PLATFORMS = ['eBay Live', 'Whatnot', 'TikTok Shop', 'Fanatics']
const hoursOf = (s) => {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart); return d > 0 ? d : 0
}

export default function PastStreams({ scoped }) {
  const { refresh } = useSource()
  const [openId, setOpenId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const vatOf = (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'

  const rows = useMemo(() => {
    return [...scoped.streams]
      .filter((s) => !q || (s.title || '').toLowerCase().includes(q.toLowerCase()) || (s.streamerName || '').toLowerCase().includes(q.toLowerCase()) || (s.platform || '').toLowerCase().includes(q.toLowerCase()) || (s.channel || '').toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.streamDate || '').localeCompare(a.streamDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((s) => {
        const lines = scoped.streamLines.filter((l) => l.streamId === s.id)
        const live = lines.filter((l) => !l.brokered)
        const m = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
          live.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
        return { s, lines, m, hours: hoursOf(s) }
      })
  }, [scoped, q])

  const del = async (id) => {
    if (!window.confirm('Delete this stream? Stock will be restored.')) return
    setBusy(id); setErr(null)
    try { await deleteStream(id); await refresh(); setOpenId(null) }
    catch (e) { setErr(e.message) } finally { setBusy(null) }
  }

  const open = rows.find((r) => r.s.id === openId)
  const th = { textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '0 12px 8px', textTransform: 'uppercase', letterSpacing: 0.3 }
  const td = { padding: '10px 12px', fontSize: 13, borderTop: '1px solid var(--line)', verticalAlign: 'top' }

  return (
    <div>
      {open && (
        <ReceiptModal row={open} scoped={scoped} vatOf={vatOf}
          editing={editId === open.s.id}
          onEdit={() => setEditId(open.s.id)}
          onDelete={() => del(open.s.id)} busy={busy === open.s.id}
          onCancelEdit={() => setEditId(null)}
          onSaved={async () => { setEditId(null); await refresh() }}
          onClose={() => { setOpenId(null); setEditId(null) }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Past streams</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / streamer / platform / channel…"
          style={{ padding: '9px 14px', borderRadius: 11, border: '1px solid var(--line)', font: 'inherit', width: 300, background: 'var(--card)', color: 'var(--ink)' }} />
      </div>
      <div style={{ fontSize: 12, color: '#999', margin: '12px 0 8px' }}>{rows.length} streams · click a row for the receipt</div>
      {err && <div style={{ color: '#c82828', marginBottom: 8 }}>{err}</div>}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead><tr>
              <th style={th}>Date</th><th style={th}>Streamer</th><th style={th}>Platform</th>
              <th style={{ ...th, textAlign: 'right' }}>Revenue</th><th style={{ ...th, textAlign: 'right' }}>Profit</th><th style={th}>Stream</th>
            </tr></thead>
            <tbody>
              {rows.map(({ s, m }) => {
                const netApplied = s.net != null
                const rev = netApplied ? m.net : m.gross
                return (
                  <tr key={s.id} onClick={() => { setOpenId(s.id); setEditId(null) }} style={{ cursor: 'pointer' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{displayDate(s.streamDate, { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{s.streamerName || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--muted)' }}>{s.platform || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{gbp0(rev)}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', color: m.trueProfit >= 0 ? 'var(--good)' : 'var(--red)', fontWeight: 600 }}>{gbp0(m.trueProfit)}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{s.title || short(scoped.streamLines.find((l) => l.streamId === s.id)?.product || 'Stream')}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>{[s.channel, s.streamType].filter(Boolean).join(' · ')}</div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={6} style={{ ...td, color: '#888' }}>No streams match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Click-through receipt — the V1 tile: who/where/when up top, the money band,
// then WHAT RAN per product, with Edit / Delete.
function ReceiptModal({ row, scoped, vatOf, editing, onEdit, onDelete, busy, onCancelEdit, onSaved, onClose }) {
  const { s, lines, m, hours } = row
  const netApplied = s.net != null
  const rev = netApplied ? m.net : m.gross
  const revPerHour = hours > 0 ? rev / hours : null
  const cell = { flex: '1 1 110px', minWidth: 96 }
  const lbl = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--muted)', fontWeight: 700 }
  const val = { fontSize: 15, fontWeight: 700, marginTop: 2 }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 90, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 620, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderLeft: '3px solid var(--orange)', paddingLeft: 10, marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>{s.title || 'Stream'}</h3>
            <div className="note" style={{ marginTop: 2 }}>
              {displayDate(s.streamDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              {s.streamUrl && <> · <a href={s.streamUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2a52be', fontWeight: 600, textDecoration: 'none' }}>↗ Watch stream</a></>}
            </div>
          </div>
          <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', cursor: 'pointer', font: 'inherit' }}>Close</button>
        </div>

        {editing ? (
          <EditForm s={s} lines={lines} scoped={scoped} vatOf={vatOf} onCancel={onCancelEdit} onSaved={onSaved} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={cell}><div style={lbl}>Channel</div><div style={val}>{s.channel || '—'}</div></div>
              <div style={cell}><div style={lbl}>Platform</div><div style={val}>{s.platform || '—'}</div></div>
              <div style={cell}><div style={lbl}>Streamer</div><div style={val}>{s.streamerName || '—'}</div></div>
              <div style={cell}><div style={lbl}>Type</div><div style={val}>{s.streamType || '—'}</div></div>
              <div style={cell}><div style={lbl}>Time</div><div style={val}>{s.streamStart ? `${s.streamStart}${s.streamEnd ? '–' + s.streamEnd : ''}` : '—'}</div><div className="note">{hours > 0 ? hours.toFixed(1) + ' hrs' : ''}</div></div>
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '14px', borderRadius: 12, background: 'var(--bg)', marginBottom: 14 }}>
              <div style={cell}><div style={lbl}>Gross</div><div style={val}>{gbp(m.gross)}</div></div>
              {netApplied ? (
                <>
                  <div style={cell}><div style={lbl}>Fees</div><div style={{ ...val, color: '#c0392b' }}>{gbp(m.fees)}</div></div>
                  <div style={cell}><div style={lbl}>Net</div><div style={val}>{gbp(m.net)}</div></div>
                </>
              ) : (
                <div style={cell}><div style={lbl}>Net</div><div style={val}>{gbp(m.gross)}</div><div className="note">no fees entered</div></div>
              )}
              <div style={cell}><div style={lbl}>VAT owed</div><div style={{ ...val, color: '#b8700a' }}>{gbp(m.vatOwed)}</div><div className="note">{m.vatOwed > 0 ? 'standard-rated' : 'VAT-free'}</div></div>
              <div style={cell}><div style={lbl}>Stock cost</div><div style={{ ...val, color: '#c0392b' }}>{gbp(m.costPaid)}</div></div>
              <div style={cell}><div style={lbl}>Profit</div><div style={{ ...val, color: m.trueProfit >= 0 ? 'var(--good)' : 'var(--red)' }}>{gbp(m.trueProfit)}</div><div className="note">{pct(m.netMarginPct)} margin</div></div>
              <div style={cell}><div style={lbl}>Revenue / hour</div><div style={val}>{revPerHour != null ? gbp(revPerHour) : '—'}</div></div>
              {s.shipping > 0 && <div style={cell}><div style={lbl}>Shipping</div><div style={val}>{gbp(s.shipping)}</div></div>}
            </div>
            {!netApplied && <div className="note" style={{ marginTop: -6, marginBottom: 12 }}>No net recorded — VAT is calculated on gross (platform fees not deducted). Add net to this stream to capture fees.</div>}

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>What ran</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 420 }}>
                <thead><tr style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'right' }}><th style={{ textAlign: 'left' }}>Product</th><th>Qty</th><th>Cost/unit</th><th>Sold</th><th>Profit</th></tr></thead>
                <tbody>
                  {lines.map((l) => {
                    const cost = (Number(l.qty) || 0) * (Number(l.unitCost) || 0)
                    const profit = (Number(l.lineTotal) || 0) - cost
                    return (
                      <tr key={l.id} style={{ borderTop: '1px solid var(--line)', textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '5px 0' }}>{short(l.product)}{l.brokered ? ' (brokered)' : ''}</td>
                        <td>{l.qty}</td>
                        <td style={{ color: 'var(--muted)' }}>{gbp(l.unitCost || 0)}</td>
                        <td>{gbp(l.lineTotal)}</td>
                        <td style={{ color: profit >= 0 ? 'var(--good)' : 'var(--red)' }}>{gbp(profit)}</td>
                      </tr>
                    )
                  })}
                  {lines.length === 0 && <tr><td colSpan={5} style={{ padding: 8, color: 'var(--muted)' }}>No product lines.</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button onClick={onEdit} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, font: 'inherit' }}>Edit stream</button>
              <button onClick={onDelete} disabled={busy} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #e0b0b0', background: 'var(--card)', color: '#c82828', cursor: 'pointer', fontWeight: 600, font: 'inherit' }}>
                {busy ? 'Deleting…' : 'Delete stream'}
              </button>
            </div>
            <div className="note" style={{ marginTop: 10 }}>Something wrong? Edit corrects the details; deleting returns the stock and wipes it from all figures.</div>
          </>
        )}
      </div>
    </div>
  )
}

function EditForm({ s, lines, scoped, vatOf, onCancel, onSaved }) {
  const live = lines.filter((l) => !l.brokered)
  const [streamerId, setStreamerId] = useState(s.streamerId || '')
  const [platform, setPlatform] = useState(s.platform || '')
  const [streamDate, setStreamDate] = useState(s.streamDate || todayKey())
  const [title, setTitle] = useState(s.title || '')
  const [streamUrl, setStreamUrl] = useState(s.streamUrl || '')
  const [gross, setGross] = useState(String(s.totalSales ?? ''))
  const [showNet, setShowNet] = useState(s.net != null)
  const [net, setNet] = useState(s.net != null ? String(s.net) : '')
  const [shipping, setShipping] = useState(s.shipping ? String(s.shipping) : '')
  const [elines, setElines] = useState(live.map((l) => ({ stockItemId: l.stockItemId || '', qty: String(l.qty), price: String(l.lineTotal) })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const engineLines = useMemo(() => elines.filter((l) => l.stockItemId && l.qty).map((l) => {
    const waves = scoped.waves.filter((w) => w.stockItemId === l.stockItemId)
    const wave = waves.sort((a, b) => b.waveNo - a.waveNo)[0]
    return { stockItemId: l.stockItemId, qty: Number(l.qty) || 0, unitCost: wave?.unitCost || 0, lineTotal: Number(l.price) || 0, brokered: false }
  }), [elines, scoped])

  const preview = useMemo(() => computeStream({ gross: Number(gross) || 0, net: showNet && net !== '' ? Number(net) : null, shipping: showNet ? Number(shipping) || 0 : 0 }, engineLines, vatOf), [gross, showNet, net, shipping, engineLines])
  const netApplied = showNet && net !== ''

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }
  const setLine = (i, k, v) => setElines(elines.map((l, idx) => idx === i ? { ...l, [k]: v } : l))

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const { editStream } = await import('../data')
      await editStream({ streamId: s.id, streamerId, platform, streamDate, title, streamUrl,
        gross: Number(gross) || 0, net: netApplied ? Number(net) : null, shipping: showNet && shipping !== '' ? Number(shipping) : null, lines: elines })
      await onSaved()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ borderTop: '1px solid #f0f0f0', padding: '14px', background: '#fcfbf9' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Edit stream</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <select style={field} value={streamerId} onChange={(e) => setStreamerId(e.target.value)}>
          <option value="">Streamer…</option>{scoped.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select style={field} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">Platform…</option>{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input style={field} type="date" value={streamDate} onChange={(e) => setStreamDate(e.target.value)} />
        <input style={{ ...field, flex: 1, minWidth: 140 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <input style={{ ...field, flex: 1, minWidth: 200 }} type="url" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="Stream URL (share link)" />
      </div>
      {elines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <select style={{ ...field, flex: 2 }} value={l.stockItemId} onChange={(e) => setLine(i, 'stockItemId', e.target.value)}>
            <option value="">Product…</option>{scoped.stockItems.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.product}</option>)}
          </select>
          <input style={{ ...field, width: 70 }} type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
          <input style={{ ...field, width: 90 }} type="number" placeholder="£ sold" value={l.price} onChange={(e) => setLine(i, 'price', e.target.value)} />
        </div>
      ))}
      <button onClick={() => setElines([...elines, { stockItemId: '', qty: '', price: '' }])} style={{ ...field, cursor: 'pointer', background: '#fff' }}>+ Add product</button>
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginTop: 12 }}>
        <label style={{ fontSize: 13 }}>Gross £<br /><input style={{ ...field, width: 120, marginTop: 4 }} type="number" value={gross} onChange={(e) => setGross(e.target.value)} /></label>
        {!showNet ? <button onClick={() => setShowNet(true)} style={{ ...field, cursor: 'pointer', background: '#fff', color: '#1a7f37' }}>+ Add net</button> : (
          <>
            <label style={{ fontSize: 13 }}>Net £<br /><input style={{ ...field, width: 120, marginTop: 4 }} type="number" value={net} onChange={(e) => setNet(e.target.value)} /></label>
            <label style={{ fontSize: 13 }}>Shipping £<br /><input style={{ ...field, width: 110, marginTop: 4 }} type="number" value={shipping} onChange={(e) => setShipping(e.target.value)} /></label>
          </>
        )}
      </div>

      {/* live preview of the change */}
      <div style={{ marginTop: 12, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: '#999' }}>After edit:</span>
        <span><strong>{gbp0(preview.gross)}</strong> gross</span>
        {netApplied && <span><strong>{gbp0(preview.net)}</strong> net</span>}
        <span><strong>{gbp0(preview.vatOwed)}</strong> VAT</span>
        <span style={{ color: '#1a7f37' }}><strong>{gbp0(preview.trueProfit)}</strong> {netApplied ? 'net profit' : 'profit'} ({pct(preview.netMarginPct)})</span>
      </div>
      {err && <div style={{ color: '#c82828', marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#1a7f37', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button onClick={onCancel} disabled={busy} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>Cancel</button>
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>Editing reverses the old stock movement and re-applies the new one atomically. All screens update on save.</div>
    </div>
  )
}
