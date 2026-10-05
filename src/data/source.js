// ============================================================
// DATA LAYER — THE SHARED SOURCE (drift guarantees #3 and #4)
// "One brain": loads the core dataset ONCE, up front, into a single
// shared object. Every screen DERIVES from this — no screen runs its
// own query or holds its own snapshot. A historic edit reloads the
// source once → every screen re-derives identically. Screens cannot
// disagree, by construction.
//
// #3 CONSISTENT READS: one named fetcher per thing, each returning the
//    same typed, normalised shape every time.
// #4 NULLS: normalised at this boundary. Warehouse (holder_id null) is
//    represented consistently; missing numbers default to 0; downstream
//    never guesses.
// ============================================================
import { supabase } from '../supabaseClient'
import { num } from './numbers'
import { toDateKey } from './dates'

// A stable sentinel for "warehouse" so holder_id null never leaks as a
// raw null into downstream logic (the distro null=null decrement bug).
export const WAREHOUSE = Object.freeze({ id: null, name: 'Warehouse', isWarehouse: true })

// ---- NORMALISERS: raw DB row -> clean typed shape (one definition each) ----

function normStockItem(r) {
  return {
    id: r.id,
    product: r.product ?? '',
    type: r.type ?? null,
    brand: r.brand ?? null,
    boxType: r.box_type ?? null,
    archived: !!r.archived,
    // VAT treatment: standard (VAT-inclusive) | second_hand (VAT-free).
    // Default to standard unless flagged — matches the money-engine spec.
    vatTreatment: r.vat_treatment === 'second_hand' ? 'second_hand' : 'standard',
    breakPrice: r.break_price == null ? null : num(r.break_price),
  }
}

function normWave(r) {
  return {
    id: r.id,
    stockItemId: r.stock_item_id,
    waveNo: num(r.wave_no),
    qty: num(r.qty),                    // full precision
    unitCost: num(r.unit_cost),         // full precision
    totalCost: num(r.total_cost),       // full precision
    revenueRecovered: num(r.revenue_recovered),
    paidOff: !!r.paid_off,
    createdAt: r.created_at ?? null,
  }
}

function normHolding(r) {
  return {
    id: r.id,
    stockItemId: r.stock_item_id,
    // #4: null holder == warehouse, represented consistently.
    holderId: r.holder_id ?? null,
    isWarehouse: r.holder_id == null,
    waveNo: num(r.wave_no),
    qty: num(r.qty),
    unitCost: num(r.unit_cost),
  }
}

function normStream(r) {
  return {
    id: r.id,
    streamerId: r.streamer_id ?? null,
    streamerName: r.streamer_name ?? '',
    title: r.title ?? '',
    platform: r.platform ?? null,
    channel: r.channel ?? null,
    streamDate: toDateKey(r.stream_date),   // canonical local key, never UTC
    totalSales: num(r.total_sales ?? r.revenue),  // gross — full precision
    // net is streamer-entered and is the source of truth (money-engine spec).
    net: r.net == null ? null : num(r.net),
    shipping: num(r.shipping),
    fees: num(r.fees),
    profit: num(r.profit),
    createdAt: r.created_at ?? null,
  }
}

function normStreamLine(r) {
  return {
    id: r.id,
    streamId: r.stream_id,
    stockItemId: r.stock_item_id ?? null,
    product: r.product ?? '',
    qty: num(r.qty),
    unitCost: num(r.unit_cost),
    lineTotal: num(r.line_total),
    brokered: !!r.brokered,
  }
}

function normDistro(r) {
  return {
    id: r.id,
    stockItemId: r.stock_item_id,
    product: r.product ?? '',
    waveNo: num(r.wave_no),
    qty: num(r.qty),
    revenue: num(r.revenue),
    cost: num(r.cost),
    profit: num(r.profit),
    soldOn: toDateKey(r.sold_on),
    note: r.note ?? null,
    createdAt: r.created_at ?? null,
  }
}

function normProfile(r) {
  return {
    id: r.id,
    name: r.name ?? '',
    role: r.role ?? null,
    department: r.department ?? null,
    colour: r.colour ?? null,
  }
}

// ---- THE SHARED SOURCE ----
// loadSource() fetches everything once and returns the single shared object.
// Screens read from this object; they never call supabase themselves.

export async function loadSource() {
  const [items, waves, holdings, streams, lines, distro, profiles] = await Promise.all([
    supabase.from('stock_items').select('*'),
    supabase.from('stock_waves').select('*'),
    supabase.from('stock_holdings').select('*'),
    supabase.from('v_streams_scoped').select('*'),
    supabase.from('stream_lines').select('*'),
    supabase.from('distro_sales').select('*'),
    supabase.from('profiles').select('*'),
  ])

  const firstErr = [items, waves, holdings, streams, lines, distro, profiles]
    .map((r) => r.error).find(Boolean)
  if (firstErr) throw firstErr

  return {
    loadedAt: new Date(),
    stockItems: (items.data || []).map(normStockItem),
    waves: (waves.data || []).map(normWave),
    holdings: (holdings.data || []).map(normHolding),
    streams: (streams.data || []).map(normStream),
    streamLines: (lines.data || []).map(normStreamLine),
    distroSales: (distro.data || []).map(normDistro),
    profiles: (profiles.data || []).map(normProfile),
  }
}
