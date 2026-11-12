// ============================================================
// WAVE SEGMENTS — purely-visual grouping of a product's waves.
//
// A product stays ONE product with ONE waterfall engine. This only changes
// how its waves are DISPLAYED: waves can be shown in two labelled bands so a
// later run of waves reads as a distinct line without any data migration.
// No DB change, fully reversible — remove the entry and the product renders
// as a single flat wave list again. (Mirrors V1's src/waveSegments.js.)
//
// To divide a product, add an entry: `match` (name regex), `splitAt` (the
// first waveNo of the second band), and a label for each band.
// ============================================================
export const WAVE_SEGMENTS = [
  {
    match: /30th Anniversary English Packs/i,
    splitAt: 3, // waves 1-2 = first band; waves 3+ = second band
    before: 'Pokémon TCG 30th Anniversary English Packs',
    after: '30th Anniversary — Scale & Velocity',
  },
]

// The segment config for a product name, or null if it isn't divided.
export function segmentConfigFor(productName) {
  const name = String(productName || '')
  return WAVE_SEGMENTS.find((s) => s.match.test(name)) || null
}

// Split wave rows into { cfg, before, after } by splitAt (waveNo-based).
// Returns null when there's no config, or when one side is empty, so the
// divide only appears once waves exist on both sides.
export function splitWaves(productName, waves) {
  const cfg = segmentConfigFor(productName)
  if (!cfg || !Array.isArray(waves)) return null
  const before = waves.filter((w) => Number(w.waveNo) < cfg.splitAt)
  const after = waves.filter((w) => Number(w.waveNo) >= cfg.splitAt)
  if (!before.length || !after.length) return null
  return { cfg, before, after }
}
