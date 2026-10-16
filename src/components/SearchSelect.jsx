import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * A searchable picker for long lists.
 *
 * A native <select> does type-AHEAD (press "c" and it jumps to the first item
 * starting with C). With 280+ products that's useless. This filters instead:
 * type any part of the name and the list narrows to what matches.
 *
 * options: [{ id, label, note }]
 */
export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  disabled = false,
  emptyText = 'No matches',
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find((o) => o.id === value)

  // Match on any part of the name, not just the start — "chrome" should find
  // "Topps Chrome UCC", which a native select never would.
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return options
    return options.filter((o) =>
      o.label.toLowerCase().includes(term) ||
      (o.note || '').toLowerCase().includes(term)
    )
  }, [q, options])

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false)
        setQ('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => { setHi(0) }, [q])

  function pick(o) {
    onChange(o.id)
    setOpen(false)
    setQ('')
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHi((h) => Math.min(h + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && matches[hi]) pick(matches[hi])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQ('')
    }
  }

  return (
    <div className="search-select" ref={boxRef}>
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? q : (selected ? selected.label : '')}
        onFocus={() => { if (!disabled) { setOpen(true); setQ('') } }}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onKeyDown={onKeyDown}
        className={selected && !open ? 'has-value' : undefined}
      />

      {selected && !open && !disabled && (
        <button
          type="button"
          className="ss-clear"
          onClick={() => { onChange(''); setQ(''); inputRef.current?.focus() }}
          aria-label="Clear"
        >×</button>
      )}

      {open && !disabled && (
        <div className="ss-list">
          {matches.length === 0 && <div className="ss-empty">{emptyText}</div>}
          {matches.slice(0, 60).map((o, i) => (
            <button
              type="button"
              key={o.id}
              className={'ss-item' + (i === hi ? ' hi' : '') + (o.id === value ? ' sel' : '')}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(o)}
            >
              <span className="ss-label">{o.label}</span>
              {o.note && <span className="ss-note">{o.note}</span>}
            </button>
          ))}
          {matches.length > 60 && (
            <div className="ss-empty">
              {matches.length - 60} more — keep typing to narrow it down
            </div>
          )}
        </div>
      )}
    </div>
  )
}
