// ============================================================
// DATA LAYER — DATES (drift guarantee #1)
// One date module. Local-only. A date NEVER touches toISOString().
// This is the fix for the Operations BST day-shift bug: toISOString()
// converts to UTC, so local midnight on the 1st became 23:00 on the
// previous day in UTC — shifting every date back one. Everything here
// reads and writes dates from LOCAL parts only.
// ============================================================

// Parse a 'YYYY-MM-DD' string into a LOCAL Date (midday, so no tz edge
// can ever push it across a day boundary). Use for any date that came
// from the DB as a plain date string.
export function parseLocalDate(ymd) {
  if (!ymd) return null
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12, 0, 0, 0) // local midday — safe anchor
}

// Format a Date (or YYYY-MM-DD) to the canonical 'YYYY-MM-DD' key, from
// LOCAL parts. This is the ONLY way a date becomes a string key. Never
// toISOString() (which would UTC-shift).
export function toDateKey(dateOrYmd) {
  if (!dateOrYmd) return null
  const d = dateOrYmd instanceof Date ? dateOrYmd : parseLocalDate(dateOrYmd)
  if (!d || isNaN(d)) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Today's date key, local.
export function todayKey() {
  return toDateKey(new Date())
}

// Human display (e.g. "Thu 5 Oct 2026"). Presentation only — never used as a key.
export function displayDate(dateOrYmd, opts) {
  const d = dateOrYmd instanceof Date ? dateOrYmd : parseLocalDate(dateOrYmd)
  if (!d || isNaN(d)) return '—'
  return d.toLocaleDateString('en-GB',
    opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// The month key 'YYYY-MM' for grouping, from LOCAL parts.
export function monthKey(dateOrYmd) {
  const k = toDateKey(dateOrYmd)
  return k ? k.slice(0, 7) : null
}

// Whole-day difference between two date keys (local, no tz drift).
export function daysBetween(fromYmd, toYmd) {
  const a = parseLocalDate(fromYmd), b = parseLocalDate(toYmd)
  if (!a || !b) return null
  return Math.round((b - a) / 86400000)
}

// Day-of-week index (0=Sun..6=Sat) from LOCAL parts — for the Operations
// rota audit (Wed/Sun off-days) which the BST bug previously broke.
export function dayOfWeek(ymd) {
  const d = parseLocalDate(ymd)
  return d ? d.getDay() : null
}
