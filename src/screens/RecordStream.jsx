import { useState, useMemo } from 'react'
import { computeStream } from '../money'
import { gbp, gbp0, pct, saveStream, todayKey, useSource } from '../data'
import StatCard from '../components/StatCard'

const PLATFORMS = ['eBay Live', 'Whatnot', 'TikTok Shop', 'Fanatics']

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
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const save = async () => {
    setSaving(true); setErr(null); setMsg(null)
    try {
      await saveStream({
        streamerId, platform, channel, streamDate, title,
        gross: Number(gross) || 0,
        net: showNet && net !== '' ? Number(net) : null,
        shipping: showNet && shipping !== '' ? Number(shipping) : null,
        lines,
      })
      setMsg('Stream saved ✓')
      await refresh()
      // reset
      setGross(''); setNet(''); setShipping(''); setShowNet(false)
      setLines([{ stockItemId: '', qty: '', price: '' }]); setTitle('')
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

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }

  // Profit standout: net entered -> Net profit hero; else gross-based.
  const netApplied = showNet && net !== ''

  return (
    <div style={{ maxWidth: 680 }}>
      <h2 style={{ marginTop: 0 }}>Record stream</h2>

      {/* Stream meta */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: '#444' }}>Streamer<br />
          <select style={{ ...field, marginTop: 4, minWidth: 150 }} value={streamerId} onChange={(e) => setStreamerId(e.target.value)}>
            <option value="">Select…</option>
            {scoped.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#444' }}>Platform<br />
          <select style={{ ...field, marginTop: 4 }} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">Select…</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#444' }}>Date<br />
          <input style={{ ...field, marginTop: 4 }} type="date" value={streamDate} onChange={(e) => setStreamDate(e.target.value)} />
        </label>
        <label style={{ fontSize: 13, color: '#444', flex: 1, minWidth: 160 }}>Title (optional)<br />
          <input style={{ ...field, marginTop: 4, width: '100%' }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. £1 starts Lights Out" />
        </label>
      </div>

      {/* Products */}
      <div style={{ fontWeight: 700, margin: '8px 0 6px' }}>Products sold</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <select style={{ ...field, flex: 2 }} value={l.stockItemId} onChange={(e) => setLine(i, 'stockItemId', e.target.value)}>
            <option value="">Select product…</option>
            {scoped.stockItems.filter((s) => !s.archived).map((s) => (
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

      {/* Gross + optional net */}
      <div style={{ marginTop: 18, display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#444' }}>Total sales (gross)<br />
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
            <label style={{ fontSize: 13, color: '#444' }}>Net (after platform fees)<br />
              <input style={{ ...field, width: 130, marginTop: 4 }} type="number" value={net} onChange={(e) => setNet(e.target.value)} />
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
        <button onClick={save} disabled={saving || !streamerId || !gross}
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
