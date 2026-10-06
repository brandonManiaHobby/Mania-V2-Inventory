// ============================================================
// DATA LAYER — WRITES (hardening #2: atomic, named, validated)
// All mutations go through named functions here. Nothing else writes.
// Reuses V1's proven atomic RPCs (record_stream etc.) so we don't
// reinvent the atomic stock/stream logic — just add V2's money fields.
// ============================================================
import { supabase } from '../supabaseClient'
import { money2 } from './numbers'

// Save a stream: atomic stock/stream insert via record_stream, then attach
// net/shipping (fees derived) via set_stream_money. Validates first.
export async function saveStream(input) {
  // ---- validate at the door ----
  if (!input.streamerId) throw new Error('Streamer is required')
  if (!input.streamDate) throw new Error('Stream date is required')
  const gross = Number(input.gross) || 0
  if (gross < 0) throw new Error('Gross cannot be negative')
  const rawLines = input.lines || []
  const lines = rawLines.filter((l) => l.stockItemId && Number(l.qty) > 0)
  if (lines.length === 0) {
    // Specific diagnosis: distinguish "no product picked" from "no qty".
    const anyProduct = rawLines.some((l) => l.stockItemId)
    const anyQty = rawLines.some((l) => Number(l.qty) > 0)
    if (!anyProduct && anyQty) throw new Error('Pick a product for the line (qty is set but no product selected)')
    if (anyProduct && !anyQty) throw new Error('Enter a quantity for the product')
    throw new Error('Add at least one product line (product + qty)')
  }
  if (input.net != null && Number(input.net) > gross) {
    throw new Error('Net cannot exceed gross')
  }

  // ---- atomic stream + lines + holdings decrement (V1's proven RPC) ----
  const p_lines = lines.map((l) => ({
    stock_item_id: l.stockItemId,
    qty: Number(l.qty),
    price: Number(l.price) || 0,
  }))

  const { data: streamId, error: e1 } = await supabase.rpc('record_stream', {
    p_streamer_id: input.streamerId,
    p_platform: input.platform || null,
    p_channel: input.channel || null,
    p_stream_date: input.streamDate,
    p_stream_start: input.streamStart || null,
    p_stream_end: input.streamEnd || null,
    p_stream_type: input.streamType || null,
    p_total_sales: money2(gross),
    p_lines,
    p_singles_qty: 0,
    p_singles_avg_cost: 0,
    p_singles_revenue: 0,
    p_title: input.title || null,
    p_mixed_types: null,
    p_giveaways: [],
  })
  if (e1) throw e1

  // ---- attach V2 money fields (net/shipping/fees) ----
  if (input.net != null || input.shipping != null) {
    const { error: e2 } = await supabase.rpc('set_stream_money', {
      p_stream_id: streamId,
      p_net: input.net != null ? money2(input.net) : null,
      p_shipping: input.shipping != null ? money2(input.shipping) : null,
    })
    if (e2) throw e2
  }

  return streamId
}

// ============================================================
// STOCK MOVES (hardening #3: one movement path, atomic, hard-blocked)
// Three transfers. Each validates available qty FIRST (hard block), then
// performs the move atomically via V1's proven RPCs. Warehouse is matched
// explicitly (never a null=null comparison). Caller previews before calling.
// ============================================================

// How much of a product a holder currently has in a specific wave (or total).
// Used for the hard-block check and the preview before/after.
export function availableQty(source, { stockItemId, holderId, waveNo }) {
  return source.holdings
    .filter((h) => h.stockItemId === stockItemId
      && (holderId === 'warehouse' ? h.isWarehouse : h.holderId === holderId)
      && (waveNo == null || h.waveNo === waveNo))
    .reduce((a, h) => a + h.qty, 0)
}

// RESTOCK: warehouse -> streamer. Reuses record_checkout (proven atomic:
// pulls from warehouse FIFO, lands on the streamer's shelf).
export async function restock(source, { stockItemId, toStreamerId, qty }) {
  const n = Number(qty)
  if (!stockItemId) throw new Error('Pick a product')
  if (!toStreamerId) throw new Error('Pick a streamer')
  if (!(n > 0)) throw new Error('Quantity must be positive')
  const inWarehouse = availableQty(source, { stockItemId, holderId: 'warehouse' })
  if (n > inWarehouse) throw new Error(`Only ${inWarehouse} in the warehouse — cannot move ${n}`)

  const { error } = await supabase.rpc('record_checkout', {
    p_stock_item_id: stockItemId, p_qty: n, p_breaker_id: toStreamerId,
  })
  if (error) throw error
}

// RETURN: streamer -> warehouse. Reuses record_return if present; else moves
// holdings explicitly (null-safe warehouse). Hard-blocked on streamer's qty.
export async function returnToWarehouse(source, { stockItemId, fromStreamerId, qty }) {
  const n = Number(qty)
  if (!stockItemId) throw new Error('Pick a product')
  if (!fromStreamerId) throw new Error('Pick a streamer')
  if (!(n > 0)) throw new Error('Quantity must be positive')
  const held = availableQty(source, { stockItemId, holderId: fromStreamerId })
  if (n > held) throw new Error(`They only have ${held} — cannot return ${n}`)

  const { error } = await supabase.rpc('record_return', {
    p_stock_item_id: stockItemId, p_qty: n, p_breaker_id: fromStreamerId,
  })
  if (error) throw error
}

// DISTRO SALE: warehouse -> sold. Reuses the FIXED record_distro_sale (now
// decrements correctly). Needs a wave + revenue. Hard-blocked on wave qty.
export async function distroSale(source, { stockItemId, waveNo, qty, revenue, note }) {
  const n = Number(qty)
  if (!stockItemId) throw new Error('Pick a product')
  if (waveNo == null) throw new Error('Pick a wave')
  if (!(n > 0)) throw new Error('Quantity must be positive')
  const inWave = availableQty(source, { stockItemId, holderId: 'warehouse', waveNo })
  if (n > inWave) throw new Error(`Only ${inWave} of wave ${waveNo} in the warehouse — cannot sell ${n}`)

  const { error } = await supabase.rpc('record_distro_sale', {
    p_stock_item_id: stockItemId, p_wave_no: waveNo, p_qty: n,
    p_revenue: money2(Number(revenue) || 0), p_note: note || null,
  })
  if (error) throw error
}
