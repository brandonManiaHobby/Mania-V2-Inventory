// ============================================================
// PROJECTION ENGINE — one reusable model that learns from every completed
// period (months OR weeks) and projects the in-progress one. It gets more
// accurate as data flows: early in a period it leans on the historical trend,
// and as the period fills it leans on the actual run-rate. Used by the Dashboard
// (revenue by month) and by Streamer analytics (a streamer's own months).
// Pure functions, no deps — safe to unit-test headless.
// ============================================================

// Fraction of the current month that has elapsed, by day (0..1). Never returns
// 0 (a brand-new month still has one day's worth of signal).
export function monthFractionElapsed(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const frac = (now.getDate() - 1 + (now.getHours() + now.getMinutes() / 60) / 24) / daysInMonth
  return Math.min(1, Math.max(1 / daysInMonth, frac))
}

// Fraction of the current ISO-ish week elapsed (Mon→Sun), by day (0..1).
export function weekFractionElapsed(now = new Date()) {
  const dow = (now.getDay() + 6) % 7            // 0 = Monday
  const frac = (dow + (now.getHours() + now.getMinutes() / 60) / 24) / 7
  return Math.min(1, Math.max(1 / 7, frac))
}

// Least-squares extrapolation: fit y = a + b·x over x = 0..n-1 and return the
// value at x = n (the next period). Falls back to the mean when flat/!enough.
function linNext(ys) {
  const n = ys.length
  if (n === 0) return 0
  if (n === 1) return ys[0]
  const xs = ys.map((_, i) => i)
  const sx = xs.reduce((a, b) => a + b, 0)
  const sy = ys.reduce((a, b) => a + b, 0)
  const sxx = xs.reduce((a, x) => a + x * x, 0)
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0)
  const d = n * sxx - sx * sx
  if (d === 0) return sy / n
  const b = (n * sxy - sx * sy) / d
  const a = (sy - b * sx) / n
  return Math.max(0, a + b * n)
}

// Core projection. `completed` = completed-period totals oldest→newest;
// `actual` = what's banked so far this period; `frac` = fraction elapsed (0..1).
// Blends the run-rate (actual ÷ frac) with the historical trend, weighting the
// run-rate more heavily as the period fills. Never projects below what's banked.
export function projectPeriod(completed = [], actual = 0, frac = 1) {
  const f = Math.min(1, Math.max(0.0001, Number(frac) || 0))
  const banked = Number(actual) || 0
  const runRate = banked / f
  const trend = completed.length ? linNext(completed) : runRate
  const w = f                                   // 0 → trust history, 1 → trust actuals
  const blended = w * runRate + (1 - w) * trend
  const projected = Math.max(banked, blended)
  const remainder = Math.max(0, projected - banked)
  // Confidence band: wider early in the period and with less history.
  const spread = projected * (0.25 * (1 - f) + 0.05) / Math.sqrt(completed.length + 1)
  return {
    projected,
    remainder,
    runRate,
    trend,
    frac: f,
    low: Math.max(banked, projected - spread),
    high: projected + spread,
    basis: completed.length >= 3 ? 'trend + run-rate' : completed.length ? 'limited history' : 'run-rate only',
  }
}

// Convenience: sum a list into month buckets. `dateOf` → 'YYYY-MM-DD',
// `valueOf` → number. Returns { 'YYYY-MM': total }.
export function monthBuckets(items, dateOf, valueOf) {
  const bm = {}
  for (const it of items) {
    const d = dateOf(it)
    if (!d) continue
    const k = String(d).slice(0, 7)
    bm[k] = (bm[k] || 0) + (Number(valueOf(it)) || 0)
  }
  return bm
}

// Build the display series for a "last N months + current, projected" chart.
// Returns { keys, values, curIndex, mtd, projection } where projection is the
// full projectPeriod() result for the current month.
export function monthlyProjection(items, dateOf, valueOf, monthsBack = 6, now = new Date()) {
  const bm = monthBuckets(items, dateOf, valueOf)
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const keys = []
  for (let i = monthsBack; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const completed = keys.map((k) => bm[k] || 0)
  const mtd = bm[curKey] || 0
  const projection = projectPeriod(completed, mtd, monthFractionElapsed(now))
  const allKeys = [...keys, curKey]
  const values = allKeys.map((k) => bm[k] || 0)
  return { keys: allKeys, values, curIndex: allKeys.length - 1, curKey, mtd, projection }
}
