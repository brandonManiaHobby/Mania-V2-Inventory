import { useState } from 'react'
import { useSource } from '../data'
import { ShowEditorBody } from './CardShowShared'

// RECORD SHOW — log a new off-site show, then add each department's time,
// sales and costs. Others can add their side later from Previous shows.
export default function RecordShow({ scoped }) {
  const { refresh } = useSource()
  const [k, setK] = useState(0)        // reset key for "log another"
  const [savedId, setSavedId] = useState(null)

  return (
    <div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: 18 }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
          Create the show, then add each department’s time, sales and costs. Other attendees can add their part later from <strong>Previous shows</strong>.
        </div>
        <ShowEditorBody key={k} row={{}} profiles={scoped?.profiles || []}
          allEntries={scoped?.cardShowEntries || []} allCosts={scoped?.cardShowCosts || []}
          onChanged={refresh} onSaved={setSavedId} />
        {savedId && (
          <button className="btn ghost" style={{ marginTop: 16 }} onClick={() => { setSavedId(null); setK((v) => v + 1) }}>
            + Log another show
          </button>
        )}
      </div>
    </div>
  )
}
