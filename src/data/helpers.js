// ============================================================
// SHARED HELPERS — one home for logic/cosmetics used across screens.
// Eliminates the duplicated inline copies (vatOf, hoursOf, short, LABEL,
// month formatting). Logic helpers here prevent drift; cosmetic ones keep
// screens consistent and lean.
// ============================================================
import { parseLocalDate } from './dates'

// VAT treatment of a product, from the shared source. ONE definition.
export function vatTreatmentOf(source, stockItemId) {
  return source.stockItems.find((x) => x.id === stockItemId)?.vatTreatment === 'second_hand'
    ? 'second_hand' : 'standard'
}

// Stream duration in hours from start/end text. ONE definition.
export function hoursOf(s) {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart)
  return d > 0 ? d : 0
}

// Trim verbose product prefixes for display. ONE definition.
export function shortName(p) {
  return String(p || '').replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '')
}

// Money-view labels — one map.
export const MONEY_LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }

// Month key 'YYYY-MM' -> "Aug 2026"; with short:true -> "Aug 26".
export function monthLabel(ym, opts = {}) {
  const d = parseLocalDate(ym + '-01')
  if (!d) return ym
  return d.toLocaleDateString('en-GB', opts.short ? { month: 'short', year: '2-digit' } : { month: 'long', year: 'numeric' })
}
