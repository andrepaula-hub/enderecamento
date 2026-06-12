import { useState, useEffect, useRef, useMemo } from 'react'
import type { Product } from '../store/addressing'
import type { Allocation } from '../store/addressing'

// Color constants matching dse-escaninho.jsx
const CURVA_COLOR: Record<string, string> = {
  A: '#0DAB77', B: '#3B82F6', C: '#F59E0B', D: '#F97316', E: '#EF4444',
}

const GROUP_STYLE: Record<string, { text: string; label: string }> = {
  FLV:        { text: '#0DAB77', label: 'FLV' },
  Alimento:   { text: '#8B6332', label: 'ALM' },
  Bebidas:    { text: '#2563EB', label: 'BEB' },
  Perfumaria: { text: '#BE185D', label: 'PRF' },
  Químico:    { text: '#DC2626', label: 'QMC' },
  Neutro:     { text: '#64748B', label: 'NEU' },
}

interface SearchBarProps {
  products: Product[]
  allocations: Record<string, Allocation>
  onHighlight: (productId: string | null, locations: string[]) => void
}

export default function SearchBar({ products, allocations, onHighlight }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    const q = query.toLowerCase()
    return products
      .filter(p => p.nome.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .slice(0, 9)
      .map(p => {
        const locs: string[] = []
        Object.entries(allocations).forEach(([k, a]) => {
          if (a.p1 === p.id || a.p2 === p.id) locs.push(k)
        })
        return { product: p, locs }
      })
  }, [query, allocations, products])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleSelect = (r: { product: Product; locs: string[] }) => {
    onHighlight(r.product.id, r.locs)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', fontSize: 12, pointerEvents: 'none' }}>⌕</span>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar produto, código…"
          style={{ padding: '5px 28px 5px 28px', fontSize: 11, width: 220, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20, color: 'rgba(255,255,255,0.88)', outline: 'none', fontFamily: 'var(--font-sans)' }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); onHighlight(null, []) }}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 1, padding: 0 }}
          >✕</button>
        )}
      </div>
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 320, background: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)', borderRadius: 8, boxShadow: '0 12px 36px rgba(0,0,0,0.28)', zIndex: 300, overflow: 'hidden' }}>
          <div style={{ padding: '5px 12px 4px', fontSize: 9, fontWeight: 700, color: 'var(--map-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--dropdown-border)' }}>
            {results.length} resultado{results.length !== 1 ? 's' : ''}
          </div>
          {results.map(r => {
            const cc = CURVA_COLOR[r.product.curva] ?? '#94A3B8'
            const gs = GROUP_STYLE[r.product.grupo] ?? GROUP_STYLE['Neutro']!
            return (
              <button
                key={r.product.id}
                onClick={() => handleSelect(r)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--dropdown-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 24, height: 24, borderRadius: 5, background: `${cc}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: cc }}>{r.product.curva}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dropdown-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.product.nome}</div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 1, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: gs.text, fontWeight: 700 }}>{gs.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--map-text-muted)' }}>·</span>
                    <span style={{ fontSize: 9, color: 'var(--map-text-muted)' }}>
                      {r.locs.length > 0 ? `${r.locs.length} escaninho${r.locs.length !== 1 ? 's' : ''} · ${r.locs[0]}` : 'Não alocado'}
                    </span>
                  </div>
                </div>
                {r.locs.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#0DAB77', flexShrink: 0 }}>↗</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
