// Shared option lists — ported from V1 so Record a stream behaves identically
// (platform → channel cascade, channel → department mapping, stream types).

export const PLATFORMS = ['eBay Live', 'Whatnot', 'TikTok Shop Live', 'Fanatics']

export const CHANNELS = [
  '101 Card Breaks', '101 Card Breaks (Fanatics)', '101 Prime', '101 USA',
  'GCMania', 'JakCollects', 'Mania Collects', 'Mania Prime', 'Mania Sports',
  'ManiaPop', 'ManiaUSA',
]

export const DEPARTMENTS = ['Mania/101', 'Mania TCG', 'GC Mania']

export const STREAM_TYPES = ['Break', 'Case Break', 'Energy Break', 'Rip n Ship', 'Singles', 'Mixed', 'Other']
export const MIXED_TYPE_OPTIONS = ['Break', 'Case Break', 'Energy Break', 'Rip n Ship', 'Singles', 'Other']

// Low-stock thresholds (units). Warnings only — nobody is blocked from zero.
export const LOW_STOCK_RED = 4
export const LOW_STOCK_AMBER = 8
export const stockLevel = (qty) => {
  const n = Number(qty || 0)
  if (n <= 0) return 'out'
  if (n <= LOW_STOCK_RED) return 'critical'
  if (n <= LOW_STOCK_AMBER) return 'low'
  return 'ok'
}

// A stream belongs to the CHANNEL's department (not the streamer's).
export const CHANNEL_DEPARTMENT = {
  '101 Card Breaks': 'Mania/101', '101 Prime': 'Mania/101', '101 USA': 'Mania/101',
  'Mania Sports': 'Mania/101', 'Mania Prime': 'Mania/101', '101 Card Breaks (Fanatics)': 'Mania/101',
  JakCollects: 'Mania/101', 'Mania Collects': 'Mania TCG', GCMania: 'GC Mania',
  ManiaPop: 'GC Mania', ManiaUSA: 'Mania/101',
}

// Which channels run on which platform — selecting a platform narrows channels.
export const PLATFORM_CHANNELS = {
  'eBay Live': ['Mania Sports', 'Mania Prime', 'Mania Collects', 'ManiaPop', 'ManiaUSA'],
  Whatnot: ['101 Card Breaks', '101 Prime', '101 USA', 'GCMania', 'Mania Collects'],
  'TikTok Shop Live': ['JakCollects'],
  Fanatics: ['101 Card Breaks (Fanatics)'],
}

export const DEPARTMENT_HOME = {
  'Mania/101': { platform: 'Whatnot', channel: '101 Card Breaks' },
  'Mania TCG': { platform: 'eBay Live', channel: 'Mania Collects' },
  'GC Mania': { platform: 'Whatnot', channel: 'GCMania' },
}
