import { useState } from 'react'
import Spend from './Spend'
import VatReport from './VatReport'

// ============================================================
// FINANCE (Stage 5 — merged Spend + VAT report; admin/manager only)
// Two tabs over the two period-based money reports. Gated upstream by
// seesAllDepartments (admin/manager, NOT lead). Reuses the existing Spend
// and VatReport screens unchanged — pure composition, no logic duplicated.
// ============================================================
const TABS = [{ k: 'spend', label: 'Spend' }, { k: 'vat', label: 'VAT report' }]

export default function Finance({ scoped }) {
  const [tab, setTab] = useState('spend')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Finance</h2>
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999 }}>
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '6px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13,
                fontWeight: tab === t.k ? 700 : 400, background: tab === t.k ? '#fff' : 'transparent' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {tab === 'spend' ? <Spend scoped={scoped} embedded /> : <VatReport scoped={scoped} embedded />}
      </div>
    </div>
  )
}
