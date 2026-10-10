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
  if (!input.title || !input.title.trim()) throw new Error('Title is required')
  if (!input.streamUrl || !input.streamUrl.trim()) throw new Error('Stream URL is required')
  const gross = Number(input.gross) || 0
  if (!(gross > 0)) throw new Error('Gross is required')
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

  // ---- attach the stream URL (share link). record_stream returns void, so
  // set_stream_url finds the just-recorded stream by streamer+date. ----
  if (input.streamUrl && input.streamUrl.trim()) {
    const { error: e3 } = await supabase.rpc('set_stream_url', {
      p_url: input.streamUrl.trim(),
      p_streamer_id: input.streamerId,
      p_stream_date: input.streamDate,
    })
    if (e3) throw e3
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

// DISTRO SALE: warehouse -> sold. Reuses the FIXED record_distro_sale (atomic
// decrement + waterfall), then attaches the B2B/Shop record: sale channel,
// customer, invoice ref + optional uploaded invoice file, payment status/due.
// record_distro_sale returns the new id; we upload the invoice named by that
// id, then set_distro_details writes the record fields. Hard-blocked on wave qty.
export async function distroSale(source, {
  stockItemId, waveNo, qty, revenue, note, soldOn,
  saleChannel, customerName, customerVat, invoiceRef, paymentStatus, paymentDue, invoiceFile,
}) {
  const n = Number(qty)
  if (!stockItemId) throw new Error('Pick a product')
  if (waveNo == null) throw new Error('Pick a wave')
  if (!(n > 0)) throw new Error('Quantity must be positive')
  if (saleChannel && !['b2b', 'shop'].includes(saleChannel)) throw new Error('Sale channel must be B2B or Shop')
  if (saleChannel === 'b2b' && !(customerName && customerName.trim())) throw new Error('B2B sale needs a customer / business name')
  const inWave = availableQty(source, { stockItemId, holderId: 'warehouse', waveNo })
  if (n > inWave) throw new Error(`Only ${inWave} of wave ${waveNo} in the warehouse — cannot sell ${n}`)

  // 1) atomic stock decrement + waterfall; returns the new distro id
  const { data: distroId, error } = await supabase.rpc('record_distro_sale', {
    p_stock_item_id: stockItemId, p_wave_no: waveNo, p_qty: n,
    p_revenue: money2(Number(revenue) || 0), p_note: note || null,
    p_sold_on: soldOn || undefined,
  })
  if (error) throw error

  // 2) upload the invoice file (optional) to the private bucket, named by id
  let invoicePath = null
  if (invoiceFile) {
    const ext = (invoiceFile.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
    invoicePath = `${distroId}/invoice.${ext}`
    const up = await supabase.storage.from('distro-invoices')
      .upload(invoicePath, invoiceFile, { upsert: true, contentType: invoiceFile.type || undefined })
    if (up.error) throw new Error(`Sale saved, but invoice upload failed: ${up.error.message}`)
  }

  // 3) attach the record fields
  if (saleChannel || customerName || invoiceRef || paymentStatus || invoicePath) {
    const { error: e2 } = await supabase.rpc('set_distro_details', {
      p_id: distroId,
      p_sale_channel: saleChannel || null,
      p_customer_name: customerName || null,
      p_customer_vat: customerVat || null,
      p_invoice_ref: invoiceRef || null,
      p_payment_status: paymentStatus || null,
      p_payment_due: paymentDue || null,
      p_invoice_path: invoicePath,
    })
    if (e2) throw e2
  }
  return distroId
}

// A short-lived signed URL to view/download a private invoice file.
export async function invoiceSignedUrl(path, seconds = 120) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('distro-invoices').createSignedUrl(path, seconds)
  if (error) throw error
  return data?.signedUrl || null
}

// DELETE a stream — reuses V1's delete_stream RPC (atomic: removes the
// stream + lines and restores the stock to where it came from).
export async function deleteStream(streamId) {
  if (!streamId) throw new Error('No stream id')
  const { error } = await supabase.rpc('delete_stream', { p_stream_id: streamId })
  if (error) throw error
}

// EDIT a stream — reuses V1's edit_stream RPC, which mirrors record_stream
// exactly (same params + p_stream_id) and does the atomic reverse-and-reapply
// internally: it reverses the old stock movement and applies the new one, all
// in one transaction. V2 validates first (same guards as saveStream) and
// refreshes the shared source after, so every screen recomputes from truth.
export async function editStream(input) {
  if (!input.streamId) throw new Error('No stream to edit')
  if (!input.streamerId) throw new Error('Streamer is required')
  if (!input.streamDate) throw new Error('Stream date is required')
  const gross = Number(input.gross) || 0
  if (gross < 0) throw new Error('Gross cannot be negative')
  const lines = (input.lines || []).filter((l) => l.stockItemId && Number(l.qty) > 0)
  if (lines.length === 0) throw new Error('Add at least one product line')
  if (input.net != null && Number(input.net) > gross) throw new Error('Net cannot exceed gross')

  const p_lines = lines.map((l) => ({ stock_item_id: l.stockItemId, qty: Number(l.qty), price: Number(l.price) || 0 }))

  const { error: e1 } = await supabase.rpc('edit_stream', {
    p_stream_id: input.streamId,
    p_streamer_id: input.streamerId,
    p_platform: input.platform || null,
    p_channel: input.channel || null,
    p_stream_date: input.streamDate,
    p_stream_start: input.streamStart || null,
    p_stream_end: input.streamEnd || null,
    p_stream_type: input.streamType || null,
    p_total_sales: money2(gross),
    p_lines,
    p_singles_qty: 0, p_singles_avg_cost: 0, p_singles_revenue: 0,
    p_title: input.title || null, p_mixed_types: null, p_giveaways: [],
  })
  if (e1) throw e1

  // Re-attach V2 money fields (net/shipping/fees) after the edit.
  if (input.net != null || input.shipping != null) {
    const { error: e2 } = await supabase.rpc('set_stream_money', {
      p_stream_id: input.streamId,
      p_net: input.net != null ? money2(input.net) : null,
      p_shipping: input.shipping != null ? money2(input.shipping) : null,
    })
    if (e2) throw e2
  }

  // Edit has the id directly — set the URL on this exact stream.
  if (input.streamUrl !== undefined) {
    const { error: e3 } = await supabase.rpc('set_stream_url', {
      p_url: input.streamUrl ? input.streamUrl.trim() : '',
      p_stream_id: input.streamId,
    })
    if (e3) throw e3
  }
}

// REASSIGN a person's department (admin/manager). Simple profiles update;
// RLS enforces who may do it. Refresh after so scoping/rosters update.
export async function reassignDepartment(profileId, department) {
  if (!profileId) throw new Error('No person selected')
  const { error } = await supabase.from('profiles').update({ department }).eq('id', profileId)
  if (error) throw error
}
