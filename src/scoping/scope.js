// ============================================================
// SCOPING — THE CENTRAL FILTER (hardening #1)
// V1 failure: leads leaked cross-department data because scoping was
// enforced per-screen (and screens forgot). HERE it's enforced ONCE:
// every screen gets its data through scopeSource(), which returns ONLY
// what the current user may see. A screen physically cannot receive
// another department's / another streamer's data — it's filtered at the
// source boundary, not hidden in the UI.
// ============================================================
import { capabilities, ROLE } from './roles.js'

// Given the full shared source + the current profile, return a SCOPED
// view of the source — the same shape, but filtered to what this user
// is allowed to see. Screens read THIS, never the raw source.
export function scopeSource(source, profile) {
  const cap = capabilities(profile)
  if (!source) return { ...emptyView(), cap }

  // Admin / Manager: full business-wide visibility. No filtering.
  if (cap.seesAllDepartments) {
    return { ...source, cap }
  }

  // Lead: department-scoped. Only their department's streams/people.
  if (cap.isLead) {
    const dept = cap.department
    const streams = source.streams.filter((s) => streamDept(s, source) === dept)
    const streamIds = new Set(streams.map((s) => s.id))
    const streamLines = source.streamLines.filter((l) => streamIds.has(l.streamId))
    const profiles = source.profiles.filter((p) => p.department === dept)
    // Lead sees inventory (not department-dimensioned) but NOT cross-dept streams.
    return {
      ...source,
      streams, streamLines, profiles,
      cap,
    }
  }

  // Warehouse: inventory + stock only; no stream analytics data.
  if (cap.isWarehouse) {
    return {
      ...source,
      streams: [], streamLines: [],   // no streams visibility
      cap,
    }
  }

  // Streamer: ONLY their own streams + their own shelf. Nothing else.
  const uid = cap.userId
  const streams = source.streams.filter((s) => s.streamerId === uid)
  const streamIds = new Set(streams.map((s) => s.id))
  const streamLines = source.streamLines.filter((l) => streamIds.has(l.streamId))
  const holdings = source.holdings.filter((h) => h.holderId === uid)
  return {
    ...source,
    streams, streamLines, holdings,
    // a streamer doesn't see others' profiles beyond their own
    profiles: source.profiles.filter((p) => p.id === uid),
    cap,
  }
}

// A stream's department = its streamer's department (from profiles).
function streamDept(stream, source) {
  const p = source.profiles.find((x) => x.id === stream.streamerId)
  return p?.department ?? null
}

function emptyView() {
  return {
    stockItems: [], waves: [], holdings: [], streams: [],
    streamLines: [], distroSales: [], profiles: [],
  }
}

export { capabilities, ROLE }
