import { useState, useMemo, useEffect } from 'react'
import { computeStream } from '../money'
import { gbp, gbp0, pct, int, saveStream, todayKey, useSource } from '../data'
import StatCard from '../components/StatCard'
import SearchSelect from '../components/SearchSelect'
import { PLATFORMS, PLATFORM_CHANNELS, CHANNEL_DEPARTMENT, STREAM_TYPES, MIXED_TYPE_OPTIONS, DEPARTMENT_HOME } from '../constants'

// Blended platform fee rates -> auto-fill net (gross × (1 − fee)). Editable.
// Fanatics: 6% commission + 2.5% processing + £0.25/order ≈ 10% blended.
const PLATFORM_FEE = { Fanatics: 0.10 }

// ============================================================
// RECORD STREAM (V1 parity) — one grouped card laid out in TWO columns so it
// fills the width: left = the stream's details (who/where/when/gross), right =
// what sold (products, giveaways, brokered, singles). Live money preview +
// Review & submit run full-width beneath. Net + shipping live behind an optional
// "Add net" expander. Platform/channel prefill from the streamer's own history
// (falling back to their department's home channel).
// ============================================================
export default function RecordStream({ scoped }) {
  const { refresh } = useSource()
  const [gross, setGross] = useState('')
  const [showNet, setShowNet] = useState(false)
  const [net, setNet] = useState('')
  const [shipping, setShipping] = useState('')
  const [lines, setLines] = useState([{ stockItemId: '', qty: '', price: '' }])
  // stream meta
  const me = scoped.cap?.userId
  const [streamerId, setStreamerId] = useState(me || '')
  const [platform, setPlatform] = useState('')
  const [channel, setChannel] = useState('')
  const [streamDate, setStreamDate] = useState(todayKey())
  const [title, setTitle] = useState('')
  const [streamUrl, setStreamUrl] = useState('')
  const [streamType, setStreamType] = useState('')
  const [mixedTypes, setMixedTypes] = useState([])
  const [startTime, setStartTime] = useState('')
  const [durH, setDurH] = useState('')
  const [durM, setDurM] = useState('')
  // co-pilot (a second streamer sitting in)
  const [copilotOn, setCopilotOn] = useState(false)
  const [copilotId, setCopilotId] = useState('')
  // singles (loose cards sold alongside boxes)
  const [showSingles, setShowSingles] = useState(false)
  const [singlesQty, setSinglesQty] = useState('')
  const [singlesAvg, setSinglesAvg] = useState('')
  const [singlesRev, setSinglesRev] = useState('')
  // giveaways (stock given away, not sold) -> stock write-off
  const [giveaways, setGiveaways] = useState([])
  // brokered deals (ran through the show, owned by someone else)
  const [brokered, setBrokered] = useState([])
  const [netTouched, setNetTouched] = useState(false)
  const [touchedWhere, setTouchedWhere] = useState(false)   // user edited platform/channel
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  // Platform -> channel cascade (V1 parity); channel -> department shown as a hint.
  const channelOpts = useMemo(() => PLATFORM_CHANNELS[platform] || [], [platform])
  const channelDept = CHANNEL_DEPARTMENT[channel] || null
  const isMixed = streamType === 'Mixed'
  const toggleMixed = (t) => setMixedTypes((m) => m.includes(t) ? m.filter((x) => x !== t) : [...m, t])
  const streamEnd = useMemo(() => {
    if (!startTime) return ''
    const [h, m] = startTime.split(':').map(Number)
    const total = (h || 0) * 60 + (m || 0) + (Number(durH) || 0) * 60 + (Number(durM) || 0)
    const eh = Math.floor((total % 1440) / 60), em = total % 60
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
  }, [startTime, durH, durM])

  // Prefill platform + channel for the chosen streamer: their most-frequent past
  // combo, else their department's home channel. Only until the user overrides.
  const homeFor = (sid) => {
    const combo = {}
    for (const s of scoped.streams) {
      if (s.streamerId !== sid || !s.platform || !s.channel) continue
      const k = s.platform + '||' + s.channel
      combo[k] = (combo[k] || 0) + 1
    }
    const top = Object.entries(combo).sort((a, b) => b[1] - a[1])[0]
    if (top) { const [p, c] = top[0].split('||'); return { platform: p, channel: c } }
    const prof = scoped.profiles.find((p) => p.id === sid)
    return DEPARTMENT_HOME[prof?.department] || null
  }
  useEffect(() => {
    if (!streamerId || touchedWhere) return
    const h = homeFor(streamerId)
    if (h) { setPlatform(h.platform); setChannel(h.channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamerId])

  // Platform fee preset -> open net + auto-fill it (until the user edits it).
  const fee = PLATFORM_FEE[platform]
  useEffect(() => {
    if (fee != null && !netTouched && Number(gross) > 0) {
      setShowNet(true)
      setNet(String(Math.round(Number(gross) * (1 - fee) * 100) / 100))
    }
  }, [platform, gross, fee, netTouched])

  const save = async () => {
    setErr(null); setMsg(null)
    if (!title.trim()) return setErr('Title is required')
    if (!streamUrl.trim()) return setErr('Stream URL is required')
    if (!(Number(gross) > 0)) return setErr('Gross is required')
    setSaving(true)
    try {
      await saveStream({
        streamerId, platform, channel, streamDate, title, streamUrl,
        streamType: streamType || null,
        mixedTypes: isMixed && mixedTypes.length ? [...mixedTypes].sort().join(', ') : null,
        copilotId: copilotId || null,
        streamStart: startTime || null,
        streamEnd: startTime ? streamEnd : null,
        gross: Number(gross) || 0,
        net: showNet && net !== '' ? Number(net) : null,
        shipping: showNet && shipping !== '' ? Number(shipping) : null,
        lines,
        giveaways: giveaways.filter((g) => g.stockItemId && Number(g.qty) > 0).map((g) => ({ stock_item_id: g.stockItemId, qty: Number(g.qty) })),
        brokered: brokered.filter((b) => b.stockItemId && Number(b.qty) > 0).map((b) => ({ stockItemId: b.stockItemId, qty: Number(b.qty), price: Number(b.price) || 0, ownerId: b.ownerId || null })),
        singlesQty: showSingles ? singlesQty : 0,
        singlesAvg: showSingles ? singlesAvg : 0,
        singlesRev: showSingles ? singlesRev : 0,
      })
      setMsg('Stream saved ✓')
      await refresh()
      setGross(''); setNet(''); setShipping(''); setShowNet(false); setNetTouched(false)
      setLines([{ stockItemId: '', qty: '', price: '' }]); setTitle(''); setStreamUrl('')
      setStreamType(''); setMixedTypes([]); setStartTime(''); setDurH(''); setDurM('')
      setCopilotOn(false); setCopilotId(''); setGiveaways([]); setBrokered([])
      setShowSingles(false); setSinglesQty(''); setSinglesAvg(''); setSinglesRev('')
    } catch (e) {
      setErr(e.message || 'Could not save')
    } finally { setSaving(false) }
  }

  const vatOf = (stockItemId) => {
    const item = scoped.stockItems.find((s) => s.id === stockItemId)
    return item?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'
  }

  const engineLines = useMemo(() => lines.filter((l) => l.stockItemId && l.qty).map((l) => {
    const waves = scoped.waves.filter((w) => w.stockItemId === l.stockItemId)
    const wave = waves.sort((a, b) => b.waveNo - a.waveNo)[0]
    const qty = Number(l.qty) || 0
    return { stockItemId: l.stockItemId, qty, unitCost: wave?.unitCost || 0, lineTotal: Number(l.price) || 0, brokered: false }
  }), [lines, scoped])

  const money = useMemo(() => computeStream({
    gross: Number(gross) || 0,
    net: showNet && net !== '' ? Number(net) : null,
    shipping: showNet ? (Number(shipping) || 0) : 0,
  }, engineLines, vatOf), [gross, showNet, net, shipping, engineLines])

  const addLine = () => setLines([...lines, { stockItemId: '', qty: '', price: '' }])
  const setLine = (i, k, v) => setLines(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addGiveaway = () => setGiveaways([...giveaways, { stockItemId: '', qty: '' }])
  const setGiveaway = (i, k, v) => setGiveaways(giveaways.map((g, idx) => idx === i ? { ...g, [k]: v } : g))
  const addBrokered = () => setBrokered([...brokered, { stockItemId: '', qty: '', price: '', ownerId: '' }])
  const setBrokeredLine = (i, k, v) => setBrokered(brokered.map((b, idx) => idx === i ? { ...b, [k]: v } : b))

  const heldItems = useMemo(() => {
    if (!streamerId) return []
    const held = new Set(scoped.holdings.filter((h) => h.holderId === streamerId && h.qty > 0).map((h) => h.stockItemId))
    return scoped.stockItems.filter((s) => !s.archived && held.has(s.id)).sort((a, b) => a.product.localeCompare(b.product))
  }, [scoped, streamerId])

  const ownStock = useMemo(() => heldItems.map((s) => {
    const hs = scoped.holdings.filter((h) => h.holderId === streamerId && h.stockItemId === s.id && h.qty > 0)
    const qty = hs.reduce((a, h) => a + h.qty, 0)
    const cost = hs.sort((a, b) => (b.waveNo || 0) - (a.waveNo || 0))[0]?.unitCost || 0
    return { id: s.id, product: s.product, vat: s.vatTreatment, qty, cost }
  }), [heldItems, scoped, streamerId])

  const catalogue = useMemo(() => scoped.stockItems.filter((s) => !s.archived).sort((a, b) => a.product.localeCompare(b.product)), [scoped])

  const field = { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)' }
  const addBtn = { ...field, cursor: 'pointer' }
  const groupLabel = { fontWeight: 700, fontSize: 13, letterSpacing: 0.3, color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 8px' }

  const netApplied = showNet && net !== ''
  const hours = (Number(durH) || 0) + (Number(durM) || 0) / 60
  const revBasis = netApplied ? money.net : money.gross
  const revPerHour = hours > 0 ? revBasis / hours : null

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Stream</h2>

      <div className="panel">
        <div className="rec-grid">
          {/* LEFT — the stream's details */}
          <div>
            <div className="field">
              <label>Streamer</label>
              <select style={field} value={streamerId} onChange={(e) => { setStreamerId(e.target.value); setTouchedWhere(false); if (e.target.value === copilotId) setCopilotId('') }}>
                <option value="">Select…</option>
                {scoped.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="field">
              {!copilotOn ? (
                <button onClick={() => setCopilotOn(true)}
                  style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>
                  + Co-pilot
                </button>
              ) : (
                <>
                  <label>Co-pilot</label>
                  <select style={field} value={copilotId} onChange={(e) => setCopilotId(e.target.value)}>
                    <option value="">Select additional streamer…</option>
                    {scoped.profiles.filter((p) => p.id !== streamerId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div className="note" style={{ marginTop: 4 }}>
                    Revenue and profit credited 50/50; both keep full hours; the channel still counts one stream. Stock comes off the main streamer’s shelf.{' '}
                    <button onClick={() => { setCopilotOn(false); setCopilotId('') }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit', padding: 0 }}>remove</button>
                  </div>
                </>
              )}
            </div>

            <div className="row2">
              <div className="field">
                <label>Platform</label>
                <select style={field} value={platform} onChange={(e) => { setTouchedWhere(true); setPlatform(e.target.value); setChannel('') }}>
                  <option value="">Select…</option>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Channel</label>
                <select style={field} value={channel} onChange={(e) => { setTouchedWhere(true); setChannel(e.target.value) }} disabled={!platform}>
                  <option value="">{platform ? 'Select…' : 'Pick a platform first'}</option>
                  {channelOpts.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {channelDept && <div className="note" style={{ marginTop: 4 }}>This show counts towards <strong>{channelDept}</strong></div>}
              </div>
            </div>

            <div className="row2">
              <div className="field">
                <label>Stream date</label>
                <input style={field} type="date" value={streamDate} onChange={(e) => setStreamDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Type of stream</label>
                <select style={field} value={streamType} onChange={(e) => setStreamType(e.target.value)}>
                  <option value="">Select…</option>
                  {STREAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {isMixed && (
              <div className="field">
                <label>What did this stream include? <span className="note">· pick everything that ran</span></label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {MIXED_TYPE_OPTIONS.map((t) => <button key={t} type="button" onClick={() => toggleMixed(t)} className={'chip' + (mixedTypes.includes(t) ? ' on' : '')}>{t}</button>)}
                </div>
              </div>
            )}

            <div className="field">
              <label>Stream title <span style={{ color: 'var(--red)' }}>*</span> <span className="note">· as it appeared on the platform</span></label>
              <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Topps Chrome UCC Case Break £1 Starts" />
            </div>

            <div className="field">
              <label>Stream URL <span style={{ color: 'var(--red)' }}>*</span> <span className="note">· paste the share link</span></label>
              <input style={field} type="url" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://…" />
            </div>

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '0 0 auto' }}>
                <label>Start time</label>
                <input style={{ ...field, width: 150 }} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="field" style={{ flex: '0 0 auto' }}>
                <label>Duration</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input style={{ ...field, width: 64 }} type="number" min="0" value={durH} onChange={(e) => setDurH(e.target.value)} placeholder="0" /> <span className="note">h</span>
                  <input style={{ ...field, width: 64 }} type="number" min="0" max="59" value={durM} onChange={(e) => setDurM(e.target.value)} placeholder="00" /> <span className="note">m</span>
                  {startTime && (Number(durH) > 0 || Number(durM) > 0) && <span className="note" style={{ marginLeft: 4 }}>ends {streamEnd}</span>}
                </div>
              </div>
            </div>

            {/* Gross + optional Net/shipping expander */}
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Total Gross Sales (£) <span style={{ color: 'var(--red)' }}>*</span></label>
              <input style={field} type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} />
            </div>
            {!showNet ? (
              <button onClick={() => setShowNet(true)}
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>
                + Add net &amp; shipping <span style={{ fontWeight: 400 }}>· optional</span>
              </button>
            ) : (
              <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: 'var(--bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Net &amp; shipping</span>
                  <button onClick={() => { setShowNet(false); setNet(''); setShipping(''); setNetTouched(false) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit', fontSize: 12 }}>remove</button>
                </div>
                <div className="row2">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Net Total Sales (after fees) (£){fee != null && !netTouched && Number(gross) > 0 && <span className="note"> · {platform} ~{Math.round(fee * 100)}%</span>}</label>
                    <input style={field} type="number" step="0.01" value={net} onChange={(e) => { setNet(e.target.value); setNetTouched(true) }} placeholder="optional" />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Shipping spend (£)</label>
                    <input style={field} type="number" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="not deducted" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — what sold */}
          <div>
            <div style={groupLabel}>Products sold / opened <span className="note" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(the TOTAL each product took)</span></div>
            {!streamerId && <p className="note" style={{ marginTop: 0 }}>Select a streamer to load their stock.</p>}
            {lines.map((l, i) => (
              <div key={i} className="row2 line-row" style={{ gridTemplateColumns: '2fr 1fr 1fr auto', alignItems: 'end', gap: 10, marginBottom: 8 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Product</label>}
                  <SearchSelect
                    value={l.stockItemId} onChange={(v) => setLine(i, 'stockItemId', v)} disabled={!streamerId}
                    placeholder={streamerId ? 'Select a product' : 'Select a streamer first'}
                    emptyText="Nothing on the shelf matches that"
                    options={ownStock.map((o) => ({ id: o.id, label: o.product + (o.vat === 'second_hand' ? ' · 2nd-hand' : ''), note: `${o.qty} · ${gbp(o.cost)}` }))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Qty</label>}
                  <input style={field} type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Sold for (£)</label>}
                  <input style={field} type="number" placeholder="£ total" value={l.price} onChange={(e) => setLine(i, 'price', e.target.value)} />
                </div>
                <button onClick={() => setLines(lines.length > 1 ? lines.filter((_, idx) => idx !== i) : lines)} style={{ ...field, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', marginBottom: 0 }} title="Remove">×</button>
              </div>
            ))}
            {streamerId && heldItems.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--orange)', margin: '6px 0' }}>No stock on this streamer’s shelf yet — issue stock under <strong>Move stock</strong> first.</div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button onClick={addLine} style={addBtn}>+ Add another product</button>
              <button onClick={addGiveaway} disabled={!streamerId} style={addBtn}>+ Add giveaway</button>
              <button onClick={addBrokered} style={addBtn}>+ Add brokered deal</button>
              {!showSingles && <button onClick={() => setShowSingles(true)} style={addBtn}>+ Add singles</button>}
            </div>

            {giveaways.length > 0 && (
              <>
                <div style={{ ...groupLabel, marginTop: 18 }}>Giveaways <span className="note" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· off the shelf, £0 revenue</span></div>
                {giveaways.map((g, i) => (
                  <div key={i} className="row2 line-row" style={{ gridTemplateColumns: '2fr 1fr auto', alignItems: 'end', gap: 10, marginBottom: 8 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <SearchSelect value={g.stockItemId} onChange={(v) => setGiveaway(i, 'stockItemId', v)} disabled={!streamerId}
                        placeholder="Select a product" emptyText="Nothing on the shelf matches that"
                        options={ownStock.map((o) => ({ id: o.id, label: o.product, note: `${o.qty}` }))} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}><input style={field} type="number" placeholder="Qty" value={g.qty} onChange={(e) => setGiveaway(i, 'qty', e.target.value)} /></div>
                    <button onClick={() => setGiveaways(giveaways.filter((_, idx) => idx !== i))} style={{ ...field, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', marginBottom: 0 }}>×</button>
                  </div>
                ))}
              </>
            )}

            {brokered.length > 0 && (
              <>
                <div style={{ ...groupLabel, marginTop: 18 }}>Brokered deals <span className="note" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· credited to the deal owner; no shelf stock used</span></div>
                {brokered.map((b, i) => (
                  <div key={i} className="row2 line-row" style={{ gridTemplateColumns: '2fr 1fr 1fr auto', alignItems: 'end', gap: 10, marginBottom: 8 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      {i === 0 && <label>Product</label>}
                      <SearchSelect value={b.stockItemId} onChange={(v) => setBrokeredLine(i, 'stockItemId', v)}
                        placeholder="Select a product" emptyText="No products"
                        options={catalogue.map((s) => ({ id: s.id, label: s.product, note: s.type || '' }))} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>{i === 0 && <label>Qty</label>}<input style={field} type="number" placeholder="Qty" value={b.qty} onChange={(e) => setBrokeredLine(i, 'qty', e.target.value)} /></div>
                    <div className="field" style={{ marginBottom: 0 }}>{i === 0 && <label>Sold for (£)</label>}<input style={field} type="number" placeholder="£ total" value={b.price} onChange={(e) => setBrokeredLine(i, 'price', e.target.value)} /></div>
                    <button onClick={() => setBrokered(brokered.filter((_, idx) => idx !== i))} style={{ ...field, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', marginBottom: 0 }}>×</button>
                    <div className="field" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                      <label>Deal owner <span style={{ color: 'var(--red)' }}>*</span></label>
                      <select style={field} value={b.ownerId} onChange={(e) => setBrokeredLine(i, 'ownerId', e.target.value)}>
                        <option value="">Who owns this deal…</option>
                        {scoped.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </>
            )}

            {showSingles && (
              <>
                <div style={{ ...groupLabel, marginTop: 18 }}>Singles <span className="note" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· loose cards alongside boxes</span></div>
                <div className="row2" style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end' }}>
                  <div className="field" style={{ marginBottom: 0 }}><label>Qty</label><input style={field} type="number" value={singlesQty} onChange={(e) => setSinglesQty(e.target.value)} /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>Avg cost / single</label><input style={field} type="number" value={singlesAvg} onChange={(e) => setSinglesAvg(e.target.value)} /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>Singles revenue</label><input style={field} type="number" value={singlesRev} onChange={(e) => setSinglesRev(e.target.value)} /></div>
                  <button onClick={() => { setShowSingles(false); setSinglesQty(''); setSinglesAvg(''); setSinglesRev('') }} style={{ ...field, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', marginBottom: 0 }}>Remove</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Live money preview — full width beneath the two columns */}
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 20, paddingTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="Revenue" value={gbp0(revBasis)} accent="#111" sub={netApplied ? 'net of fees' : 'gross'} />
          <StatCard label="Revenue / hour" value={revPerHour != null ? gbp0(revPerHour) : '—'} />
          <StatCard label="Total stock cost" value={gbp0(money.costPaid)} accent="#c0392b" />
          <StatCard label="VAT owed" value={gbp0(money.vatOwed)} accent="#b8700a" />
          <StatCard label={netApplied ? 'Profit (take-home)' : 'Profit'} value={gbp0(money.trueProfit)} accent="#1a7f37" sub={`${pct(money.netMarginPct)} margin`} />
          {money.shipping > 0 && <StatCard label="Shipping (not deducted)" value={gbp0(money.shipping)} />}
        </div>
        <p className="note" style={{ marginTop: 12 }}>
          Live preview via the money engine · VAT computed per product line (standard vs second-hand).
          {netApplied ? ' Net profit shown as the standout.' : ' Add a net figure to see true take-home.'}
        </p>

        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn" onClick={save} disabled={saving || !streamerId || !title.trim() || !streamUrl.trim() || !(Number(gross) > 0)}>
            {saving ? 'Saving…' : 'Review & submit'}
          </button>
          {msg && <span style={{ color: 'var(--good)', fontWeight: 600 }}>{msg}</span>}
          {err && <span style={{ color: 'var(--red)' }}>{err}</span>}
        </div>
      </div>
    </div>
  )
}
