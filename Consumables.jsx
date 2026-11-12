import { useMemo, useState, useEffect, useCallback } from 'react'
import { gbp, gbp0, int, useSource, isConsumable, shortName, displayDate, loadConsumableRequests, fulfilConsumableRequest, declineConsumableRequest } from '../data'

// ============================================================
// CONSUMABLES (Stock) — sleeves, top loaders, team bags, labels, postage.
// Tracked as stock (add via Add stock, issue via Move stock), so we get:
// warehouse levels, and how much each streamer is holding + the cost of it.
// A consumable is any product whose TYPE reads as a consumable category.
// Populate it by adding stock with a consumable type (e.g. "Sleeves").
// ============================================================
export default function Consumables({ scoped }) {
  const { refresh } = useSource()
  const nameOf = (id) => scoped.profiles.find((p) => p.id === id)?.name || '—'
  const canFulfil = !!scoped.cap?.canMoveStock

  // Requests live outside the core source (tolerant of the table not existing).
  const [requests, setRequests] = useState([])
  const [busy, setBusy] = useState(null)
  const loadReqs = useCallback(async () => { const { rows } = await loadConsumableRequests(); setRequests(rows) }, [])
  useEffect(() => { loadReqs() }, [loadReqs])
  const pending = requests.filter((r) => r.status === 'pending')

  const fulfil = async (id) => { setBusy(id); try { await fulfilConsumableRequest(id); await refresh(); await loadReqs() } catch (e) { alert(e.message) } finally { setBusy(null) } }
  const decline = async (id) => { setBusy(id); try { await declineConsumableRequest(id); await loadReqs() } catch (e) { alert(e.message) } finally { setBusy(null) } }
  const reqItemName = (r) => r.stock_item_id ? shortName(scoped.stockItems.find((s) => s.id === r.stock_item_id)?.product || '—') : (r.item_text || '—')

  const model = useMemo(() => {
    const items = scoped.stockItems.filter(isConsumable)
    const ids = new Set(items.map((i) => i.id))
    const itemName = Object.fromEntries(items.map((i) => [i.id, shortName(i.product)]))

    // holdings of consumables, split warehouse vs each streamer
    let warehouseUnits = 0, warehouseVal = 0
    const byStreamer = {}      // holderId -> { units, cost }
    const byProduct = {}       // stockItemId -> { warehouse, withStreamers, cost }
    for (const h of scoped.holdings) {
      if (!ids.has(h.stockItemId) || h.qty <= 0) continue
      const val = h.qty * (Number(h.unitCost) || 0)
      const p = byProduct[h.stockItemId] || (byProduct[h.stockItemId] = { id: h.stockItemId, warehouse: 0, withStreamers: 0, cost: 0 })
      p.cost += val
      if (h.isWarehouse) { warehouseUnits += h.qty; warehouseVal += val; p.warehouse += h.qty }
      else {
        p.withStreamers += h.qty
        const s = byStreamer[h.holderId] || (byStreamer[h.holderId] = { holderId: h.holderId, units: 0, cost: 0 })
        s.units += h.qty; s.cost += val
      }
    }
    const streamers = Object.values(byStreamer).sort((a, b) => b.cost - a.cost)
    const products = Object.values(byProduct).map((p) => ({ ...p, name: itemName[p.id] })).sort((a, b) => b.cost - a.cost)
    const issuedUnits = streamers.reduce((a, s) => a + s.units, 0)
    const issuedCost = streamers.reduce((a, s) => a + s.cost, 0)
    return { items, streamers, products, warehouseUnits, warehouseVal, issuedUnits, issuedCost }
  }, [scoped])

  const downloadCsv = () => {
    const q = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const m = (n) => (Number(n) || 0).toFixed(2)
    const out = ['Streamer,Units held,Cost held']
    model.streamers.forEach((s) => out.push([q(nameOf(s.holderId)), s.units, m(s.cost)].join(',')))
    out.push('', `TOTAL ISSUED,${model.issuedUnits},${m(model.issuedCost)}`)
    const url = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = 'mania-consumables-by-streamer.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const th = { textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 700, padding: '0 8px 6px' }
  const td = { padding: '7px 8px', fontSize: 13, borderTop: '1px solid #f3f3f3' }

  const requestsPanel = pending.length > 0 && (
    <div className="panel" style={{ borderColor: 'var(--orange)' }}>
      <div style={{ fontWeight: 800, marginBottom: 8, color: 'var(--orange)' }}>⚑ Consumable requests ({pending.length})</div>
      <table>
        <thead><tr><th style={th}>When</th><th style={th}>Streamer</th><th style={th}>Item</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={th}>Note</th><th style={{ ...th, textAlign: 'right' }}></th></tr></thead>
        <tbody>
          {pending.map((r) => (
            <tr key={r.id}>
              <td style={td}>{displayDate(String(r.created_at).slice(0, 10), { day: 'numeric', month: 'short' })}</td>
              <td style={td}>{nameOf(r.streamer_id)}</td>
              <td style={td}>{reqItemName(r)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{int(r.qty)}</td>
              <td style={{ ...td, color: '#777' }}>{r.note || ''}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {canFulfil ? (
                  <>
                    <button className="btn sm green" disabled={busy === r.id} onClick={() => fulfil(r.id)}>{r.stock_item_id ? 'Fulfil & issue' : 'Mark done'}</button>{' '}
                    <button className="btn ghost sm" disabled={busy === r.id} onClick={() => decline(r.id)}>Decline</button>
                  </>
                ) : <span className="note">pending</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pending.some((r) => r.stock_item_id) && <p className="note" style={{ marginBottom: 0 }}>“Fulfil &amp; issue” moves the stock from the warehouse onto that streamer’s shelf.</p>}
    </div>
  )

  if (model.items.length === 0) {
    return (
      <div>
        <h2 className="h2">Consumables</h2>
        {requestsPanel}
        <div className="panel">
          <p className="note" style={{ marginTop: 0 }}>No consumables yet. Add them under <strong>Add stock</strong> with a consumable type — e.g. Sleeves, Top loaders, Team bags, Labels, Postage — then issue them to streamers under Move stock. They’ll be tracked here with per-streamer cost.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="h2" style={{ margin: 0 }}>Consumables</h2>
        <button className="btn ghost sm" onClick={downloadCsv} disabled={model.streamers.length === 0}>Export by streamer</button>
      </div>
      <p className="note">Sleeves, top loaders, team bags, labels and postage — warehouse levels and what each streamer is holding, with the cost.</p>

      {requestsPanel}

      <div className="cards" style={{ marginTop: 10 }}>
        <div className="stat"><div className="label">In warehouse</div><div className="value">{int(model.warehouseUnits)}</div><div className="note">{gbp0(model.warehouseVal)} value</div></div>
        <div className="stat"><div className="label">Issued to streamers</div><div className="value">{int(model.issuedUnits)}</div><div className="note">{gbp0(model.issuedCost)} cost out</div></div>
        <div className="stat"><div className="label">Products</div><div className="value">{model.items.length}</div></div>
      </div>

      <div className="panel">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>By streamer</div>
        {model.streamers.length === 0 ? <p className="note" style={{ marginTop: 0 }}>None issued to streamers yet.</p> : (
          <table>
            <thead><tr><th style={th}>Streamer</th><th style={{ ...th, textAlign: 'right' }}>Units held</th><th style={{ ...th, textAlign: 'right' }}>Cost held</th></tr></thead>
            <tbody>
              {model.streamers.map((s) => (
                <tr key={s.holderId}>
                  <td style={{ ...td, textAlign: 'left' }}>{nameOf(s.holderId)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{int(s.units)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{gbp0(s.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>By product</div>
        <table>
          <thead><tr><th style={th}>Product</th><th style={{ ...th, textAlign: 'right' }}>Warehouse</th><th style={{ ...th, textAlign: 'right' }}>With streamers</th><th style={{ ...th, textAlign: 'right' }}>Total value</th></tr></thead>
          <tbody>
            {model.products.map((p) => (
              <tr key={p.id}>
                <td style={{ ...td, textAlign: 'left' }}>{p.name}</td>
                <td style={{ ...td, textAlign: 'right' }}>{int(p.warehouse)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{int(p.withStreamers)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{gbp0(p.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
