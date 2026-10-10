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
      .filter((s) => !q || (s.title || '').toLowerCase().includes(q.toLowerCase()) || (s.streamerName || '').toLowerCase().includes(q.toLowerCase()) || (s.platform || '').toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.streamDate || '').localeCompare(a.streamDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((s) => {
        const lines = scoped.streamLines.filter((l) => l.streamId === s.id)
        const live = lines.filter((l) => !l.brokered)
        const m = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
          live.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
        return { s, lines, m }
      })
  }, [scoped, q])

  const del = async (id) => {
    if (!window.confirm('Delete this stream? Stock will be restored.')) return
    setBusy(id); setErr(null)
    try { await deleteStream(id); await refresh(); setOpenId(null) }
    catch (e) { setErr(e.message) } finally { setBusy(null) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Past streams</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / streamer / platform…"
          style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #ddd', font: 'inherit', width: 240 }} />
      </div>
      <div style={{ fontSize: 12, color: '#999', margin: '12px 0 6px' }}>{rows.length} streams · tap for the receipt</div>
      {err && <div style={{ color: '#c82828', marginBottom: 8 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(({ s, lines, m }) => {
          const open = openId === s.id
          const netApplied = s.net != null
          return (
            <div key={s.id} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
              <button onClick={() => { setOpenId(open ? null : s.id); setEditId(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 160 }}>
                  <div style={{ fontWeight: 600 }}>{s.title || short(lines[0]?.product || 'Stream')}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>{displayDate(s.streamDate)} · {s.streamerName}{s.platform ? ` · ${s.platform}` : ''}{s.channel ? ` · ${s.channel}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{gbp0(netApplied ? m.trueProfit : m.gross)}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{netApplied ? 'net profit' : 'gross'}</div>
                </div>
              </button>

              {open && editId !== s.id && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 12 }}>
                    {[['Gross', m.gross], netApplied && ['Fees', m.fees], netApplied && ['Net', m.net], ['VAT owed', m.vatOwed], ['Cost', m.costPaid], [netApplied ? 'Net profit' : 'Profit', m.trueProfit]].filter(Boolean).map(([k, v]) => (
                      <div key={k}><div style={{ color: '#999', fontSize: 11 }}>{k}</div><div style={{ fontWeight: 600 }}>{gbp(v)}</div></div>
                    ))}
                    {s.shipping > 0 && <div><div style={{ color: '#999', fontSize: 11 }}>Shipping</div><div style={{ fontWeight: 600 }}>{gbp(s.shipping)}</div></div>}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 360 }}>
                      <thead><tr style={{ color: '#999', fontSize: 12, textAlign: 'right' }}><th style={{ textAlign: 'left' }}>Product</th><th>Qty</th><th>Sold</th></tr></thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.id} style={{ borderTop: '1px solid #f5f5f5', textAlign: 'right' }}>
                            <td style={{ textAlign: 'left', padding: '4px 0' }}>{short(l.product)}{l.brokered ? ' (brokered)' : ''}</td>
                            <td>{l.qty}</td><td>{gbp0(l.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditId(s.id)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#faf9f7', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                    <button onClick={() => del(s.id)} disabled={busy === s.id} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e0b0b0', background: '#fff', color: '#c82828', cursor: 'pointer', fontWeight: 600 }}>
                      {busy === s.id ? 'Deleting…' : 'Delete stream'}
                    </button>
                  </div>
                </div>
              )}

              {open && editId === s.id && (
                <EditForm s={s} lines={lines} scoped={scoped} vatOf={vatOf}
                  onCancel={() => setEditId(null)}
                  onSaved={async () => { setEditId(null); await refresh() }} />
              )}
            </div>
          )
        })}
        {rows.length === 0 && <p style={{ color: '#888' }}>No streams in scope.</p>}
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
      await editStream({ streamId: s.id, streamerId, platform, streamDate, title,
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
