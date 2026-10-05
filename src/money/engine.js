// ============================================================
// MONEY ENGINE — computeMoney() (the source of truth)
// The ONE function every screen calls. Computed, never stored.
// Implements the 9-layer ladder from the money-engine spec.
//
// Hardening references:
//  - Full precision throughout; NO rounding in here (data-layer #2).
//    Callers round only at the display edge via numbers.js formatters.
//  - VAT is INCLUSIVE for standard goods: the VAT is the "VAT fraction"
//    of the price (price ÷ 1.2 = ex-VAT; VAT = price − ex-VAT), NOT
//    price × 0.2. Using ×0.2 would overstate VAT and poison every margin.
//  - Second-hand goods: VAT-free (no VAT in or out).
//  - Net (streamer-entered) is the SOURCE OF TRUTH; fees = gross − net.
//  - Waterfall basis (Option C) lives here too: net ex-VAT vs cost ex-VAT.
// ============================================================

const STANDARD_VAT_RATE = 0.20

// Strip inclusive VAT: given a VAT-inclusive amount, return its VAT portion.
// £110 inc-VAT @20%  ->  ex-VAT 91.667, VAT 18.333 (the "VAT fraction").
function inclusiveVatPortion(amountIncVat, rate = STANDARD_VAT_RATE) {
  const exVat = amountIncVat / (1 + rate)
  return amountIncVat - exVat
}

// ------------------------------------------------------------
// computeMoney(input) -> the full 9-layer ladder.
//
// input = {
//   gross,            // total sticker/sale price (required)
//   net,              // streamer-entered net after platform fees.
//                     //   null/undefined  -> treat as no fees (net = gross)
//   costPaid,         // what the stock cost (what left the bank)
//   vatTreatment,     // 'standard' (VAT-inclusive) | 'second_hand' (VAT-free)
//   units,            // optional, for per-unit callers (not used in totals)
// }
//
// Returns all layers at FULL PRECISION. No rounding here.
// ------------------------------------------------------------
export function computeMoney(input = {}) {
  const gross = Number(input.gross) || 0
  // Net is source of truth. If not provided, no platform fees known -> net = gross.
  const net = (input.net === null || input.net === undefined)
    ? gross
    : (Number(input.net) || 0)
  const costPaid = Number(input.costPaid) || 0
  const secondHand = input.vatTreatment === 'second_hand'

  // 1. Gross
  // 2. Fees = gross − net
  const fees = gross - net

  // 3. Net (already have it)

  // 4. VAT portion — standard: inclusive VAT fraction of NET; second-hand: 0
  const vatPortion = secondHand ? 0 : inclusiveVatPortion(net)

  // 5. Net ex-VAT = net − vatPortion  (for second-hand, == net)
  const netExVat = net - vatPortion

  // 6. Cost — two columns.
  //    costPaid: what left the bank (as entered).
  //    costInclVat: the cost "including VAT" view. For standard goods the
  //    paid cost already includes VAT (VAT-inclusive world), so costInclVat
  //    == costPaid, and cost EX-VAT is costPaid ÷ 1.2. For second-hand there
  //    is no VAT, so ex-VAT == paid.
  const costInclVat = costPaid
  const costExVat = secondHand ? costPaid : costPaid / (1 + STANDARD_VAT_RATE)

  // 7. Gross margin = net ex-VAT − cost ex-VAT  (like-for-like, both ex-VAT)
  const grossMargin = netExVat - costExVat

  // 8. VAT owed (output VAT) = the VAT portion of the sale (standard only)
  const vatOwed = vatPortion

  // 9. True profit = what you keep.
  //    = net ex-VAT − cost ex-VAT  (fees already removed via net; VAT already
  //    removed via ex-VAT on both sides). For second-hand this is net − costPaid.
  const trueProfit = netExVat - costExVat

  // Margins as ratios (full precision; caller formats as %).
  const grossMarginPct = netExVat !== 0 ? grossMargin / netExVat : 0
  const netMarginPct = gross !== 0 ? trueProfit / gross : 0

  return {
    gross,              // 1
    fees,               // 2
    net,                // 3
    vatPortion,         // 4
    netExVat,           // 5
    costPaid,           // 6a
    costInclVat,        // 6b
    costExVat,          // (derived cost basis used for margin/recovery)
    grossMargin,        // 7
    vatOwed,            // 8
    trueProfit,         // 9
    grossMarginPct,
    netMarginPct,
    // Waterfall basis (Option C): what this sale contributes to recovering
    // a wave's cost, and the cost basis it recovers against.
    recoveryContribution: netExVat,   // sale side, ex-VAT
    recoveryCostBasis: costExVat,     // cost side, ex-VAT
    secondHand,
  }
}

// Sum many computeMoney results into one ladder (for a stream / period /
// product rollup). Re-sums raw layers; margins recomputed from the totals
// so they stay correct (never average percentages).
export function sumMoney(ladders = []) {
  const t = {
    gross: 0, fees: 0, net: 0, vatPortion: 0, netExVat: 0,
    costPaid: 0, costInclVat: 0, costExVat: 0, grossMargin: 0,
    vatOwed: 0, trueProfit: 0, recoveryContribution: 0, recoveryCostBasis: 0,
  }
  for (const l of ladders) {
    for (const k of Object.keys(t)) t[k] += Number(l[k]) || 0
  }
  t.grossMarginPct = t.netExVat !== 0 ? t.grossMargin / t.netExVat : 0
  t.netMarginPct = t.gross !== 0 ? t.trueProfit / t.gross : 0
  return t
}
