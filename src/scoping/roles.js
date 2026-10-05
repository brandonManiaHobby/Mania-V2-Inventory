// ============================================================
// SCOPING — ROLES (hardening #8: roles defined ONCE)
// Every screen and action checks THIS, never its own role logic.
// Mirrors V1's 5 roles exactly (parity), centralised.
// ============================================================

// DB role code -> our canonical role.
export const ROLE = Object.freeze({
  STREAMER: 'streamer',   // db: breaker
  LEAD: 'lead',           // db: channel_lead
  WAREHOUSE: 'warehouse', // db: warehouse
  MANAGER: 'manager',     // db: manager
  ADMIN: 'admin',         // db: admin
})

// Normalise a profile's raw db role into our canonical role.
export function roleOf(profile) {
  switch (profile?.role) {
    case 'breaker': return ROLE.STREAMER
    case 'channel_lead': return ROLE.LEAD
    case 'warehouse': return ROLE.WAREHOUSE
    case 'manager': return ROLE.MANAGER
    case 'admin': return ROLE.ADMIN
    default: return ROLE.STREAMER // safest default: least privilege
  }
}

// Capability flags — the ONE place these are defined. Screens read these,
// never re-derive from role strings (that scattering is what drifted in V1).
export function capabilities(profile) {
  const r = roleOf(profile)
  const isAdmin = r === ROLE.ADMIN
  const isManager = r === ROLE.MANAGER
  const isLead = r === ROLE.LEAD
  const isWarehouse = r === ROLE.WAREHOUSE
  const isStreamer = r === ROLE.STREAMER

  // Business-wide analytics flag (V1's isManager = admin OR manager OR lead).
  const seesAnalytics = isAdmin || isManager || isLead
  // Business-WIDE (unscoped) vs department-scoped analytics.
  const seesAllDepartments = isAdmin || isManager   // NOT lead — lead is scoped
  const seesInventory = isAdmin || isManager || isLead || isWarehouse
  const canMoveStock = isAdmin || isManager || isWarehouse
  const canRecordStream = isStreamer || isLead || isAdmin || isManager
  const hasOwnShelf = isStreamer || isLead

  return {
    role: r, isAdmin, isManager, isLead, isWarehouse, isStreamer,
    seesAnalytics, seesAllDepartments, seesInventory, canMoveStock,
    canRecordStream, hasOwnShelf,
    department: profile?.department ?? null,
    userId: profile?.id ?? null,
  }
}
