import { useState, useMemo, useEffect } from 'react'
import { computeStream } from '../money'
import { gbp, gbp0, pct, int, saveStream, todayKey, useSource } from '../data'
import StatCard from '../components/StatCard'
import SearchSelect from '../components/SearchSelect'
import { PLATFORMS, PLATFORM_CHANNELS, CHANNEL_DEPARTMENT, STREAM_TYPES, MIXED_TYPE_OPTIONS } from '../constants'

// Blended platform fee rates -> auto-fill net (gross × (1 − fee)). Editable.
// Fanatics: 6% commission + 2.5% processing + £0.25/order ≈ 10% blended.
const PLATFORM_FEE = { Fanatics: 0.10 }

// ============================================================
// RECORD STREAM (V1 parity) — one clean, uniform card: streamer, co-pilot,
// platform/channel, date/type, title, URL, start/duration, then Gross and Net
// side by side with shipping. Products sold/opened use the searchable shelf
// picker; giveaways + singles below; live money preview via the engine with
// PER-LINE VAT. Net entered -> net profit is the hero; gross only -> gross.
// ============================================================
export default function RecordStream({ scoped }) {
  const { refresh } = useSource()
  const [gross, setGross] = useState('')
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
  const [netTouched, setNetTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  // Platform -> channel cascade (V1 parity); channel -> department shown as a hint.
  const channelOpts = useMemo(() => PLATFORM_CHANNELS[platform] || [], [platform])
  const channelDept = CHANNEL_DEPARTMENT[channel] || null
  const isMixed = streamType === 'Mixed'
  const toggleMixed = (t) => setMixedTypes((m) => m.includes(t) ? m.filter((x) => x !== t) : [...m, t])
  // End time = start + duration, so hours are captured (powers rev/hour + Hours).
  const streamEnd = useMemo(() => {
    if (!startTime) return ''
    const [h, m] = startTime.split(':').map(Number)
    const total = (h || 0) * 60 + (m || 0) + (Number(durH) || 0) * 60 + (Number(durM) || 0)
    const eh = Math.floor((total % 1440) / 60), em = total % 60
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
  }, [startTime, durH, durM])

  // Platform fee preset -> auto-fill net (until the user edits it themselves).
  const fee = PLATFORM_FEE[platform]
  useEffect(() => {
    if (fee != null && !netTouched && Number(gross) > 0) {
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
        net: net !== '' ? Number(net) : null,
        shipping: shipping !== '' ? Number(shipping) : null,
        lines,
        giveaways: giveaways.filter((g) => g.stockItemId && Number(g.qty) > 0).map((g) => ({ stock_item_id: g.stockItemId, qty: Number(g.qty) })),
        singlesQty: showSingles ? singlesQty : 0,
        singlesAvg: showSingles ? singlesAvg : 0,
        singlesRev: showSingles ? singlesRev : 0,
      })
      setMsg('Stream saved ✓')
      await refresh()
      // reset
      setGross(''); setNet(''); setShipping(''); setNetTouched(false)
      setLines([{ stockItemId: '', qty: '', price: '' }]); setTitle(''); setStreamUrl('')
      setStreamType(''); setMixedTypes([]); setStartTime(''); setDurH(''); setDurM('')
      setCopilotOn(false); setCopilotId(''); setGiveaways([])
      setShowSingles(false); setSinglesQty(''); setSinglesAvg(''); setSinglesRev('')
    } catch (e) {
      setErr(e.message || 'Could not save')
    } finally { setSaving(false) }
  }

  // VAT lookup from the product's treatment (talks to the engine).
  const vatOf = (stockItemId) => {
    const item = scoped.stockItems.find((s) => s.id === stockItemId)
    return item?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'
  }

  // Build line objects for the engine (cost from the chosen product's latest wave).
  const engineLines = useMemo(() => lines.filter((l) => l.stockItemId && l.qty).map((l) => {
    const waves = scoped.waves.filter((w) => w.stockItemId === l.stockItemId)
    const wave = waves.sort((a, b) => b.waveNo - a.waveNo)[0] // latest wave cost
    const qty = Number(l.qty) || 0
    return {
      stockItemId: l.stockItemId,
      qty,
      unitCost: wave?.unitCost || 0,
      lineTotal: Number(l.price) || 0,
      brokered: false,
    }
  }), [lines, scoped])

  const money = useMemo(() => computeStream({
    gross: Number(gross) || 0,
    net: net !== '' ? Number(net) : null,
    shipping: Number(shipping) || 0,
  }, engineLines, vatOf), [gross, net, shipping, engineLines])

  const addLine = () => setLines([...lines, { stockItemId: '', qty: '', price: '' }])
  const setLine = (i, k, v) => setLines(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addGiveaway = () => setGiveaways([...giveaways, { stockItemId: '', qty: '' }])
  const setGiveaway = (i, k, v) => setGiveaways(giveaways.map((g, idx) => idx === i ? { ...g, [k]: v } : g))

  // Only the SELECTED streamer's own shelf is sellable — a stream sells what
  // that person is holding, not the whole catalogue.
  const heldItems = useMemo(() => {
    if (!streamerId) return []
    const held = new Set(scoped.holdings.filter((h) => h.holderId === streamerId && h.qty > 0).map((h) => h.stockItemId))
    return scoped.stockItems.filter((s) => !s.archived && held.has(s.id)).sort((a, b) => a.product.localeCompare(b.product))
  }, [scoped, streamerId])

  // Shelf with qty + unit cost per product, for the SearchSelect notes (V1 parity).
  const ownStock = useMemo(() => heldItems.map((s) => {
    const hs = scoped.holdings.filter((h) => h.holderId === streamerId && h.stockItemId === s.id && h.qty > 0)
    const qty = hs.reduce((a, h) => a + h.qty, 0)
    const cost = hs.sort((a, b) => (b.waveNo || 0) - (a.waveNo || 0))[0]?.unitCost || 0
    return { id: s.id, product: s.product, vat: s.vatTreatment, qty, cost }
  }), [heldItems, scoped, streamerId])

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)' }

  // Profit standout: net entered -> Net profit hero; else gross-based.
  const netApplied = net !== ''
  const hours = (Number(durH) || 0) + (Number(durM) || 0) / 60
  const revBasis = netApplied ? money.net : money.gross
  const revPerHour = hours > 0 ? revBasis / hours : null

  return (
    <div style={{ maxWidth: 680 }}>
      <h2 style={{ marginTop: 0 }}>Record stream</h2>

      <div className="panel">
        {/* Streamer */}
        <div className="field">
          <label>Streamer</label>
          <select style={field} value={streamerId} onChange={(e) => { setStreamerId(e.target.value); if (e.target.value === copilotId) setCopilotId('') }}>
            <option value="">Select…</option>
            {scoped.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Co-pilot — a second streamer sitting in */}
        <div className="field">
          {!copilotOn ? (
            <button onClick={() => setCopilotOn(true)} style={{ ...field, cursor: 'pointer', textAlign: 'left', color: 'var(--orange)', fontWeight: 600 }}>+ Co-pilot (a second streamer sitting in)</button>
          ) : (
            <>
              <label>Co-pilot</label>
              <select style={field} value={copilotId} onChange={(e) => setCopilotId(e.target.value)}>
                <option value="">Select additional streamer…</option>
                {scoped.profiles.filter((p) => p.id !== streamerId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="note" style={{ marginTop: 4 }}>
                Revenue and profit are credited 50/50. Both keep their full hours; the channel still counts one stream. Stock comes off the main streamer’s shelf.{' '}
                <button onClick={() => { setCopilotOn(false); setCopilotId('') }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit', padding: 0 }}>remove</button>
              </div>
            </>
          )}
        </div>

        {/* Platform | Channel */}
        <div className="row2">
          <div className="field">
            <label>Platform</label>
            <select style={field} value={platform} onChange={(e) => { setPlatform(e.target.value); setChannel('') }}>
              <option value="">Select…</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Channel</label>
            <select style={field} value={channel} onChange={(e) => setChannel(e.target.value)} disabled={!platform}>
              <option value="">{platform ? 'Select…' : 'Pick a platform first'}</option>
              {channelOpts.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {channelDept && <div className="note" style={{ marginTop: 4 }}>This show counts towards <strong>{channelDept}</strong></div>}
          </div>
        </div>

        {/* Stream date | Type of stream */}
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

        {/* Mixed stream — pick the formats that ran */}
        {isMixed && (
          <div className="field">
            <label>What did this stream include? <span className="note">· pick everything that ran</span></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {MIXED_TYPE_OPTIONS.map((t) => <button key={t} type="button" onClick={() => toggleMixed(t)} className={'chip' + (mixedTypes.includes(t) ? ' on' : '')}>{t}</button>)}
            </div>
          </div>
        )}

        {/* Title */}
        <div className="field">
          <label>Stream title <span style={{ color: 'var(--red)' }}>*</span> <span className="note">· as it appeared on the platform, so you can find it again</span></label>
          <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Topps Chrome UCC Case Break £1 Starts" />
        </div>

        {/* Stream URL */}
        <div className="field">
          <label>Stream URL <span style={{ color: 'var(--red)' }}>*</span> <span className="note">· paste the share link</span></label>
          <input style={field} type="url" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://…" />
        </div>

        {/* Start time | Duration */}
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
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

        {/* Gross | Net — side by side (V1 clean layout) */}
        <div className="row2">
          <div className="field">
            <label>Total Gross Sales (£) <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={field} type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} />
          </div>
          <div className="field">
            <label>Net Total Sales (after platform fees) (£){fee != null && !netTouched && Number(gross) > 0 && <span className="note"> · {platform} ~{Math.round(fee * 100)}% applied</span>}</label>
            <input style={field} type="number" step="0.01" value={net} onChange={(e) => { setNet(e.target.value); setNetTouched(true) }} placeholder="optional" />
          </div>
        </div>
        <div className="row2" style={{ marginTop: -4 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Shipping spend (optional)</label>
            <input style={field} type="number" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="not deducted from profit" />
          </div>
          <div />
        </div>
      </div>

      {/* Products sold / opened */}
      <div className="label" style={{ fontWeight: 700, margin: '18px 0 8px' }}>PRODUCTS SOLD / OPENED <span className="note" style={{ fontWeight: 400 }}>(the TOTAL each product took — not a per-unit price)</span></div>
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
      <button onClick={addLine} style={{ ...field, cursor: 'pointer' }}>+ Add another stream product</button>
      {streamerId && heldItems.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--orange)', marginTop: 6 }}>No stock on this streamer’s shelf yet — issue stock to them under <strong>Move stock</strong> first.</div>
      )}

      {/* Giveaways — stock given away (write-off), not sold */}
      <div style={{ marginTop: 18 }}>
        <div className="label" style={{ fontWeight: 700, marginBottom: 6 }}>GIVEAWAYS <span className="note" style={{ fontWeight: 400 }}>· comes off the shelf, £0 revenue</span></div>
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
        <button onClick={addGiveaway} disabled={!streamerId} style={{ ...field, cursor: 'pointer' }}>+ Add giveaway</button>
      </div>

      {/* Singles — loose cards sold alongside boxes */}
      <div style={{ marginTop: 18 }}>
        {!showSingles ? (
          <button onClick={() => setShowSingles(true)} style={{ ...field, cursor: 'pointer' }}>+ Add singles</button>
        ) : (
          <div className="panel">
            <div className="label" style={{ fontWeight: 700, marginBottom: 8 }}>SINGLES <span className="note" style={{ fontWeight: 400 }}>· loose cards sold alongside boxes</span></div>
            <div className="row2" style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end' }}>
              <div className="field" style={{ marginBottom: 0 }}><label>Qty</label><input style={field} type="number" value={singlesQty} onChange={(e) => setSinglesQty(e.target.value)} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Avg cost / single</label><input style={field} type="number" value={singlesAvg} onChange={(e) => setSinglesAvg(e.target.value)} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Singles revenue</label><input style={field} type="number" value={singlesRev} onChange={(e) => setSinglesRev(e.target.value)} /></div>
              <button onClick={() => { setShowSingles(false); setSinglesQty(''); setSinglesAvg(''); setSinglesRev('') }} style={{ ...field, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', marginBottom: 0 }}>Remove</button>
            </div>
          </div>
        )}
      </div>

      {/* Live money preview — profit standout follows input */}
      <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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

      {/* Save */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn" onClick={save} disabled={saving || !streamerId || !title.trim() || !streamUrl.trim() || !(Number(gross) > 0)}>
          {saving ? 'Saving…' : 'Review & submit'}
        </button>
        {msg && <span style={{ color: 'var(--good)', fontWeight: 600 }}>{msg}</span>}
        {err && <span style={{ color: 'var(--red)' }}>{err}</span>}
      </div>
    </div>
  )
}
