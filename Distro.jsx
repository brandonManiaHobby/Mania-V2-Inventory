import { useState, useMemo } from 'react'
import { computeMoney, exVat } from '../money'
import { gbp, gbp0, pct, int, todayKey, displayDate, useSource, distroSale, invoiceSignedUrl, availableQty, vatTreatmentOf, shortName } from '../data'
import StatCard from '../components/StatCard'

// ============================================================
// DISTRO SALES (Stock) — sell stock through distribution, with records.
// Warehouse → sold, atomic via record_distro_sale (waterfall intact). Captures
// Shop vs B2B; B2B records customer, VAT no, invoice ref + optional uploaded
// invoice file, payment status + due date. Money runs through the engine with
// the product's VAT treatment. Full searchable history with invoice view.
// Actionable by admin / manager / warehouse (canMoveStock).
// ============================================================
export default function Distro({ scoped }) {
  const { refresh } = useSource()
  const [stockItemId, setStockItemId] = useState('')
  const [waveNo, setWaveNo] = useState('')
  const [qty, setQty] = useState('')
  const [revenue, setRevenue] = useState('')
  const [soldOn, setSoldOn] = useState(todayKey())
  const [channel, setChannel] = useState('shop') // 'shop' | 'b2b'
  const [customerName, setCustomerName] = useState('')
  const [customerVat, setCustomerVat] = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('paid')
  const [paymentDue, setPaymentDue] = useState('')
  const [invoiceFile, setInvoiceFile] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const vatOf = (sid) => vatTreatmentOf(scoped, sid)

  // Products that have warehouse stock in at least one wave.
  const products = useMemo(() => scoped.stockItems
    .filter((s) => !s.archived)
    .map((s) => ({ ...s, wh: availableQty(scoped, { stockItemId: s.id, holderId: 'warehouse' }) }))
    .filter((s) => s.wh > 0)
    .sort((a, b) => a.product.localeCompare(b.product)), [scoped])

  // Waves of the selected product that have warehouse stock.
  const waves = useMemo(() => {
    if (!stockItemId) return []
    return scoped.waves
      .filter((w) => w.stockItemId === stockItemId)
      .map((w) => ({ ...w, wh: availableQty(scoped, { stockItemId, holderId: 'warehouse', waveNo: w.waveNo }) }))
      .filter((w) => w.wh > 0)
      .sort((a, b) => a.waveNo - b.waveNo)
  }, [scoped, stockItemId])

  const wave = waves.find((w) => w.waveNo === Number(waveNo))
  const n = Number(qty) || 0

  // Live money preview — same engine + VAT treatment as everywhere.
  const money = useMemo(() => {
    const estCost = wave ? n * Number(wave.unitCost || 0) : 0
    return computeMoney({ gross: Number(revenue) || 0, net: Number(revenue) || 0, costPaid: estCost, vatTreatment: stockItemId ? vatOf(stockItemId) : 'standard' })
  }, [revenue, wave, n, stockItemId, scoped])

  const canSave = stockItemId && waveNo !== '' && n > 0 && (channel !== 'b2b' || customerName.trim())

  const save = async () => {
    setSaving(true); setErr(null); setMsg(null)
    try {
      await distroSale(scoped, {
        stockItemId, waveNo: Number(waveNo), qty: n, revenue: Number(revenue) || 0, note, soldOn,
        saleChannel: channel,
        customerName: channel === 'b2b' ? customerName : (customerName || null),
        customerVat: channel === 'b2b' ? customerVat : null,
        invoiceRef: channel === 'b2b' ? invoiceRef : null,
        paymentStatus: channel === 'b2b' ? paymentStatus : null,
        paymentDue: channel === 'b2b' && paymentStatus === 'unpaid' ? (paymentDue || null) : null,
        invoiceFile: channel === 'b2b' ? invoiceFile : null,
      })
      setMsg('Distro sale recorded ✓')
      await refresh()
      setStockItemId(''); setWaveNo(''); setQty(''); setRevenue(''); setNote('')
      setCustomerName(''); setCustomerVat(''); setInvoiceRef(''); setInvoiceFile(null); setPaymentDue('')
    } catch (e) { setErr(e.message || 'Could not save') } finally { setSaving(false) }
  }

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ marginTop: 0 }}>Distro sales</h2>
      <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
        Sell warehouse stock through distribution. Stock decrements atomically and recovers its wave; money runs through the VAT engine. B2B sales keep the full invoice record.
      </p>

      {/* ---- sale form ---- */}
      <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ fontSize: 13, color: '#444' }}>Product<br />
            <select style={{ ...field, marginTop: 4, minWidth: 220 }} value={stockItemId} onChange={(e) => { setStockItemId(e.target.value); setWaveNo('') }}>
              <option value="">Select…</option>
              {products.map((s) => <option key={s.id} value={s.id}>{shortName(s.product)} · {int(s.wh)} in wh</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, color: '#444' }}>Wave<br />
            <select style={{ ...field, marginTop: 4, minWidth: 150 }} value={waveNo} onChange={(e) => setWaveNo(e.target.value)} disabled={!stockItemId}>
              <option value="">Select…</option>
              {waves.map((w) => <option key={w.waveNo} value={w.waveNo}>W{w.waveNo} · {int(w.wh)} avail · {gbp(w.unitCost)}/unit</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, color: '#444' }}>Qty<br />
            <input style={{ ...field, width: 80, marginTop: 4 }} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label style={{ fontSize: 13, color: '#444' }}>Revenue (£)<br />
            <input style={{ ...field, width: 110, marginTop: 4 }} type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </label>
          <label style={{ fontSize: 13, color: '#444' }}>Date<br />
            <input style={{ ...field, marginTop: 4 }} type="date" value={soldOn} max={todayKey()} onChange={(e) => setSoldOn(e.target.value)} />
          </label>
        </div>

        {wave && n > 0 && n > wave.wh && (
          <div style={{ color: '#c82828', fontSize: 13, marginTop: 8 }}>Only {int(wave.wh)} available in wave {wave.waveNo} — can’t sell {n}.</div>
        )}

        {/* channel toggle */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#999', marginRight: 4 }}>Sold to</span>
          {['shop', 'b2b'].map((c) => (
            <button key={c} onClick={() => setChannel(c)}
              style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid ' + (channel === c ? '#1a7f37' : '#ddd'),
                background: channel === c ? '#eafaf0' : '#fff', color: channel === c ? '#1a7f37' : '#777',
                fontWeight: channel === c ? 700 : 400, cursor: 'pointer', fontSize: 13 }}>
              {c === 'shop' ? 'Shop' : 'B2B (business)'}
            </button>
          ))}
        </div>

        {/* B2B record fields */}
        {channel === 'b2b' && (
          <div style={{ marginTop: 12, padding: 14, border: '1px dashed #cbb', borderRadius: 10, background: '#fcfbf9' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, color: '#444' }}>Customer / business<br />
                <input style={{ ...field, marginTop: 4, minWidth: 200 }} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Required" />
              </label>
              <label style={{ fontSize: 13, color: '#444' }}>Customer VAT no<br />
                <input style={{ ...field, marginTop: 4, minWidth: 150 }} value={customerVat} onChange={(e) => setCustomerVat(e.target.value)} placeholder="GB…" />
              </label>
              <label style={{ fontSize: 13, color: '#444' }}>Invoice no / ref<br />
                <input style={{ ...field, marginTop: 4, minWidth: 140 }} value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginTop: 10 }}>
              <label style={{ fontSize: 13, color: '#444' }}>Payment<br />
                <select style={{ ...field, marginTop: 4 }} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </label>
              {paymentStatus === 'unpaid' && (
                <label style={{ fontSize: 13, color: '#444' }}>Due date<br />
                  <input style={{ ...field, marginTop: 4 }} type="date" value={paymentDue} onChange={(e) => setPaymentDue(e.target.value)} />
                </label>
              )}
              <label style={{ fontSize: 13, color: '#444' }}>Invoice file (optional)<br />
                <input style={{ marginTop: 6 }} type="file" accept="application/pdf,image/*" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
              The invoice file is stored privately and viewable from the history below. VAT follows the product’s treatment.
            </div>
          </div>
        )}

        {/* money preview */}
        {Number(revenue) > 0 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatCard label="Revenue" value={gbp0(money.gross)} />
            <StatCard label="VAT" value={gbp0(money.vatOwed)} accent="#b8700a" />
            <StatCard label="Net ex-VAT" value={gbp0(money.netExVat)} />
            <StatCard label="Est. profit" value={gbp0(money.trueProfit)} accent="#1a7f37" sub={`${pct(money.netMarginPct)} margin`} />
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={!canSave || saving || (wave && n > wave.wh)}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: canSave ? '#1a7f37' : '#ccc', color: '#fff', fontWeight: 700, cursor: canSave ? 'pointer' : 'default', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Record distro sale'}
          </button>
          {msg && <span style={{ color: '#1a7f37', fontWeight: 600 }}>{msg}</span>}
          {err && <span style={{ color: '#c82828' }}>{err}</span>}
        </div>
      </div>

      <DistroHistory scoped={scoped} vatOf={vatOf} />
    </div>
  )
}

// ---- history ----
function DistroHistory({ scoped, vatOf }) {
  const [q, setQ] = useState('')
  const [chan, setChan] = useState('all')

  const rows = useMemo(() => {
    return [...scoped.distroSales]
      .filter((d) => chan === 'all' || (d.saleChannel || 'shop') === chan)
      .filter((d) => {
        if (!q) return true
        const hay = `${d.product} ${d.customerName || ''} ${d.invoiceRef || ''}`.toLowerCase()
        return hay.includes(q.toLowerCase())
      })
      .sort((a, b) => (b.soldOn || '').localeCompare(a.soldOn || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((d) => {
        const m = computeMoney({ gross: d.revenue, net: d.revenue, costPaid: d.cost, vatTreatment: vatOf(d.stockItemId) })
        return { d, m }
      })
  }, [scoped, q, chan, vatOf])

  const openInvoice = async (path) => {
    try { const url = await invoiceSignedUrl(path); if (url) window.open(url, '_blank', 'noopener') }
    catch { /* ignore — surfaced as no-op */ }
  }

  const td = { padding: '7px 8px', fontSize: 13, borderTop: '1px solid #f3f3f3' }
  const th = { padding: '0 8px 6px', fontSize: 11, color: '#999', fontWeight: 700, textAlign: 'left' }

  return (
    <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontWeight: 700 }}>History ({rows.length})</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product / customer / invoice…"
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit', flex: 1, minWidth: 180 }} />
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999 }}>
          {[['all', 'All'], ['shop', 'Shop'], ['b2b', 'B2B']].map(([k, l]) => (
            <button key={k} onClick={() => setChan(k)} style={{ padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: chan === k ? 700 : 400, background: chan === k ? '#fff' : 'transparent' }}>{l}</button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>No distro sales yet.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr>
              <th style={th}>Date</th><th style={th}>Product</th><th style={{ ...th, textAlign: 'right' }}>Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Revenue</th><th style={{ ...th, textAlign: 'right' }}>VAT</th><th style={{ ...th, textAlign: 'right' }}>Profit</th>
              <th style={th}>Channel</th><th style={th}>Customer</th><th style={th}>Invoice</th><th style={th}>Payment</th>
            </tr></thead>
            <tbody>
              {rows.map(({ d, m }) => (
                <tr key={d.id}>
                  <td style={td}>{displayDate(d.soldOn, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                  <td style={td}>{shortName(d.product)} <span style={{ color: '#999' }}>W{d.waveNo}</span></td>
                  <td style={{ ...td, textAlign: 'right' }}>{int(d.qty)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{gbp0(d.revenue)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{gbp0(m.vatOwed)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{gbp0(m.trueProfit)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      background: (d.saleChannel === 'b2b') ? '#eef3ff' : '#f3f0e8', color: (d.saleChannel === 'b2b') ? '#2a52be' : '#8a6d1a' }}>
                      {d.saleChannel === 'b2b' ? 'B2B' : 'Shop'}
                    </span>
                  </td>
                  <td style={td}>{d.customerName || '—'}{d.customerVat ? <div style={{ fontSize: 11, color: '#999' }}>{d.customerVat}</div> : null}</td>
                  <td style={td}>
                    {d.invoicePath
                      ? <button onClick={() => openInvoice(d.invoicePath)} style={{ border: 'none', background: 'none', color: '#2a52be', cursor: 'pointer', font: 'inherit', textDecoration: 'underline', padding: 0 }}>View{d.invoiceRef ? ` (${d.invoiceRef})` : ''}</button>
                      : (d.invoiceRef || '—')}
                  </td>
                  <td style={td}>
                    {d.paymentStatus
                      ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: d.paymentStatus === 'paid' ? '#eafaf0' : '#fff3e0', color: d.paymentStatus === 'paid' ? '#1a7f37' : '#b8700a' }}>
                          {d.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}{d.paymentStatus === 'unpaid' && d.paymentDue ? ` · due ${displayDate(d.paymentDue, { day: 'numeric', month: 'short' })}` : ''}
                        </span>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
