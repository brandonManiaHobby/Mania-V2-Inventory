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
  const lines = (input.lines || []).filter((l) => l.stockItemId && Number(l.qty) > 0)
  if (lines.length === 0) throw new Error('Add at least one product line')
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
