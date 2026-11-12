// ============================================================
// TOPPS TERMINOLOGY MAPPING
// Topps (and the Cardsmiths calendar we pull from) use US terms:
//   "Football" = American football (NFL / gridiron)
//   "Soccer"   = football as the rest of the world knows it
// Everything else passes through unchanged. ONE place, so the whole
// app agrees on what a sport label means.
// ============================================================

// Raw Topps label -> how Mania shows it.
const DISPLAY = {
  football: 'American Football',
  soccer: 'Football',
}

export function displaySport(raw) {
  if (!raw) return '—'
  return DISPLAY[String(raw).trim().toLowerCase()] || raw
}

// A stable colour per sport for the chips (kept clear of the dept palette).
const SPORT_COLOUR = {
  'American Football': '#8b5cf6', // violet
  'Football': '#16a34a',          // green (association football)
  'Baseball': '#0ea5e9',          // sky
  'Basketball': '#f97316',        // orange
  'Tennis': '#eab308',            // yellow
  'Formula 1': '#ef4444',         // red
  'Cricket': '#14b8a6',           // teal
  'Wrestling': '#db2777',         // magenta
  'MMA': '#9333ea',               // purple
  'Non-Sport': '#64748b',         // slate
}

export function sportColour(raw) {
  return SPORT_COLOUR[displaySport(raw)] || '#64748b'
}
