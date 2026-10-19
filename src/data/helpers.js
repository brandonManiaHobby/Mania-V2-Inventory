// ============================================================
// SHARED HELPERS — one home for logic/cosmetics used across screens.
// Eliminates the duplicated inline copies (vatOf, hoursOf, short, LABEL,
// month formatting). Logic helpers here prevent drift; cosmetic ones keep
// screens consistent and lean.
// ============================================================
import { parseLocalDate } from './dates.js'

// VAT treatment of a product, from the shared source. ONE definition.
export function vatTreatmentOf(source, stockItemId) {
  return source.stockItems.find((x) => x.id === stockItemId)?.vatTreatment === 'second_hand'
    ? 'second_hand' : 'standard'
}

// Stream duration in hours from start/end text. ONE definition.
export function hoursOf(s) {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  let d = p(s.streamEnd) - p(s.streamStart)
  // Overnight streams cross midnight (e.g. 20:00 -> 00:04): end reads lower than
  // start, so add a day. Without this every past-midnight stream logged 0 hours.
  if (d < 0) d += 24
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

// Is this product a consumable (sleeves, top loaders, team bags, labels,
// postage/packaging)? Keyed on the product's type so warehouse stock and
// streamer holdings can be tracked separately from breakable stock.
const CONSUMABLE_RX = /consumable|sleeve|top ?loader|team ?bag|label|postage|mailer|packaging|penny ?sleeve/i
export function isConsumable(item) {
  return CONSUMABLE_RX.test(String(item?.type || ''))
}

// Canonical platform label — collapses case/whitespace variants so the same
// platform (e.g. "eBay Live" / "Ebay live " / "EBAY LIVE") groups as ONE
// column in Insights/Export instead of several. Unknown platforms trim through.
export function canonPlatform(v) {
  const t = String(v || '').trim().replace(/\s+/g, ' ')
  if (!t) return '—'
  const low = t.toLowerCase()
  if (low === 'ebay live' || low === 'ebay') return 'eBay Live'
  if (low === 'whatnot') return 'Whatnot'
  if (low.includes('tiktok')) return 'TikTok Shop'
  if (low === 'fanatics') return 'Fanatics'
  return t
}
