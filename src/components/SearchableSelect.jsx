import { useState, useRef, useMemo, useEffect } from 'react'

// ============================================================
// SEARCHABLE SELECT — type-to-filter combobox for long lists (the full ~380
// product catalogue made the native <select> unusable to search). Keyboard:
// type to filter, ↑/↓ to move, Enter to pick, Esc to close.
//   options: [{ id, label }]   value: id   onChange(id)
// ============================================================
export default function SearchableSelect({ value, options, onChange, placeholder = 'Search…', style }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find((o) => o.id === value) || null

  // When closed, the input shows the chosen label; when open, it shows the query.
  const shown = open ? query : (selected ? selected.label : '')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 50)
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 50)
  }, [query, options])

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const choose = (o) => { onChange(o ? o.id : ''); setOpen(false); setQuery('') }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setHi((h) => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && filtered[hi]) choose(filtered[hi]) }
    else if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        value={shown}
        placeholder={selected ? selected.label : placeholder}
        onFocus={() => { setOpen(true); setHi(0) }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHi(0) }}
        onKeyDown={onKey}
        style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line, #ddd)', font: 'inherit', width: '100%', boxSizing: 'border-box', background: 'var(--card, #fff)', color: 'inherit' }}
      />
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 240, overflowY: 'auto', background: 'var(--card, #fff)', border: '1px solid var(--line, #ddd)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }}>
          {value && (
            <div onMouseDown={(e) => { e.preventDefault(); choose(null) }} style={{ padding: '8px 11px', fontSize: 13, color: '#999', cursor: 'pointer', borderBottom: '1px solid var(--line, #eee)' }}>Clear selection</div>
          )}
          {filtered.length === 0 && <div style={{ padding: '10px 11px', fontSize: 13, color: '#999' }}>No matches</div>}
          {filtered.map((o, i) => (
            <div key={o.id}
              onMouseDown={(e) => { e.preventDefault(); choose(o) }}
              onMouseEnter={() => setHi(i)}
              style={{ padding: '8px 11px', fontSize: 13.5, cursor: 'pointer', background: i === hi ? 'var(--bg, #f3f2ef)' : 'transparent', fontWeight: o.id === value ? 700 : 400 }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
