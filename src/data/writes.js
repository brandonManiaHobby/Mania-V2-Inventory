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
  const gross = Number(input.gross) || 0
  if (gross < 0) throw new Error('Gross cannot be negative')   // 0 is allowed — a no-sales stream can still be logged
  const rawLines = input.lines || []
  const lines = rawLines.filter((l) => l.stockItemId && Number(l.qty) > 0)
  // Brokered deals: ran through the show but not the streamer's own stock. Carried
  // as lines with brokered:true so record_stream credits the channel, not the
  // streamer, and never decrements a shelf. Each needs a deal owner.
  const rawBrokered = input.brokered || []
  const brokered = rawBrokered.filter((b) => b.stockItemId && Number(b.qty) > 0)
  if (brokered.some((b) => !b.ownerId)) throw new Error('Every brokered deal needs a deal owner selected before you can save')
  // A HALF-filled product line is a real mistake worth catching; an entirely empty
  // line set is fine — a 0-sales stream (nothing opened/sold) can still be recorded.
  const anyProduct = rawLines.some((l) => l.stockItemId)
  const anyQty = rawLines.some((l) => Number(l.qty) > 0)
  if (!anyProduct && anyQty) throw new Error('Pick a product for the line (qty is set but no product selected)')
  if (anyProduct && !anyQty) throw new Error('Enter a quantity for the product')
  if (input.net != null && Number(input.net) > gross) {
    throw new Error('Net cannot exceed gross')
  }

  // ---- atomic stream + lines + holdings decrement (V1's proven RPC) ----
  const p_lines = lines.map((l) => ({
    stock_item_id: l.stockItemId,
    qty: Number(l.qty),
    price: Number(l.price) || 0,
    ...(l.type ? { type: l.type } : {}),   // per-line type for Mixed streams
  })).concat(brokered.map((b) => ({
    stock_item_id: b.stockItemId,
    qty: Number(b.qty),
    price: Number(b.price) || 0,
    brokered: true,
    brokered_owner_id: b.ownerId || null,
  })))

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
    p_singles_qty: Number(input.singlesQty) || 0,
    p_singles_avg_cost: Number(input.singlesAvg) || 0,
    p_singles_revenue: Number(input.singlesRev) || 0,
    p_title: input.title || null,
    p_mixed_types: input.mixedTypes || null,
    // co-pilot + giveaways match V1's record_stream overload exactly.
    p_copilot_id: input.copilotId || null,
    p_copilot_share: input.copilotId ? 0.5 : null,
    p_giveaways: Array.isArray(input.giveaways) ? input.giveaways : [],
  })
  if (e1) throw e1

  // ---- resolve THIS stream's id, so the money/URL updates hit the exact stream
  // just recorded — NOT another the same streamer ran on the same day. (Matching
  // by streamer+date corrupted same-day streams: the URL/net landed on the wrong
  // one.) Use the id record_stream returns; if it returns void, read the newest
  // stream for this streamer+date (the one we just inserted). ----
  let newId = streamId || null
  if (!newId) {
    // Fallback (record_stream normally returns the id): find the row we just
    // inserted by streamer+date+title+gross — far tighter than streamer+date, so
    // it won't grab a different same-day stream. (The scoped view has no
    // created_at column, so we can't order by insertion time.)
    const { data: rows } = await supabase
      .from('v_streams_scoped')
      .select('id, title, total_sales')
      .eq('streamer_id', input.streamerId)
      .eq('stream_date', input.streamDate)
      .eq('title', input.title)
    const g = Number(money2(gross))
    const match = (rows || []).filter((r) => Number(r.total_sales) === g)
    newId = (match[0] || (rows || [])[0] || {}).id || null
  }

  // ---- attach V2 money fields (net/shipping/fees) to THIS stream by id ----
  if (newId && (input.net != null || input.shipping != null)) {
    const { error: e2 } = await supabase.rpc('set_stream_money', {
      p_net: input.net != null ? money2(input.net) : null,
      p_shipping: input.shipping != null ? money2(input.shipping) : null,
      p_stream_id: newId,
    })
    if (e2) throw e2
  }

  // ---- attach promo spend (platform boost) to THIS stream by id ----
  if (newId && input.promo != null) {
    const { error: ep } = await supabase.rpc('set_stream_promo', {
      p_promo: money2(input.promo),
      p_stream_id: newId,
    })
    if (ep) throw ep
  }

  // ---- attach the stream URL (share link) to THIS stream by id ----
  if (newId && input.streamUrl && input.streamUrl.trim()) {
    const { error: e3 } = await supabase.rpc('set_stream_url', {
      p_url: input.streamUrl.trim(),
      p_stream_id: newId,
    })
    if (e3) throw e3
  }

  return newId
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

// HANDOVER: YOUR OWN shelf -> streamer. Lets a lead parcel out stock they
// hold to their team (source is always the caller's own holdings, server-side).
export async function handToStreamer(source, { stockItemId, toStreamerId, qty }) {
  const n = Number(qty)
  if (!stockItemId) throw new Error('Pick a product')
  if (!toStreamerId) throw new Error('Pick a streamer')
  if (!(n > 0)) throw new Error('Quantity must be positive')
  const { error } = await supabase.rpc('record_handover', {
    p_stock_item_id: stockItemId, p_qty: n, p_to_breaker: toStreamerId,
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
  // Giveaways reconcile the same way as record_stream: {stock_item_id, qty}.
  const giveaways = (input.giveaways || []).filter((g) => g.stockItemId && Number(g.qty) > 0)
    .map((g) => ({ stock_item_id: g.stockItemId, qty: Number(g.qty) }))
  if (lines.length === 0 && giveaways.length === 0) throw new Error('Add at least one product line or giveaway')
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
    p_title: input.title || null, p_mixed_types: input.mixedTypes || null, p_giveaways: giveaways,
  })
  if (e1) throw e1

  // Re-attach V2 money fields (net/shipping/fees) after the edit — this path
  // has the stream id directly.
  if (input.net != null || input.shipping != null) {
    const { error: e2 } = await supabase.rpc('set_stream_money', {
      p_net: input.net != null ? money2(input.net) : null,
      p_shipping: input.shipping != null ? money2(input.shipping) : null,
      p_stream_id: input.streamId,
    })
    if (e2) throw e2
  }

  // Re-attach promo spend on edit (undefined = leave as-is; null/number = set).
  if (input.promo !== undefined) {
    const { error: ep } = await supabase.rpc('set_stream_promo', {
      p_promo: input.promo != null ? money2(input.promo) : null,
      p_stream_id: input.streamId,
    })
    if (ep) throw ep
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

// REASSIGN a person's department (admin/manager). A DB trigger locks the
// department once set, so a MOVE between departments must go via unassign
// (department = null) first, then assign — both as the current admin. We only
// take the unassign step when actually moving a non-null department, so a plain
// first-time assignment (or a clear) stays a single update.
export async function reassignDepartment(profileId, department) {
  if (!profileId) throw new Error('No person selected')
  const target = department || null
  const { data: cur } = await supabase.from('profiles').select('department').eq('id', profileId).maybeSingle()
  const current = cur?.department ?? null
  if (current === target) return
  if (current && target) {
    const { error: e1 } = await supabase.from('profiles').update({ department: null }).eq('id', profileId)
    if (e1) throw e1
  }
  const { error: e2 } = await supabase.from('profiles').update({ department: target }).eq('id', profileId)
  if (e2) throw e2
}

// ============================================================
// STOCK INTAKE + WAVE ADMINISTRATION (reuses V1's proven RPCs)
// record_restock: creates the product if new, else adds the stock as a wave
// (same unit cost tops up the matching wave; a new cost makes a new wave).
// edit_wave_cost: the qty/cost fold — total_cost is ALWAYS qty×unit_cost, so
// they can never drift; p_mode decides whether a cost change restates past
// streams ('recompute') or only applies forward ('forward').
// ============================================================

// INTAKE: bring stock in. product (new or existing name) + type + £/unit + qty.
export async function addStock({ product, type, cost, qty }) {
  const p = String(product || '').trim()
  const c = Number(cost); const q = Number(qty)
  if (!p) throw new Error('Product name is required')
  if (!(q > 0)) throw new Error('Quantity must be more than zero')
  if (!(c >= 0)) throw new Error('Cost per unit must be zero or more')
  const { error } = await supabase.rpc('record_restock', {
    p_product: p, p_type: type || null, p_cost: money2(c), p_qty: q,
  })
  if (error) throw error
}

// CORRECT / WRITE-OFF warehouse quantity to an EXACT number. Reuses V1's
// set_warehouse_qty, which keeps the FIFO waves in sync (it consumes layers on a
// decrease) and logs an adjustment. Use it to tally off stock (set a lower qty),
// fix a miscount, or zero a product out. Gated server-side by can_move_stock().
export async function setWarehouseQty({ product, type, cost, qty }) {
  const p = String(product || '').trim()
  const q = Number(qty)
  if (!p) throw new Error('Product name is required')
  if (!(q >= 0)) throw new Error('Quantity cannot be negative')
  const { error } = await supabase.rpc('set_warehouse_qty', {
    p_product: p, p_type: type || null,
    p_cost: cost != null ? money2(cost) : null, p_qty: q,
  })
  if (error) throw error
}

// WAVE EDIT (admin). Always passes an explicit unit cost + qty; the RPC keeps
// total_cost = qty×unit_cost. mode: 'forward' (default) or 'recompute' (restate
// past streams). The UI picks the qty/cost basis and computes newUnitCost.
export async function editWaveCost({ stockItemId, waveNo, newUnitCost, newQty, mode = 'forward', note }) {
  if (!stockItemId) throw new Error('No product')
  if (waveNo == null) throw new Error('No wave')
  if (!(Number(newUnitCost) >= 0)) throw new Error('Per-unit cost must be zero or more')
  if (newQty != null && !(Number(newQty) > 0)) throw new Error('Quantity must be more than zero')
  if (!['forward', 'recompute'].includes(mode)) throw new Error('Invalid mode')
  // Pass the unit cost at FULL precision (no money2): the RPC derives
  // total_cost = round(qty × unit_cost, 2), so rounding the unit here would
  // drift the total (e.g. 16000/600 → 26.67 → 16002). Full precision keeps
  // "total cost fixed" exact; display rounds at the edge.
  const { error } = await supabase.rpc('edit_wave_cost', {
    p_stock_item_id: stockItemId, p_wave_no: waveNo,
    p_new_unit_cost: Number(newUnitCost),
    p_new_qty: newQty != null ? Number(newQty) : null,
    p_mode: mode, p_note: note || null,
  })
  if (error) throw error
}

// MERGE WAVES (admin/manager). Blends the warehouse on-hand of the given waves
// (or all, if waveNos empty) into one wave at the weighted-average cost. Sold and
// streamer-held units keep their original cost — only on-hand is re-costed.
export async function mergeWaves({ stockItemId, waveNos }) {
  if (!stockItemId) throw new Error('No product')
  const { error } = await supabase.rpc('merge_waves', {
    p_stock_item_id: stockItemId,
    p_wave_nos: (Array.isArray(waveNos) && waveNos.length) ? waveNos : null,
  })
  if (error) throw error
}

// Preview the impact of a cost change on past streams (before committing).
export async function waveImpactSummary(stockItemId, waveNo, newUnitCost) {
  const { data, error } = await supabase.rpc('wave_edit_impact_summary', {
    p_stock_item_id: stockItemId, p_wave_no: waveNo, p_new_unit_cost: money2(Number(newUnitCost) || 0),
  })
  if (error) throw error
  const r = Array.isArray(data) ? data[0] : data
  return r || { streams: 0, total_units: 0, total_swing: 0, old_unit_cost: 0 }
}

// DELETE a wave (admin). RPC refuses if any stream has recovered against it.
export async function deleteWave({ stockItemId, waveNo, unitCost, totalCost, note }) {
  if (!stockItemId) throw new Error('No product')
  if (waveNo == null) throw new Error('No wave')
  const { error } = await supabase.rpc('delete_wave', {
    p_stock_item_id: stockItemId, p_wave_no: waveNo,
    p_unit_cost: money2(Number(unitCost) || 0), p_total_cost: money2(Number(totalCost) || 0),
    p_note: note || null,
  })
  if (error) throw error
}

// ============================================================
// CONSUMABLE REQUESTS — streamer requests → warehouse fulfils (issues stock).
// Fetched on its own (NOT in the core source load) and tolerant of the table
// not existing yet, so the app never breaks if the migration hasn't run.
// ============================================================
export async function loadConsumableRequests() {
  const { data, error } = await supabase
    .from('consumable_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return { rows: [], ready: false }   // table missing / not permitted -> graceful empty
  return { rows: data || [], ready: true }
}

export async function requestConsumable({ streamerId, stockItemId, itemText, qty, note }) {
  if (!streamerId) throw new Error('No streamer')
  const n = Number(qty)
  if (!(n > 0)) throw new Error('Quantity must be more than zero')
  if (!stockItemId && !(itemText && itemText.trim())) throw new Error('Pick a consumable or describe it')
  const { error } = await supabase.from('consumable_requests').insert({
    streamer_id: streamerId, stock_item_id: stockItemId || null,
    item_text: itemText ? itemText.trim() : null, qty: n, note: note || null,
  })
  if (error) throw error
}

export async function fulfilConsumableRequest(id) {
  if (!id) throw new Error('No request')
  const { error } = await supabase.rpc('fulfil_consumable_request', { p_id: id })
  if (error) throw error
}

export async function declineConsumableRequest(id) {
  if (!id) throw new Error('No request')
  const { error } = await supabase.from('consumable_requests')
    .update({ status: 'declined' }).eq('id', id)
  if (error) throw error
}

// UPDATE product attributes: name, type, archived, Breakers price. RLS gates
// who may (admin/manager). Direct update — same pattern V1 uses.
export async function updateProduct({ id, product, type, archived, breakPrice, vatTreatment }) {
  if (!id) throw new Error('No product')
  const patch = {}
  if (product !== undefined) { if (!String(product).trim()) throw new Error('Product name cannot be blank'); patch.product = String(product).trim() }
  if (type !== undefined) patch.type = type || null
  if (archived !== undefined) patch.archived = !!archived
  if (breakPrice !== undefined) patch.break_price = breakPrice === '' || breakPrice == null ? null : money2(Number(breakPrice))
  if (vatTreatment !== undefined) {
    if (!['standard', 'second_hand'].includes(vatTreatment)) throw new Error('Invalid VAT treatment')
    patch.vat_treatment = vatTreatment
  }
  const { error } = await supabase.from('stock_items').update(patch).eq('id', id)
  if (error) throw error
}

// ---- RELEASE CALENDAR (admin/manager only; RLS also enforces this) ----
// Insert when no id, update when id present. Returns nothing; caller refreshes.
export async function saveRelease(input) {
  if (!input.product || !String(input.product).trim()) throw new Error('Product is required')
  const row = {
    product: String(input.product).trim(),
    sport: input.sport ? String(input.sport).trim() : null,
    release_date: input.releaseDate || null,
    release_time_utc: input.releaseTimeUtc || null,
    time_confirmed: !!input.timeConfirmed,
    is_bowman: !!input.isBowman,
    status: input.status || 'scheduled',
    source: input.source || 'manual',
    source_url: input.sourceUrl || null,
    invoice_ref: input.invoiceRef ? String(input.invoiceRef).trim() : null,
    invoice_amount: input.invoiceAmount === '' || input.invoiceAmount == null ? null : money2(Number(input.invoiceAmount)),
    invoice_due: input.invoiceDue || null,
    invoice_status: input.invoiceStatus || 'none',
    notes: input.notes ? String(input.notes).trim() : null,
  }
  if (input.id) {
    const { error } = await supabase.from('release_calendar').update(row).eq('id', input.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('release_calendar').insert(row)
    if (error) throw error
  }
}

export async function deleteRelease(id) {
  if (!id) throw new Error('No release')
  const { error } = await supabase.from('release_calendar').delete().eq('id', id)
  if (error) throw error
}

// ---- STREAMER WEEKLY HOUR TARGETS (admin/manager; RLS enforces) ----
// ---- CARD SHOWS (leads/managers/admin; RLS enforces) ----
export async function saveCardShow(input) {
  if (!input.name || !String(input.name).trim()) throw new Error('Show name is required')
  if (!input.startDate) throw new Error('Start date is required')
  const row = {
    name: String(input.name).trim(),
    location: input.location ? String(input.location).trim() : null,
    start_date: input.startDate,
    end_date: input.endDate || null,
    days: Number(input.days) || 1,
    operating_hours: Number(input.operatingHours) || 0,
    notes: input.notes ? String(input.notes).trim() : null,
  }
  if (input.id) {
    const { error } = await supabase.from('card_shows').update(row).eq('id', input.id)
    if (error) throw error
    return input.id
  }
  const { data, error } = await supabase.from('card_shows').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

export async function deleteCardShow(id) {
  if (!id) throw new Error('No show')
  const { error } = await supabase.from('card_shows').delete().eq('id', id)
  if (error) throw error
}

// One contribution per attending person/department.
export async function saveShowEntry(showId, input) {
  if (!showId) throw new Error('No show')
  if (!input.profileId) throw new Error('Pick a person')
  const row = {
    show_id: showId, profile_id: input.profileId,
    department: input.department || null,
    hours: Number(input.hours) || 0, overnight: !!input.overnight,
    sales_cash: money2(Number(input.salesCash) || 0),
    sales_card: money2(Number(input.salesCard) || 0),
    sales_transfer: money2(Number(input.salesTransfer) || 0),
    profit: money2(Number(input.profit) || 0),
  }
  if (input.id) {
    const { error } = await supabase.from('card_show_entries').update(row).eq('id', input.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('card_show_entries').upsert(row, { onConflict: 'show_id,profile_id' })
    if (error) throw error
  }
}

export async function deleteShowEntry(id) {
  if (!id) throw new Error('No entry')
  const { error } = await supabase.from('card_show_entries').delete().eq('id', id)
  if (error) throw error
}

export async function saveShowCost(showId, { label, amount, profileId }) {
  if (!showId) throw new Error('No show')
  if (!label || !String(label).trim()) throw new Error('Cost needs a label')
  const { error } = await supabase.from('card_show_costs')
    .insert({ show_id: showId, profile_id: profileId || null, label: String(label).trim(), amount: money2(Number(amount) || 0) })
  if (error) throw error
}

export async function deleteShowCost(id) {
  if (!id) throw new Error('No cost')
  const { error } = await supabase.from('card_show_costs').delete().eq('id', id)
  if (error) throw error
}

export async function setStreamerTarget(streamerId, weeklyHours) {
  if (!streamerId) throw new Error('No streamer')
  const h = Number(weeklyHours)
  if (!isFinite(h) || h < 0) throw new Error('Hours must be 0 or more')
  const { error } = await supabase.from('streamer_targets')
    .upsert({ streamer_id: streamerId, weekly_hours: money2(h), updated_at: new Date().toISOString() }, { onConflict: 'streamer_id' })
  if (error) throw error
}
