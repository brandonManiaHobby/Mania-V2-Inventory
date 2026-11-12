// ============================================================
// SHARED COMPONENT — MoneyToggle (hardening #10: one toggle everywhere)
// The global money-view switch. Picks which ladder layer screens show.
// Built once; Dashboard, Streamers, Products all use this exact control.
// ============================================================
export const MONEY_VIEWS = [
  { key: 'gross',    label: 'Gross' },
  { key: 'net',      label: 'Net' },
  { key: 'netExVat', label: 'Net ex-VAT' },
  { key: 'trueProfit', label: 'Profit' },
]

// Map a view key -> the ladder field + matching margin field.
export const VIEW_FIELD = {
  gross: { value: 'gross', margin: null },
  net: { value: 'net', margin: null },
  netExVat: { value: 'netExVat', margin: 'grossMarginPct' },
  trueProfit: { value: 'trueProfit', margin: 'netMarginPct' },
}

export default function MoneyToggle({ view, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999 }}>
      {MONEY_VIEWS.map((v) => (
        <button key={v.key} onClick={() => onChange(v.key)}
          style={{ padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit',
            fontSize: 13, fontWeight: view === v.key ? 700 : 400,
            background: view === v.key ? '#fff' : 'transparent',
            boxShadow: view === v.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
          {v.label}
        </button>
      ))}
    </div>
  )
}
