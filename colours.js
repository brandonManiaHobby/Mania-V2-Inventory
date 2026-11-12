// Single source of truth for chart colours, so a colour always means the same
// thing wherever it appears (Dashboard, Performance, Past Streams).

export const DEPT_COLOUR = {
  'Mania/101': '#ff6a13',  // Mania orange — the merged 101 + Mania department
  'Mania TCG': '#1e40af',  // deep blue
  'GC Mania': '#c2410c',   // burnt orange
}

// Channels take their department's colour, so a "By channel" chart reads as
// department blocks at a glance. JakCollects is the one deliberate exception.
// Channels are coloured by FAMILY, then by a distinct shade WITHIN the family,
// so "split by channel" shows five different bars — not five identical oranges —
// while still reading at a glance as gold=101, orange=Mania, navy=Collects,
// burnt=GC.
//
//   101-*        GOLD family
//   Mania-*      ORANGE family        (except Mania Collects, which is TCG)
//   Mania Collects  NAVY              (explicit exception — it's Mania TCG)
//   GCMania / ManiaPop  BURNT ORANGE  (GC Mania — ManiaPop's money is GC's)
//   JakCollects  its own tint (Mania/101, but named for neither 101 nor Mania)
export const CHANNEL_COLOUR = {
  // 101 — golds
  '101 Card Breaks': '#eab308',   // gold
  '101 Prime':       '#ca8a04',   // deep gold
  '101 USA':         '#a16207',   // bronze

  // Mania — oranges
  'Mania Sports':    '#ff6a13',   // Mania orange
  'Mania Prime':     '#fb923c',   // light orange
  '101 Card Breaks (Fanatics)': '#ea580c',   // deep orange (Fanatics)
  'ManiaUSA':        '#f97316',   // orange (Mania family, USA)

  // Mania TCG — navy (the exception you called out)
  'Mania Collects':  '#1e40af',

  // GC Mania — burnt oranges
  'GCMania':         '#c2410c',   // burnt orange
  'ManiaPop':        '#9a3412',   // dark burnt orange

  // Mania/101, but its own identity
  'JakCollects':     '#0d9488',   // teal
}

// Stream types. Kept clear of the department palette (golds/oranges) so a
// "By stream type" chart never reads like a department chart.
export const STREAM_TYPE_COLOUR = {
  'Break':       '#38bdf8',   // sky blue
  'Case Break':  '#1e40af',   // deep blue
  'Energy Break':'#facc15',   // bright yellow
  'Rip n Ship':  '#f97316',   // bright orange
  'Singles':     '#ef4444',   // red
  'Mixed':       '#ec4899',   // pink
  'Other':       '#e2d6bd',   // sand
}

export const PLATFORM_COLOUR = {
  'eBay Live': '#88b719',        // eBay green
  'Whatnot': '#fbf859',          // Whatnot yellow
  'TikTok Shop Live': '#fe2858', // TikTok pink
  'Fanatics': '#e53d2e',         // Fanatics red
}

// The graphs are streamer-focused, so only live-selling platforms appear.
export const STREAM_PLATFORMS = ['eBay Live', 'Whatnot', 'TikTok Shop Live', 'Fanatics']

export const OTHER_COLOUR = '#8899aa'
export const OTHER_LABEL = 'Other'

// Fallback palette for dimensions with no brand colours (channels, streamers,
// stream types). Deliberately spread across hues and lightness so neighbouring
// series stay distinguishable, including for red/green colour blindness.
const PALETTE = [
  '#2f6fed', // blue
  '#12a594', // teal
  '#9333ea', // purple
  '#e0a300', // gold
  '#ff6a13', // orange
  '#0f766e', // deep teal
  '#db2777', // magenta
  '#475569', // slate
]

// Stable: the same name always gets the same colour, in any chart, on any screen.
function hashed(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// The dimensions a chart can be split by.
export const SPLITS = [
  { id: 'department', label: 'Department', field: (s) => s.department || 'Unassigned' },
  { id: 'platform', label: 'Platform', field: (s) => s.platform || 'Unknown' },
  { id: 'channel', label: 'Channel', field: (s) => s.channel || 'Unknown' },
  { id: 'stream_type', label: 'Stream type', field: (s) => s.stream_type || 'Unknown' },
  { id: 'streamer', label: 'Streamer', field: (s) => s.streamer_name || 'Unknown' },
]

export function colourFor(split, name) {
  if (name === OTHER_LABEL) return OTHER_COLOUR
  if (split === 'department') return DEPT_COLOUR[name] || OTHER_COLOUR
  if (split === 'platform') return PLATFORM_COLOUR[name] || OTHER_COLOUR
  // Channels inherit their department's colour.
  if (split === 'channel') return CHANNEL_COLOUR[name] || OTHER_COLOUR
  if (split === 'stream_type') return STREAM_TYPE_COLOUR[name] || OTHER_COLOUR
  return hashed(name)
}

// Stacked bars stop being readable past ~7 series. Keep the biggest and
// roll the tail into "Other" rather than producing rainbow soup.
export const MAX_SERIES = 6

export function topSeries(totals, max = MAX_SERIES) {
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
  const keep = sorted.slice(0, max).map(([k]) => k)
  const hasOther = sorted.length > max
  return { keep, hasOther }
}
