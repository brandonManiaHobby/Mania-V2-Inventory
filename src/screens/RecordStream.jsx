import { useState, useMemo, useEffect } from 'react'
import { computeStream } from '../money'
import { gbp, gbp0, pct, int, saveStream, todayKey, useSource } from '../data'
import StatCard from '../components/StatCard'
import { PLATFORMS, PLATFORM_CHANNELS, CHANNEL_DEPARTMENT, STREAM_TYPES, MIXED_TYPE_OPTIONS } from '../constants'

// Blended platform fee rates -> auto-fill net (gross × (1 − fee)). Editable.
// Fanatics: 6% commission + 2.5% processing + £0.25/order ≈ 10% blended.
const PLATFORM_FEE = { Fanatics: 0.10 }

// ============================================================
// RECORD STREAM (Stage 5)
// Capture gross always; optional "Add net" expander (Whatnot/Fanatics) for
// net-after-fees + shipping. Live profit preview via computeStream, with
// PER-LINE VAT talking to the money engine. Profit standout follows input:
// net entered -> Net profit is the hero; gross only -> gross is the hero.
//
// NOTE: this is the capture UI + live preview. Wiring the atomic write
// (insert stream + lines + holdings decrement) is the next step; the
// preview proves the money flow first.
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
      setShowNet(true)
      setNet(String(Math.round(Number(gross) * (1 - fee) * 100) / 100))
    }
  }, [platform, gross, fee, netTouched])

  const save = async () => {
    setErr(null); setMsg(null)
    if (!title.trim()) return setErr('Title is required')
    if (!streamUrl.trim()) return setErr('Stream URL is required')
    if (!(Number(gross) > 0)) return setErr('Gross is required')
    if (showNet && net === '') return setErr('Net is required (or remove the net section)')
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
        singlesQty: showSingles ? singlesQty : 0,
        singlesAvg: showSingles ? singlesAvg : 0,
        singlesRev: showSingles ? singlesRev : 0,
      })
      setMsg('Stream saved ✓')
      await refresh()
      // reset
      setGross(''); setNet(''); setShipping(''); setShowNet(false); setNetTouched(false)
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
    net: showNet && net !== '' ? Number(net) : null,
    shipping: showNet ? (Number(shipping) || 0) : 0,
  }, engineLines, vatOf), [gross, showNet, net, shipping, engineLines])

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

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }

  // Profit standout: net entered -> Net profit hero; else gross-based.
  const netApplied = showNet && net !== ''

  return (
    <div style={{ maxWidth: 680 }}>
      <h2 style={{ marginTop: 0 }}>Record stream</h2>

      {/* Stream meta */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: '#444' }}>Streamer<br />
          <select style={{ ...field, marginTop: 4, minWidth: 150 }} value={streamerId} onChange={(e) => { setStreamerId(e.target.value); if (e.target.value === copilotId) setCopilotId('') }}>
            <option value="">Select…</option>
            {scoped.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#444' }}>Platform<br />
          <select style={{ ...field, marginTop: 4 }} value={platform} onChange={(e) => { setPlatform(e.target.value); setChannel('') }}>
            <option value="">Select…</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#444' }}>Channel<br />
          <select style={{ ...field, marginTop: 4, minWidth: 160 }} value={channel} onChange={(e) => setChannel(e.target.value)} disabled={!platform}>
            <option value="">{platform ? 'Select…' : 'Pick a platform first'}</option>
            {channelOpts.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {channelDept && <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>Counts towards <strong>{channelDept}</strong></div>}
        </label>
        <label style={{ fontSize: 13, color: '#444' }}>Type of stream<br />
          <select style={{ ...field, marginTop: 4, minWidth: 140 }} value={streamType} onChange={(e) => setStreamType(e.target.value)}>
            <option value="">Select…</option>
            {STREAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#444' }}>Date<br />
          <input style={{ ...field, marginTop: 4 }} type="date" value={streamDate} onChange={(e) => setStreamDate(e.target.value)} />
        </label>
        <label style={{ fontSize: 13, color: '#444', flex: 1, minWidth: 160 }}>Title <span style={{ color: '#c82828' }}>*</span><br />
          <input style={{ ...field, marginTop: 4, width: '100%' }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. £1 starts Lights Out" />
        </label>
      </div>

      {/* Co-pilot — a second streamer sitting in on the show */}
      <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => { const v = !copilotOn; setCopilotOn(v); if (!v) setCopilotId('') }}
          style={{ ...field, cursor: 'pointer', background: copilotOn ? 'rgba(255,106,0,0.10)' : '#faf9f7', borderColor: copilotOn ? 'var(--orange)' : '#ddd', fontWeight: 600 }}>
          {copilotOn ? '✓ Co-pilot' : '+ Co-pilot'}
        </button>
        {copilotOn && (
          <select style={{ ...field, minWidth: 180 }} value={copilotId} onChange={(e) => setCopilotId(e.target.value)}>
            <option value="">Second streamer…</option>
            {scoped.profiles.filter((p) => p.id !== streamerId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* Mixed stream — pick the formats that ran */}
      {isMixed && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>What ran in this mixed stream?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MIXED_TYPE_OPTIONS.map((t) => (
              <button key={t} onClick={() => toggleMixed(t)} className={'chip' + (mixedTypes.includes(t) ? ' on' : '')}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {/* Stream URL — the share link to the VOD (quick access + proof the stream is real) */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: '#444' }}>Stream URL <span style={{ color: '#c82828' }}>*</span> <span style={{ color: '#999' }}>· paste the share link</span><br />
          <input style={{ ...field, marginTop: 4, width: '100%' }} type="url" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://…" />
        </label>
      </div>

      {/* Start time + duration -> hours (powers rev/hour + the Hours measure) */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: '#444' }}>Start time<br />
          <input style={{ ...field, marginTop: 4 }} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label style={{ fontSize: 13, color: '#444' }}>Duration<br />
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
            <input style={{ ...field, width: 64 }} type="number" min="0" value={durH} onChange={(e) => setDurH(e.target.value)} placeholder="0" /> <span style={{ color: '#888' }}>h</span>
            <input style={{ ...field, width: 64 }} type="number" min="0" max="59" value={durM} onChange={(e) => setDurM(e.target.value)} placeholder="00" /> <span style={{ color: '#888' }}>m</span>
          </span>
        </label>
        {startTime && (Number(durH) > 0 || Number(durM) > 0) && (
          <div style={{ fontSize: 12, color: '#888' }}>Ends {streamEnd} · {((Number(durH) || 0) + (Number(durM) || 0) / 60).toFixed(1)}h</div>
        )}
      </div>

      {/* Products */}
      <div style={{ fontWeight: 700, margin: '8px 0 6px' }}>Products sold</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <select style={{ ...field, flex: 2 }} value={l.stockItemId} onChange={(e) => setLine(i, 'stockItemId', e.target.value)}>
            <option value="">{streamerId ? (heldItems.length ? 'Select product…' : 'No stock on this shelf') : 'Pick a streamer first'}</option>
            {heldItems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.product}{s.vatTreatment === 'second_hand' ? ' · 2nd-hand (VAT-free)' : ''}
              </option>
            ))}
          </select>
          <input style={{ ...field, width: 70 }} type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
          <input style={{ ...field, width: 90 }} type="number" placeholder="£ sold" value={l.price} onChange={(e) => setLine(i, 'price', e.target.value)} />
        </div>
      ))}
      <button onClick={addLine} style={{ ...field, cursor: 'pointer', background: '#faf9f7' }}>+ Add product</button>
      {streamerId && heldItems.length === 0 && (
        <div style={{ fontSize: 12, color: '#c0531f', marginTop: 6 }}>No stock on this streamer’s shelf yet — issue stock to them under <strong>Move stock</strong> first.</div>
      )}

      {/* Giveaways — stock given away (write-off), not sold */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, margin: '0 0 6px' }}>Giveaways <span style={{ color: '#999', fontWeight: 400, fontSize: 12 }}>· comes off the shelf, £0 revenue</span></div>
        {giveaways.map((g, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <select style={{ ...field, flex: 2 }} value={g.stockItemId} onChange={(e) => setGiveaway(i, 'stockItemId', e.target.value)}>
              <option value="">{heldItems.length ? 'Select product…' : 'No stock on this shelf'}</option>
              {heldItems.map((s) => <option key={s.id} value={s.id}>{s.product}</option>)}
            </select>
            <input style={{ ...field, width: 70 }} type="number" placeholder="Qty" value={g.qty} onChange={(e) => setGiveaway(i, 'qty', e.target.value)} />
            <button onClick={() => setGiveaways(giveaways.filter((_, idx) => idx !== i))} style={{ ...field, cursor: 'pointer', background: 'transparent', color: '#999' }}>×</button>
          </div>
        ))}
        <button onClick={addGiveaway} disabled={!streamerId} style={{ ...field, cursor: 'pointer', background: '#faf9f7' }}>+ Add giveaway</button>
      </div>

      {/* Singles — loose cards sold alongside boxes */}
      <div style={{ marginTop: 16 }}>
        {!showSingles ? (
          <button onClick={() => setShowSingles(true)} style={{ ...field, cursor: 'pointer', background: '#faf9f7', fontWeight: 600 }}>+ Add singles</button>
        ) : (
          <div style={{ padding: 14, border: '1px dashed #cbb', borderRadius: 10, background: '#fcfbf9' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Singles</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ fontSize: 13, color: '#444' }}>Qty<br /><input style={{ ...field, width: 90, marginTop: 4 }} type="number" value={singlesQty} onChange={(e) => setSinglesQty(e.target.value)} /></label>
              <label style={{ fontSize: 13, color: '#444' }}>Avg cost / single<br /><input style={{ ...field, width: 120, marginTop: 4 }} type="number" value={singlesAvg} onChange={(e) => setSinglesAvg(e.target.value)} /></label>
              <label style={{ fontSize: 13, color: '#444' }}>Singles revenue<br /><input style={{ ...field, width: 120, marginTop: 4 }} type="number" value={singlesRev} onChange={(e) => setSinglesRev(e.target.value)} /></label>
              <button onClick={() => { setShowSingles(false); setSinglesQty(''); setSinglesAvg(''); setSinglesRev('') }} style={{ ...field, cursor: 'pointer', background: 'transparent', color: '#999' }}>Remove</button>
            </div>
          </div>
        )}
      </div>

      {/* Gross + optional net */}
      <div style={{ marginTop: 18, display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#444' }}>Total sales (gross) <span style={{ color: '#c82828' }}>*</span><br />
          <input style={{ ...field, width: 130, marginTop: 4 }} type="number" value={gross} onChange={(e) => setGross(e.target.value)} />
        </label>
        {!showNet && (
          <button onClick={() => setShowNet(true)}
            style={{ ...field, cursor: 'pointer', background: '#faf9f7', color: '#1a7f37', fontWeight: 600 }}>
            + Add net (Whatnot / Fanatics)
          </button>
        )}
      </div>

      {showNet && (
        <div style={{ marginTop: 12, padding: 14, border: '1px dashed #cbb', borderRadius: 10, background: '#fcfbf9' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ fontSize: 13, color: '#444' }}>Net (after platform fees) <span style={{ color: '#c82828' }}>*</span>
              {fee != null && !netTouched && <span style={{ color: '#1a7f37', fontWeight: 600 }}> · {platform} ~{Math.round(fee * 100)}% applied</span>}<br />
              <input style={{ ...field, width: 130, marginTop: 4 }} type="number" value={net} onChange={(e) => { setNet(e.target.value); setNetTouched(true) }} />
            </label>
            <label style={{ fontSize: 13, color: '#444' }}>Shipping spend (optional)<br />
              <input style={{ ...field, width: 130, marginTop: 4 }} type="number" value={shipping} onChange={(e) => setShipping(e.target.value)} />
            </label>
            <button onClick={() => { setShowNet(false); setNet(''); setShipping('') }}
              style={{ ...field, cursor: 'pointer', background: 'transparent', color: '#999' }}>Remove</button>
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
            Net is the take-home after fees (read off the platform). Shipping is shown for the record but not deducted from profit.
          </div>
        </div>
      )}

      {/* Live money preview — profit standout follows input */}
      <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Gross" value={gbp0(money.gross)}
          accent={netApplied ? '#111' : '#1a7f37'} sub={netApplied ? null : 'take-home basis'} />
        {netApplied && <StatCard label="Fees" value={gbp0(money.fees)} accent="#c0392b" />}
        {netApplied && <StatCard label="Net" value={gbp0(money.net)} accent="#111" />}
        <StatCard label="VAT owed" value={gbp0(money.vatOwed)} accent="#b8700a" />
        <StatCard
          label={netApplied ? 'Net profit (take-home)' : 'Profit'}
          value={gbp0(money.trueProfit)}
          accent="#1a7f37"
          sub={netApplied ? `${pct(money.netMarginPct)} · the true number` : `${pct(money.netMarginPct)} margin`}
        />
        {money.shipping > 0 && <StatCard label="Shipping (not deducted)" value={gbp0(money.shipping)} />}
      </div>

      <p style={{ color: '#888', fontSize: 12, marginTop: 14 }}>
        Live preview via the money engine · VAT computed per product line (standard vs second-hand).
        {netApplied ? ' Net profit shown as the standout.' : ' Add net to see true take-home.'}
      </p>

      {/* Save */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving || !streamerId || !title.trim() || !streamUrl.trim() || !(Number(gross) > 0) || (showNet && net === '')}
          style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#1a7f37',
            color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save stream'}
        </button>
        {msg && <span style={{ color: '#1a7f37', fontWeight: 600 }}>{msg}</span>}
        {err && <span style={{ color: '#c82828' }}>{err}</span>}
      </div>
    </div>
  )
}
