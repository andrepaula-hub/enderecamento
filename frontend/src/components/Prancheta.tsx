// Prancheta — migrated from dse-prancheta.jsx
// No data normalization; data comes pre-normalized from backend/store.
import { useState, useMemo, useRef } from 'react'
import type { Product } from '../store/addressing'
import { CURVA_COLOR, GROUP_STYLE } from './Escaninho'

const GRUPOS = ['FLV', 'Alimento', 'Bebidas', 'Perfumaria', 'Químico', 'Neutro']
const CURVAS = ['A', 'B', 'C', 'D', 'E']

const TIPO_FISICO_OPTIONS = [
  { id: 'alto',    label: 'Alto',    flag: 'alto' },
  { id: 'pesado',  label: 'Pesado',  flag: 'pesado' },
  { id: 'pequeno', label: 'Pequeno', flag: 'pequeno' },
  { id: 'fragil',  label: 'Frágil',  flag: 'fragil' },
]

interface ChipProps {
  label: string
  active: boolean
  onClick: () => void
  color?: string
}

function Chip({ label, active, onClick, color }: ChipProps) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
      border: active ? `1px solid ${color ?? 'var(--shopper-green)'}` : '1px solid var(--pran-border)',
      background: active ? (color ? `${color}20` : 'rgba(13,171,119,0.12)') : 'transparent',
      color: active ? (color ?? 'var(--shopper-green)') : 'var(--pran-muted)',
      fontFamily: 'var(--font-sans)', flexShrink: 0, lineHeight: 1.7,
    }}>
      {label}
    </button>
  )
}

interface ProductItemProps {
  product: Product
  isSelected: boolean
  onClick: (p: Product) => void
}

function ProductItem({ product, isSelected, onClick }: ProductItemProps) {
  const gs = GROUP_STYLE[product.grupo] ?? GROUP_STYLE['Neutro']!
  const cc = CURVA_COLOR[product.curva] ?? '#94A3B8'

  return (
    <div
      onClick={() => onClick(product)}
      style={{
        padding: '7px 10px', cursor: 'pointer', borderRadius: 5, marginBottom: 2,
        background: isSelected ? 'rgba(13,171,119,0.10)' : 'transparent',
        border: isSelected ? '1px solid rgba(13,171,119,0.35)' : '1px solid transparent',
        transition: 'background 0.1s', display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <div style={{ width: 26, height: 26, borderRadius: 5, background: `${cc}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: cc }}>{product.curva}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pran-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
          {product.nome}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: gs.text, fontWeight: 700 }}>{gs.label}</span>
          <span style={{ fontSize: 9, color: 'var(--pran-muted)' }}>·</span>
          <span style={{ fontSize: 9, color: 'var(--pran-muted)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{product.sub}</span>
        </div>
      </div>
      <span style={{ fontSize: 9, color: 'var(--pran-muted)', fontFamily: 'var(--font-numeric)', flexShrink: 0 }}>×{product.escsNec}</span>
    </div>
  )
}

interface PranchetaProps {
  collected: string[]
  unallocated: string[]
  productMap: Record<string, Product>
  selectedProduct: string | null
  onSelectProduct: (id: string | null) => void
  mode2aLeva: boolean
  onToggle2aLeva: () => void
  width: number
}

const filterLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: 'var(--pran-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
}

export default function Prancheta({
  collected, unallocated, productMap, selectedProduct,
  onSelectProduct, mode2aLeva, onToggle2aLeva, width,
}: PranchetaProps) {
  const [tab, setTab] = useState<'nao_alocados' | 'recolhidos'>('nao_alocados')
  const [search, setSearch] = useState('')
  const [filterGrupos, setFG] = useState<string[]>([])
  const [filterCurvas, setFC] = useState<string[]>([])
  const [filterTipos, setFT] = useState<string[]>([])
  const [subSearch, setSubSearch] = useState('')
  const [subOpen, setSubOpen] = useState(false)
  const [filterSubs, setFSubs] = useState<string[]>([])
  const [showFilters, setShowF] = useState(false)
  const [showQuick, setShowQ] = useState(false)
  const subInputRef = useRef<HTMLInputElement>(null)

  const activeList = tab === 'recolhidos' ? collected : unallocated

  const allSubs = useMemo(() => {
    const s = new Set<string>()
    activeList.forEach(pid => { const p = productMap[pid]; if (p) s.add(p.sub) })
    return [...s].sort()
  }, [activeList, productMap])

  const filteredSubs = useMemo(() =>
    subSearch ? allSubs.filter(s => s.toLowerCase().includes(subSearch.toLowerCase())) : allSubs,
    [allSubs, subSearch]
  )

  const filtered = useMemo(() => {
    return activeList
      .filter(pid => {
        const p = productMap[pid]
        if (!p) return false
        if (search && !p.nome.toLowerCase().includes(search.toLowerCase()) && !p.id.toLowerCase().includes(search.toLowerCase())) return false
        if (filterGrupos.length && !filterGrupos.includes(p.grupo)) return false
        if (filterCurvas.length && !filterCurvas.includes(p.curva)) return false
        if (filterTipos.length) {
          const match = filterTipos.every(t => {
            if (t === 'alto')    return p.alto
            if (t === 'pesado')  return p.pesado
            if (t === 'pequeno') return p.pequeno
            if (t === 'fragil')  return p.fragil
            return false
          })
          if (!match) return false
        }
        if (filterSubs.length && !filterSubs.includes(p.sub)) return false
        return true
      })
      .map(pid => productMap[pid])
      .filter((p): p is Product => p !== undefined)
  }, [activeList, search, filterGrupos, filterCurvas, filterTipos, filterSubs, productMap])

  const toggleGrupo = (g: string) => setFG(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  const toggleCurva = (c: string) => setFC(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  const toggleTipo  = (t: string) => setFT(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const toggleSub   = (s: string) => setFSubs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const totalFilters = filterGrupos.length + filterCurvas.length + filterTipos.length + filterSubs.length

  return (
    <div style={{ width, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--pran-bg)', borderLeft: '1px solid var(--pran-border)', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--pran-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pran-text)' }}>Prancheta</span>
          <button onClick={onToggle2aLeva} style={{
            padding: '3px 8px', fontSize: 9, fontWeight: 700, borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            background: mode2aLeva ? 'rgba(13,171,119,0.14)' : 'transparent',
            border: mode2aLeva ? '1px solid rgba(13,171,119,0.4)' : '1px solid var(--pran-border)',
            color: mode2aLeva ? 'var(--shopper-green)' : 'var(--pran-muted)',
          }}>
            2ª Leva {mode2aLeva ? 'ON' : 'OFF'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['nao_alocados', 'recolhidos'] as const).map(v => {
            const label = v === 'nao_alocados' ? 'Não alocados' : 'Recolhidos'
            const count = v === 'nao_alocados' ? unallocated.length : collected.length
            return (
              <button key={v} onClick={() => setTab(v)} style={{
                flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 700, borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                border: tab === v ? '1px solid var(--shopper-green)' : '1px solid var(--pran-border)',
                background: tab === v ? 'rgba(13,171,119,0.10)' : 'transparent',
                color: tab === v ? 'var(--shopper-green)' : 'var(--pran-muted)',
              }}>
                {label} <span style={{ opacity: 0.65 }}>({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Search + filter toggle */}
      <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--pran-border)', flexShrink: 0, display: 'flex', gap: 5 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou código…"
          style={{ flex: 1, padding: '5px 8px', fontSize: 11, background: 'var(--pran-input)', border: '1px solid var(--pran-border)', borderRadius: 5, color: 'var(--pran-text)', outline: 'none', fontFamily: 'var(--font-sans)' }}
        />
        <button onClick={() => setShowF(v => !v)} style={{
          padding: '4px 8px', fontSize: 10, fontWeight: 700, borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          border: totalFilters ? '1px solid var(--shopper-green)' : '1px solid var(--pran-border)',
          background: totalFilters ? 'rgba(13,171,119,0.10)' : 'transparent',
          color: totalFilters ? 'var(--shopper-green)' : 'var(--pran-muted)',
        }}>
          {showFilters ? '▲' : '▼'} {totalFilters > 0 ? `(${totalFilters})` : 'Filtros'}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--pran-border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={filterLabel}>Grupo</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {GRUPOS.map(g => <Chip key={g} label={g} active={filterGrupos.includes(g)} onClick={() => toggleGrupo(g)} color={GROUP_STYLE[g]?.text} />)}
              {filterGrupos.length > 0 && <Chip label="✕" active={false} onClick={() => setFG([])} />}
            </div>
          </div>
          <div>
            <div style={filterLabel}>Curva</div>
            <div style={{ display: 'flex', gap: 3 }}>
              {CURVAS.map(c => <Chip key={c} label={c} active={filterCurvas.includes(c)} onClick={() => toggleCurva(c)} color={CURVA_COLOR[c]} />)}
              {filterCurvas.length > 0 && <Chip label="✕" active={false} onClick={() => setFC([])} />}
            </div>
          </div>
          <div>
            <div style={filterLabel}>Tipo físico</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {TIPO_FISICO_OPTIONS.map(t => (
                <Chip key={t.id} label={t.label} active={filterTipos.includes(t.id)} onClick={() => toggleTipo(t.id)} />
              ))}
              {filterTipos.length > 0 && <Chip label="✕" active={false} onClick={() => setFT([])} />}
            </div>
          </div>
          <div>
            <div style={filterLabel}>Subcategoria</div>
            {filterSubs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 5 }}>
                {filterSubs.map(s => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 6px 2px 8px', background: 'rgba(13,171,119,0.12)', border: '1px solid rgba(13,171,119,0.35)', borderRadius: 10, fontSize: 9, fontWeight: 700, color: 'var(--shopper-green)', fontFamily: 'var(--font-sans)' }}>
                    {s}
                    <button onClick={() => toggleSub(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(61,212,166,0.65)', fontSize: 11, lineHeight: 1, padding: '0 0 0 2px', display: 'flex' }}>×</button>
                  </div>
                ))}
                <button onClick={() => setFSubs([])} style={{ fontSize: 9, color: 'var(--pran-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'var(--font-sans)' }}>Limpar ✕</button>
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <input
                ref={subInputRef}
                value={subSearch}
                onChange={e => { setSubSearch(e.target.value); setSubOpen(true) }}
                onFocus={() => setSubOpen(true)}
                onBlur={() => setTimeout(() => setSubOpen(false), 150)}
                placeholder={filterSubs.length > 0 ? `${filterSubs.length} selecionada(s) — buscar mais…` : 'Buscar subcategoria…'}
                style={{ width: '100%', padding: '4px 8px', fontSize: 10, background: 'var(--pran-input)', border: '1px solid var(--pran-border)', borderRadius: 4, color: 'var(--pran-text)', outline: 'none', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
              />
              {subOpen && filteredSubs.filter(s => !filterSubs.includes(s)).length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)', borderRadius: 5, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', maxHeight: 150, overflowY: 'auto' }}>
                  {filteredSubs.filter(s => !filterSubs.includes(s)).map(s => (
                    <button
                      key={s}
                      onMouseDown={() => { toggleSub(s); setSubSearch('') }}
                      style={{ display: 'block', width: '100%', padding: '5px 10px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 10, fontFamily: 'var(--font-sans)', background: 'transparent', color: 'var(--dropdown-text)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--dropdown-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {totalFilters > 0 && (
            <button onClick={() => { setFG([]); setFC([]); setFT([]); setFSubs([]) }} style={{ padding: '4px', fontSize: 10, fontWeight: 700, background: 'transparent', border: '1px solid var(--pran-border)', borderRadius: 4, cursor: 'pointer', color: 'var(--pran-muted)', fontFamily: 'var(--font-sans)' }}>
              Limpar todos os filtros
            </button>
          )}
        </div>
      )}

      {/* Selected product banner */}
      {selectedProduct && (
        <div style={{ padding: '6px 12px', background: 'rgba(13,171,119,0.10)', borderBottom: '1px solid rgba(13,171,119,0.22)', flexShrink: 0 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--shopper-green)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Alocando</div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--pran-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {productMap[selectedProduct]?.nome}
          </div>
          <div style={{ fontSize: 9, color: 'var(--pran-muted)', marginTop: 1 }}>Clique em escaninho vazio · ESC cancela</div>
        </div>
      )}

      {/* Product list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--pran-muted)', fontSize: 11, lineHeight: 1.6 }}>
            {activeList.length === 0
              ? (tab === 'recolhidos' ? 'Nenhum produto recolhido.' : 'Todos os produtos estão alocados.')
              : 'Nenhum resultado para o filtro atual.'}
          </div>
        )}
        {filtered.map(product => (
          <ProductItem
            key={product.id}
            product={product}
            isSelected={selectedProduct === product.id}
            onClick={p => onSelectProduct(p.id === selectedProduct ? null : p.id)}
          />
        ))}
      </div>

      {/* Quick-collect */}
      <div style={{ borderTop: '1px solid var(--pran-border)', flexShrink: 0 }}>
        <button onClick={() => setShowQ(v => !v)} style={{ width: '100%', padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--pran-muted)', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-sans)' }}>
          <span>Ações rápidas</span>
          <span>{showQuick ? '▲' : '▼'}</span>
        </button>
        {showQuick && (
          <div style={{ padding: '4px 8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              'Recolher todos com falta de escaninho',
              'Recolher produtos dispersos',
              'Recolher altos em geladeiras',
              'Recolher 2º slot de prateleiras',
              'Recolher 2º slot de geladeiras',
            ].map(label => (
              <button
                key={label}
                onClick={() => {/* placeholder - same behavior as original */}}
                style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: 'pointer', border: '1px solid var(--pran-border)', background: 'transparent', color: 'var(--pran-muted)', fontFamily: 'var(--font-sans)', textAlign: 'left', lineHeight: 1.4, width: '100%' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--pran-hover)'; e.currentTarget.style.color = 'var(--pran-text)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--pran-muted)' }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
