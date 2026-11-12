// ============================================================
// DATA LAYER — NUMBERS / PRECISION (drift guarantee #2)
// Raw values carried at FULL PRECISION. Never pre-rounded.
// Rounding happens ONCE, at the final display edge, via the formatters
// below. The data layer never hands out a pre-rounded number.
// This fixes: the £1.28->£1 per-box bug and the 24-scattered-formatters
// drift. Also the VAT-precision discipline (÷1.2 yields long decimals —
// we keep them full-precision in calcs, round only here at the edge).
// ============================================================

// Normalise anything from the DB to a real number at full precision.
// null/undefined/'' -> 0 (known default — guarantee #4 for numbers).
export function num(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return isNaN(n) ? 0 : n
}

// ---- DISPLAY-EDGE FORMATTERS (the ONLY place rounding happens) ----

// Money, 2dp, GBP. Use for per-unit / precise money at the display edge.
export function gbp(v) {
  return '£' + num(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Money, whole pounds. Use for big headline figures where pennies are noise.
export function gbp0(v) {
  return '£' + Math.round(num(v)).toLocaleString('en-GB')
}

// Percent, 1dp. Takes a ratio (0.42 -> "42.0%").
export function pct(ratio) {
  return (num(ratio) * 100).toFixed(1) + '%'
}

// Plain integer with thousands separators.
export function int(v) {
  return Math.round(num(v)).toLocaleString('en-GB')
}

// Round to 2dp ONLY when a value must be persisted to the DB as money
// (e.g. a total_cost column). This is the single sanctioned rounding for
// WRITES — reads/calcs stay full precision.
export function money2(v) {
  return Math.round((num(v) + Number.EPSILON) * 100) / 100
}
