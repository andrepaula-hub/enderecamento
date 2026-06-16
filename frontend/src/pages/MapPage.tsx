// MapPage — substitui dse-map.jsx + lógica do dse-app.jsx para a view de mapa
// Estado gerenciado por Zustand. Sem funções de normalização de dados.
import { useState, useEffect, useCallback, useReducer, useRef, useMemo } from 'react'
import { useAddressingStore } from '../store/addressing'
import { useTweaksStore } from '../store/tweaks'
import { useConfigStore } from '../store/config'
import { getInitialData, suggestAllocations } from '../api/addressing'
import { saveVersion } from '../api/versions'
import { generateLayoutAtual, generateKdabraSheet, generateKdabraEnderecarSheet, downloadFile } from '../api/exports'
import SearchBar from '../components/SearchBar'
import Prancheta from '../components/Prancheta'
import MetricsPanel from '../components/panels/MetricsPanel'
import VersionsPanel from '../components/panels/VersionsPanel'
import LegendPanel from '../components/panels/LegendPanel'
import ConfirmModal from '../components/ConfirmModal'
import TweaksPanel, { TweakSection, TweakToggle, TweakRadio, TweakSlider } from '../components/TweaksPanel'
import ConfigPage from './ConfigPage'
import type { ConfirmDialog } from '../components/ConfirmModal'
import type { Allocation, Product } from '../store/addressing'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Equipment {
  id: string
  tipo: string
  niveis: number
  escsPerNivel: number
  cap: number
}

interface Street {
  id: string
  nome: string
  equipment: Equipment[]
}

// ── State ─────────────────────────────────────────────────────────────────────
interface MapState {
  mapStructure: Street[]
  allocations: Record<string, Allocation>
  history: Record<string, Allocation>[]
  histIdx: number
  selectedProduct: string | null
  mode2aLeva: boolean
  pranchetaOpen: boolean
  openPanel: 'metrics' | 'versions' | 'legend' | null
  collected: string[]
  unallocated: string[]
  equipCollapsed: Record<string, boolean>
  streetCollapsed: Record<string, boolean>
  pendingConfirm: ConfirmDialog | null
  swapSource: string | null
  highlightProductId: string | null
  subcatFilters: string[]
  configOpen: boolean
}

function commitAllocs(state: MapState, newAllocs: Record<string, Allocation>): MapState {
  const h = [...state.history.slice(0, state.histIdx + 1), { ...newAllocs }]
  return { ...state, allocations: newAllocs, history: h, histIdx: h.length - 1 }
}

type MapAction =
  | { type: 'INIT'; mapStructure: Street[]; allocations: Record<string, Allocation>; unallocated: string[] }
  | { type: 'OPEN_PANEL'; panel: MapState['openPanel'] }
  | { type: 'CLOSE_PANEL' }
  | { type: 'TOGGLE_PRANCHETA' }
  | { type: 'SELECT_PRODUCT'; productId: string | null }
  | { type: 'TOGGLE_2A_LEVA' }
  | { type: 'SET_SUBCAT_FILTERS'; filters: string[] }
  | { type: 'SET_CONFIRM'; dialog: ConfirmDialog }
  | { type: 'CLEAR_CONFIRM' }
  | { type: 'TOGGLE_EQUIP'; id: string }
  | { type: 'TOGGLE_STREET'; id: string }
  | { type: 'EXPAND_ALL' }
  | { type: 'COLLAPSE_ALL' }
  | { type: 'SET_SWAP_SOURCE'; equipId: string }
  | { type: 'CLEAR_SWAP_SOURCE' }
  | { type: 'SET_HIGHLIGHT'; productId: string | null }
  | { type: 'HIGHLIGHT_AND_NAVIGATE'; productId: string | null; locs: string[] }
  | { type: 'CLEAR_HIGHLIGHT' }
  | { type: 'COLLAPSE_STREET_EQUIPS'; streetId: string }
  | { type: 'EXPAND_STREET_EQUIPS'; streetId: string }
  | { type: 'ALLOCATE'; escaninhoId: string; productId: string; slot: 1 | 2 }
  | { type: 'COLLECT'; escaninhoId: string; product: Product }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RECOLHER_RUA'; streetId: string }
  | { type: 'TOGGLE_CONFIG' }
  | { type: 'BULK_ALLOCATE'; moves: Array<{ escaninhoId: string; productCode: string }> }

function reducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case 'INIT':
      return { ...state, mapStructure: action.mapStructure, allocations: action.allocations, history: [action.allocations], histIdx: 0, unallocated: action.unallocated }
    case 'OPEN_PANEL': return { ...state, openPanel: state.openPanel === action.panel ? null : action.panel }
    case 'CLOSE_PANEL': return { ...state, openPanel: null, configOpen: false }
    case 'TOGGLE_PRANCHETA': return { ...state, pranchetaOpen: !state.pranchetaOpen }
    case 'SELECT_PRODUCT': return { ...state, selectedProduct: action.productId }
    case 'TOGGLE_2A_LEVA': return { ...state, mode2aLeva: !state.mode2aLeva }
    case 'SET_SUBCAT_FILTERS': return { ...state, subcatFilters: action.filters }
    case 'SET_CONFIRM': return { ...state, pendingConfirm: action.dialog }
    case 'CLEAR_CONFIRM': return { ...state, pendingConfirm: null }
    case 'TOGGLE_EQUIP': return { ...state, equipCollapsed: { ...state.equipCollapsed, [action.id]: !state.equipCollapsed[action.id] } }
    case 'TOGGLE_STREET': return { ...state, streetCollapsed: { ...state.streetCollapsed, [action.id]: !state.streetCollapsed[action.id] } }
    case 'EXPAND_ALL': return { ...state, equipCollapsed: {}, streetCollapsed: {} }
    case 'COLLAPSE_ALL': {
      const ec: Record<string, boolean> = {}, sc: Record<string, boolean> = {}
      state.mapStructure.forEach(st => {
        sc[st.id] = true
        st.equipment.forEach(eq => { ec[eq.id] = true })
      })
      return { ...state, equipCollapsed: ec, streetCollapsed: sc }
    }
    case 'SET_SWAP_SOURCE': return { ...state, swapSource: action.equipId }
    case 'CLEAR_SWAP_SOURCE': return { ...state, swapSource: null }
    case 'SET_HIGHLIGHT': return { ...state, highlightProductId: action.productId }
    case 'HIGHLIGHT_AND_NAVIGATE': {
      const equipCollapsed = { ...state.equipCollapsed }
      const streetCollapsed = { ...state.streetCollapsed }
      ;(action.locs ?? []).forEach(loc => {
        const parts = String(loc).split('-')
        const streetId = parts[0]!
        const equipId = parts.slice(0, 2).join('-')
        delete equipCollapsed[equipId]
        if (streetId) delete streetCollapsed[streetId]
      })
      return { ...state, highlightProductId: action.productId, equipCollapsed, streetCollapsed }
    }
    case 'CLEAR_HIGHLIGHT': return { ...state, highlightProductId: null }
    case 'COLLAPSE_STREET_EQUIPS': {
      const street = state.mapStructure.find(s => s.id === action.streetId)
      if (!street) return state
      const equipCollapsed = { ...state.equipCollapsed }
      street.equipment.forEach(eq => { equipCollapsed[eq.id] = true })
      return { ...state, equipCollapsed }
    }
    case 'EXPAND_STREET_EQUIPS': {
      const street = state.mapStructure.find(s => s.id === action.streetId)
      if (!street) return state
      const equipCollapsed = { ...state.equipCollapsed }
      street.equipment.forEach(eq => { delete equipCollapsed[eq.id] })
      return { ...state, equipCollapsed }
    }
    case 'ALLOCATE': {
      const { escaninhoId, productId, slot } = action
      const prev = state.allocations[escaninhoId] ?? { p1: null, p2: null }
      const na: Allocation = slot === 2 ? { p1: prev.p1, p2: productId } : { p1: productId, p2: prev.p2 }
      const newA = { ...state.allocations, [escaninhoId]: na }
      return { ...commitAllocs(state, newA), collected: state.collected.filter(id => id !== productId), unallocated: state.unallocated.filter(id => id !== productId), selectedProduct: null }
    }
    case 'COLLECT': {
      const { escaninhoId, product } = action
      const prev = state.allocations[escaninhoId] ?? { p1: null, p2: null }
      const na: Allocation = { p1: prev.p2 ?? null, p2: null }
      const newA = { ...state.allocations, [escaninhoId]: na }
      if (!na.p1) delete newA[escaninhoId]
      return { ...commitAllocs(state, newA), collected: state.collected.includes(product.id) ? state.collected : [product.id, ...state.collected], selectedProduct: null }
    }
    case 'UNDO': {
      if (state.histIdx <= 0) return state
      const ni = state.histIdx - 1
      return { ...state, histIdx: ni, allocations: { ...state.history[ni]! } }
    }
    case 'REDO': {
      if (state.histIdx >= state.history.length - 1) return state
      const ni = state.histIdx + 1
      return { ...state, histIdx: ni, allocations: { ...state.history[ni]! } }
    }
    case 'RECOLHER_RUA': {
      const street = state.mapStructure.find(s => s.id === action.streetId)
      if (!street) return state
      const newA = { ...state.allocations }
      const newCollected = [...state.collected]
      street.equipment.forEach(eq => {
        for (let n = 1; n <= eq.niveis; n++) {
          for (let s = 1; s <= eq.escsPerNivel; s++) {
            const key = `${eq.id}-${n}-${s}`, a = newA[key]
            if (a?.p1 && !newCollected.includes(a.p1)) newCollected.push(a.p1)
            if (a?.p2 && !newCollected.includes(a.p2)) newCollected.push(a.p2)
            delete newA[key]
          }
        }
      })
      return { ...commitAllocs(state, newA), collected: newCollected, streetCollapsed: { ...state.streetCollapsed, [action.streetId]: false } }
    }
    case 'TOGGLE_CONFIG': return { ...state, configOpen: !state.configOpen }
    case 'BULK_ALLOCATE': {
      let newA = { ...state.allocations }
      const newUnallocated = [...state.unallocated]
      for (const { escaninhoId, productCode } of action.moves) {
        const prev = newA[escaninhoId] ?? { p1: null, p2: null }
        if (!prev.p1) newA = { ...newA, [escaninhoId]: { p1: productCode, p2: prev.p2 } }
        else if (!prev.p2) newA = { ...newA, [escaninhoId]: { p1: prev.p1, p2: productCode } }
        const idx = newUnallocated.indexOf(productCode)
        if (idx !== -1) newUnallocated.splice(idx, 1)
      }
      return { ...commitAllocs(state, newA), unallocated: newUnallocated }
    }
    default: return state
  }
}

const initState: MapState = {
  mapStructure: [],
  allocations: {},
  history: [{}],
  histIdx: 0,
  selectedProduct: null,
  mode2aLeva: false,
  pranchetaOpen: true,
  openPanel: null,
  collected: [],
  unallocated: [],
  equipCollapsed: {},
  streetCollapsed: {},
  pendingConfirm: null,
  swapSource: null,
  highlightProductId: null,
  subcatFilters: [],
  configOpen: false,
}

// ── Save Modal ─────────────────────────────────────────────────────────────────
function SaveModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string, setProgress: (n: number) => void) => Promise<void> }) {
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<'input' | 'saving' | 'done'>('input')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (phase === 'input') setTimeout(() => inputRef.current?.focus(), 60) }, [phase])

  const handleSave = async () => {
    if (!name.trim()) return
    setPhase('saving'); setProgress(20); setError('')
    try {
      await onSave(name.trim(), setProgress)
      setProgress(100); setPhase('done')
      setTimeout(() => onClose(), 700)
    } catch (err) {
      setError(String(err)); setPhase('input')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={phase === 'input' ? onClose : undefined} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', background: 'var(--cfg-surface)', border: '1px solid var(--cfg-border)', borderRadius: 12, padding: '28px', width: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
        {phase === 'input' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--cfg-text)', marginBottom: 6 }}>Salvar endereçamento</div>
            <div style={{ fontSize: 12, color: 'var(--cfg-text-muted)', marginBottom: 18, lineHeight: 1.5 }}>Escolha um nome para identificar esta versão.</div>
            {error && <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 12 }}>{error}</div>}
            <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') onClose() }}
              placeholder="Ex: Pós-ETL semana 24, Re-FLV loja SP-01…"
              style={{ width: '100%', padding: '10px 12px', fontSize: 12, background: 'var(--cfg-input-bg)', border: '1px solid var(--cfg-border)', borderRadius: 7, color: 'var(--cfg-text)', outline: 'none', marginBottom: 18, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--cfg-border)', color: 'var(--cfg-text-muted)', fontFamily: 'var(--font-sans)' }}>Cancelar</button>
              <button onClick={() => void handleSave()} disabled={!name.trim()} style={{ padding: '8px 20px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)', border: 'none', background: 'var(--shopper-green)', color: '#fff', opacity: name.trim() ? 1 : 0.4 }}>Salvar versão</button>
            </div>
          </>
        )}
        {phase === 'saving' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cfg-text)', marginBottom: 20 }}>Salvando <strong style={{ color: 'var(--shopper-green)' }}>"{name}"</strong>…</div>
            <div style={{ height: 8, background: 'var(--cfg-border)', borderRadius: 4, marginBottom: 12, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--shopper-green)', borderRadius: 4, transition: 'width 0.04s linear' }} />
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--shopper-green)', fontFamily: 'var(--font-numeric)', lineHeight: 1 }}>
              {progress}<span style={{ fontSize: 16 }}>%</span>
            </div>
          </div>
        )}
        {phase === 'done' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 36, color: 'var(--shopper-green)', marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--shopper-green)' }}>Versão salva com sucesso!</div>
            <div style={{ fontSize: 11, color: 'var(--cfg-text-muted)', marginTop: 5 }}>{name}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Toolbar helpers ────────────────────────────────────────────────────────────
function TBtn({ label, icon, onClick, active, disabled, title }: { label?: string; icon?: string; onClick: () => void; active?: boolean; disabled?: boolean; title?: string }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} title={title ?? label}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 5, cursor: disabled ? 'default' : 'pointer', border: active ? '1px solid rgba(255,255,255,0.22)' : '1px solid transparent', background: active ? 'rgba(255,255,255,0.12)' : (h && !disabled ? 'rgba(255,255,255,0.07)' : 'transparent'), color: disabled ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
      {icon && <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>}
      {label && <span>{label}</span>}
    </button>
  )
}

function Sep() {
  return <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.13)', margin: '0 3px', flexShrink: 0 }} />
}

function ActionsDropdown({ dispatch }: { dispatch: React.Dispatch<MapAction> }) {
  const [open, setOpen] = useState(false)

  const items = [
    { label: 'Expandir todos', icon: '⊞', action: () => dispatch({ type: 'EXPAND_ALL' }) },
    { label: 'Recolher todos', icon: '⊟', action: () => dispatch({ type: 'COLLAPSE_ALL' }) },
    { sep: true },
    { label: 'Baixar XLSX atual', icon: '⬇', action: () => downloadFile() },
    { sep: true },
    { label: 'Gerar resumo de equipamentos', icon: '≡', action: async () => { const res = await generateLayoutAtual(); alert(res.success ? 'Layout atual gerado.' : res.error) } },
    { label: 'Gerar planilha KDABTA', icon: '⊞', action: async () => { const res = await generateKdabraEnderecarSheet(); alert(res.success ? 'Planilha KDABTA gerada.' : res.error) } },
    { label: 'Gerar planilha KDABRA', icon: '⊞', action: async () => { const res = await generateKdabraSheet(); alert(res.success ? 'Planilha KDABRA gerada.' : res.error) } },
  ]

  return (
    <div style={{ position: 'relative' }}>
      <TBtn label="Ações" icon="⋯" active={open} onClick={() => setOpen(v => !v)} />
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100, background: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)', borderRadius: 8, padding: '4px', minWidth: 230, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
            {items.map((it, i) =>
              'sep' in it
                ? <div key={i} style={{ height: 1, background: 'var(--dropdown-border)', margin: '4px 0' }} />
                : <button key={i} onClick={() => { void it.action(); setOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', background: 'transparent', color: 'var(--dropdown-text)', fontSize: 11, fontWeight: 500 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--dropdown-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span>{it.icon}</span>{it.label}
                  </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Regras de alocação (client-side, espelha core/agent_scoring.py) ────────────
function canPlace(product: Product, equipTipo: string, nivel: number, totalNiveis: number): boolean {
  const arm = product.arm.toLowerCase()
  const tipo = equipTipo.toLowerCase()
  if (arm.includes('congelado') || arm.includes('freezer')) {
    if (!tipo.includes('freezer')) return false
  } else if (arm.includes('refrigerado') || arm.includes('geladeira')) {
    if (!tipo.includes('geladeira')) return false
  } else {
    if (tipo.includes('geladeira') || tipo.includes('freezer')) return false
  }
  if (tipo.includes('prateleira')) {
    if (nivel === 1) return false  // nível mais alto bloqueado por padrão
    const grupo = product.grupo.toLowerCase()
    const isFLV = grupo === 'flv' || grupo === 'flvs' || grupo.includes('flv')
    if (isFLV && (nivel === 1 || nivel === totalNiveis)) return false
    if (product.pesado && nivel !== 4) return false
  }
  return true
}

// ── Map canvas ─────────────────────────────────────────────────────────────────
const EQUIP_TYPE_LABELS: Record<string, string> = {
  prateleira: 'PRT', prateleira_pamplona: 'PMP', geladeira: 'GLD', geladeira_alta: 'GDA', geladeira_gerador: 'GDG', freezer: 'FRZ', quimico: 'QMC',
}
const EQUIP_TYPE_COLORS: Record<string, string> = {
  prateleira: '#64748B', prateleira_pamplona: '#7C3AED', geladeira: '#2563EB', geladeira_alta: '#1D4ED8', geladeira_gerador: '#D97706', freezer: '#0891B2', quimico: '#DC2626',
}

function EquipmentBlock({ equip, allocations, productMap, collapsed, onToggle, selectedProduct, onAllocate, onBulkFill, onCollect, highlightProductId, compact }: {
  equip: Equipment; allocations: Record<string, Allocation>; productMap: Record<string, Product>; collapsed: boolean; onToggle: (e: React.MouseEvent) => void; selectedProduct: string | null; onAllocate: (id: string, pid: string, slot: 1 | 2) => void; onBulkFill: (equipId: string, nivel: number | null) => void; onCollect: (id: string, p: Product) => void; highlightProductId: string | null; compact: boolean
}) {
  const TYPE_LABELS = EQUIP_TYPE_LABELS
  const TYPE_COLORS = EQUIP_TYPE_COLORS
  const label = TYPE_LABELS[equip.tipo] ?? equip.tipo.toUpperCase().slice(0, 3)
  const color = TYPE_COLORS[equip.tipo] ?? '#64748B'
  const CELL_W = compact ? 56 : 72

  return (
    <div style={{ marginBottom: 4, flexShrink: 0 }}>
      <div
        onClick={e => {
          if ((e.metaKey || e.ctrlKey) && selectedProduct) { onBulkFill(equip.id, null); return }
          onToggle(e)
        }}
        title={selectedProduct ? 'Cmd+clique para preencher todo o equipamento com regras' : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer', borderRadius: 4, background: 'var(--map-equip-header)' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color, background: `${color}20`, padding: '1px 5px', borderRadius: 3 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--map-text-muted)', flex: 1 }}>{equip.id}</span>
        <span style={{ fontSize: 10, color: 'var(--map-text-muted)' }}>{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0' }}>
          {Array.from({ length: equip.niveis }, (_, ni) => {
            const nivel = ni + 1
            return (
              <div key={ni}
                onClick={e => { if (e.shiftKey && selectedProduct) { e.stopPropagation(); onBulkFill(equip.id, nivel) } }}
                title={selectedProduct ? `Shift+clique para preencher nível ${nivel} com regras` : undefined}
                style={{ display: 'flex', gap: 2 }}>
                {Array.from({ length: equip.escsPerNivel }, (_, si) => {
                  const id = `${equip.id}-${nivel}-${si + 1}`
                  const alloc = allocations[id]
                  const p1 = alloc?.p1 ? (productMap[alloc.p1] ?? null) : null
                  const p2 = alloc?.p2 ? (productMap[alloc.p2] ?? null) : null
                  const isHighlighted = !!highlightProductId && (alloc?.p1 === highlightProductId || alloc?.p2 === highlightProductId)
                  const bg = isHighlighted ? 'rgba(13,171,119,0.15)' : p1 ? 'var(--esc-occupied)' : 'var(--esc-empty)'
                  return (
                    <div key={id} style={{ width: CELL_W, minHeight: compact ? 22 : 28, border: `1px solid ${isHighlighted ? '#0DAB77' : 'var(--esc-border)'}`, borderRadius: 3, background: bg, fontSize: compact ? 8 : 9, overflow: 'hidden', cursor: 'pointer', flexShrink: 0 }}
                      onClick={e => {
                        if (e.shiftKey || e.metaKey || e.ctrlKey) return  // handled by parent
                        if (selectedProduct && !p1) { onAllocate(id, selectedProduct, 1); return }
                        if (selectedProduct && p1 && !p2) { onAllocate(id, selectedProduct, 2); return }
                        if (p1) onCollect(id, p1)
                      }}>
                      {p1 && (
                        <div style={{ padding: '1px 3px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: 'var(--esc-text)', lineHeight: 1.3 }}>
                          {p1.nome.slice(0, 10)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StreetColumn({ street, allocations, productMap, equipCollapsed, streetCollapsed, onToggleEquip, onToggleStreet, selectedProduct, onAllocate, onBulkFill, onCollect, highlightProductId, colWidth, compact }: {
  street: Street; allocations: Record<string, Allocation>; productMap: Record<string, Product>; equipCollapsed: Record<string, boolean>; streetCollapsed: Record<string, boolean>; onToggleEquip: (id: string) => void; onToggleStreet: (id: string) => void; selectedProduct: string | null; onAllocate: (id: string, pid: string, slot: 1 | 2) => void; onBulkFill: (equipId: string, nivel: number | null) => void; onCollect: (id: string, p: Product) => void; highlightProductId: string | null; colWidth: number; compact: boolean
}) {
  const collapsed = !!streetCollapsed[street.id]
  return (
    <div style={{ width: colWidth, flexShrink: 0, borderRight: '1px solid var(--map-col-border)', paddingRight: 8, overflowY: 'auto', minHeight: 0 }}>
      <div onClick={() => onToggleStreet(street.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px', cursor: 'pointer', marginBottom: 4, borderBottom: '1px solid var(--map-col-border)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--map-street-text)' }}>{street.nome}</span>
        <span style={{ fontSize: 9, color: 'var(--map-text-muted)', marginLeft: 'auto' }}>{street.equipment.length} equip.</span>
        <span style={{ fontSize: 9, color: 'var(--map-text-muted)' }}>{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && street.equipment.map(eq => (
        <EquipmentBlock
          key={eq.id} equip={eq} allocations={allocations} productMap={productMap}
          collapsed={!!equipCollapsed[eq.id]} onToggle={e => { if (!e.metaKey && !e.ctrlKey) onToggleEquip(eq.id) }}
          selectedProduct={selectedProduct} onAllocate={onAllocate} onBulkFill={onBulkFill} onCollect={onCollect}
          highlightProductId={highlightProductId} compact={compact}
        />
      ))}
    </div>
  )
}

// ── MapPage ────────────────────────────────────────────────────────────────────
export default function MapPage() {
  const [mapState, dispatch] = useReducer(reducer, initState)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [tweakOpen, setTweakOpen] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const addrStore = useAddressingStore()
  const configStore = useConfigStore()
  const tweaks = useTweaksStore()

  // Load data on mount
  useEffect(() => {
    if (!addrStore.loaded && !addrStore.loading) {
      addrStore.setLoading(true)
      getInitialData().then(data => {
        addrStore.setFromApiResponse(data)
        const locationMap = JSON.parse(data.product_location_map_json ?? '{}') as Record<string, Allocation>
        const unallocatedMap = JSON.parse(data.unallocated_products_json ?? '{}') as Record<string, Record<string, unknown>>
        // Use product_code as ID so it matches productMap keys
        const unallocated = Object.values(unallocatedMap)
          .map((p) => String(p.product_code ?? p.id ?? '').trim())
          .filter(Boolean)
        // Build map structure from equipTypes
        const equipTypes = JSON.parse(data.equipTypesJson ?? '[]') as Array<{ id: string; type: string; niveis?: number; escsPerNivel?: number; cap?: number }>
        const streetMap: Record<string, Street> = {}
        equipTypes.forEach(et => {
          const parts = et.id.split('-')
          const streetId = parts[0] ?? et.id
          if (!streetMap[streetId]) streetMap[streetId] = { id: streetId, nome: `Rua ${streetId.replace('R', '')}`, equipment: [] }
          streetMap[streetId]!.equipment.push({ id: et.id, tipo: et.type ?? 'prateleira', niveis: et.niveis ?? 5, escsPerNivel: et.escsPerNivel ?? 7, cap: et.cap ?? 25.92 })
        })
        const mapStructure = Object.values(streetMap).sort((a, b) => parseInt(a.id.replace('R', '')) - parseInt(b.id.replace('R', '')))
        dispatch({ type: 'INIT', mapStructure, allocations: locationMap, unallocated })
      }).catch(e => addrStore.setError(String(e)))
    } else if (addrStore.loaded && mapState.mapStructure.length === 0) {
      // Already loaded, hydrate from store
      dispatch({ type: 'INIT', mapStructure: [], allocations: addrStore.allocations, unallocated: Object.keys(addrStore.unallocated) })
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }) }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); dispatch({ type: 'REDO' }) }
      if (e.key === 'Escape') {
        if (mapState.pendingConfirm) dispatch({ type: 'CLEAR_CONFIRM' })
        else if (mapState.swapSource) dispatch({ type: 'CLEAR_SWAP_SOURCE' })
        else if (mapState.highlightProductId) dispatch({ type: 'CLEAR_HIGHLIGHT' })
        else if (mapState.configOpen) dispatch({ type: 'CLOSE_PANEL' })
        else if (mapState.openPanel) dispatch({ type: 'CLOSE_PANEL' })
        else if (mapState.selectedProduct) dispatch({ type: 'SELECT_PRODUCT', productId: null })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [mapState.pendingConfirm, mapState.swapSource, mapState.highlightProductId, mapState.configOpen, mapState.openPanel, mapState.selectedProduct])

  // Auto-clear highlight
  useEffect(() => {
    if (!mapState.highlightProductId) return
    const t = window.setTimeout(() => dispatch({ type: 'CLEAR_HIGHLIGHT' }), 4000)
    return () => window.clearTimeout(t)
  }, [mapState.highlightProductId])

  // Dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-dse-theme', tweaks.dark ? 'dark' : 'light')
  }, [tweaks.dark])

  const handleAllocate = useCallback((id: string, pid: string, slot: 1 | 2) => dispatch({ type: 'ALLOCATE', escaninhoId: id, productId: pid, slot }), [])
  const handleCollect = useCallback((id: string, p: Product) => dispatch({ type: 'COLLECT', escaninhoId: id, product: p }), [])

  const handleBulkFill = useCallback((equipId: string, nivel: number | null) => {
    const pid = mapState.selectedProduct
    if (!pid) return
    const product = addrStore.productMap[pid]
    if (!product) return
    const equip = mapState.mapStructure.flatMap(s => s.equipment).find(e => e.id === equipId)
    if (!equip) return
    const moves: Array<{ escaninhoId: string; productCode: string }> = []
    const niveis = nivel !== null ? [nivel] : Array.from({ length: equip.niveis }, (_, i) => i + 1)
    for (const nv of niveis) {
      if (!canPlace(product, equip.tipo, nv, equip.niveis)) continue
      for (let si = 1; si <= equip.escsPerNivel; si++) {
        const locId = `${equipId}-${nv}-${si}`
        const alloc = mapState.allocations[locId]
        if (alloc?.p1) continue  // slot ocupado
        moves.push({ escaninhoId: locId, productCode: pid })
      }
    }
    if (moves.length > 0) dispatch({ type: 'BULK_ALLOCATE', moves })
  }, [mapState.selectedProduct, mapState.mapStructure, mapState.allocations, addrStore.productMap])

  const handleSuggest = useCallback(async () => {
    if (suggesting || mapState.unallocated.length === 0) return
    setSuggesting(true)
    setSuggestError(null)
    try {
      const productMap = addrStore.productMap
      const products = mapState.unallocated.map(code => productMap[code]).filter(Boolean) as Product[]
      const res = await suggestAllocations({
        unallocated_codes: mapState.unallocated,
        products_data: products,
        map_structure: mapState.mapStructure,
        allocations: mapState.allocations as Record<string, { p1: string | null; p2: string | null }>,
        options: {},
      })
      if (!res.success) { setSuggestError(res.error ?? 'Erro ao sugerir alocações.'); return }
      if (res.moves.length === 0) { setSuggestError('Nenhum produto pôde ser alocado com as regras atuais.'); return }
      dispatch({ type: 'BULK_ALLOCATE', moves: res.moves })
    } catch (e) {
      setSuggestError(String(e))
    } finally {
      setSuggesting(false)
    }
  }, [suggesting, mapState.unallocated, mapState.mapStructure, mapState.allocations, addrStore.productMap])

  const handleSaveVersion = useCallback(async (name: string, setProgress: (n: number) => void) => {
    setProgress(45)
    // diff moves — simplified: just save the version with current name
    setProgress(80)
    const vRes = await saveVersion(name)
    if (!vRes?.success) throw new Error(vRes?.error ?? 'Não foi possível salvar a versão.')
    setProgress(95)
  }, [])

  const productMap = addrStore.loaded ? addrStore.productMap : {}
  const compact = tweaks.density === 'compact'

  const canUndo = mapState.histIdx > 0
  const canRedo = mapState.histIdx < mapState.history.length - 1

  return (
    <div data-dse-theme={tweaks.dark ? 'dark' : 'light'} style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)', fontFamily: 'var(--font-sans)' }}>
      {/* Toolbar */}
      <div style={{ height: 48, background: 'var(--shopper-navy)', display: 'flex', alignItems: 'center', paddingLeft: 14, paddingRight: 10, flexShrink: 0, zIndex: 20, gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 5 }}>
          <img src="/shopper-static/uploads/shopper-icon.avif" alt="Shopper" width="28" height="28" style={{ borderRadius: 5, objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>Endereçamento</span>
        </div>
        <Sep />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 5 }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Loja</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: configStore.selectedStore ? '#fff' : 'rgba(255,255,255,0.28)' }}>{configStore.selectedStore?.nome ?? '—'}</span>
        </div>
        <div style={{ flex: 1 }} />
        <SearchBar products={addrStore.products} allocations={mapState.allocations}
          onHighlight={(id, locs) => dispatch({ type: 'HIGHLIGHT_AND_NAVIGATE', productId: id, locs })} />
        <Sep />
        <TBtn icon="↩" onClick={() => dispatch({ type: 'UNDO' })} disabled={!canUndo} title="Desfazer (Ctrl+Z)" />
        <TBtn icon="↪" onClick={() => dispatch({ type: 'REDO' })} disabled={!canRedo} title="Refazer (Ctrl+Y)" />
        <Sep />
        <ActionsDropdown dispatch={dispatch} />
        <Sep />
        <button onClick={() => setSaveModalOpen(true)} title="Salvar versão do endereçamento"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 5, cursor: 'pointer', border: '1px solid rgba(13,171,119,0.4)', background: 'rgba(13,171,119,0.15)', color: '#3DD4A6', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>↑</span>
          <span>Salvar</span>
        </button>
        <Sep />
        <TBtn icon="◈" label="Métricas" active={mapState.openPanel === 'metrics'} onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'metrics' })} />
        <TBtn icon="⧗" label="Versões" active={mapState.openPanel === 'versions'} onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'versions' })} />
        <TBtn icon="?" label="Legenda" active={mapState.openPanel === 'legend'} onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'legend' })} />
        <Sep />
        <TBtn icon="⚙" active={mapState.configOpen} onClick={() => dispatch({ type: 'TOGGLE_CONFIG' })} title="Configuração" />
        <TBtn icon="☰" label="Prancheta" active={mapState.pranchetaOpen} onClick={() => dispatch({ type: 'TOGGLE_PRANCHETA' })} title="Prancheta" />
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {suggestError && (
          <div onClick={() => setSuggestError(null)} style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: '#7F1D1D', color: '#FCA5A5', fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer', maxWidth: 440, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
            {suggestError} <span style={{ opacity: 0.6, marginLeft: 8 }}>✕</span>
          </div>
        )}
        {addrStore.loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', zIndex: 10 }}>
            <div style={{ fontSize: 14, color: 'var(--map-text-muted)' }}>Carregando mapa…</div>
          </div>
        )}
        {addrStore.error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', zIndex: 10 }}>
            <div style={{ fontSize: 13, color: '#EF4444', maxWidth: 480, textAlign: 'center', padding: 24 }}>{addrStore.error}</div>
          </div>
        )}

        {/* Map canvas — horizontal scroll only; columns stretch to full height and scroll independently */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: 12, display: 'flex', gap: 12 }}>
          {mapState.mapStructure.map(street => (
            <StreetColumn
              key={street.id} street={street} allocations={mapState.allocations} productMap={productMap}
              equipCollapsed={mapState.equipCollapsed} streetCollapsed={mapState.streetCollapsed}
              onToggleEquip={id => dispatch({ type: 'TOGGLE_EQUIP', id })}
              onToggleStreet={id => dispatch({ type: 'TOGGLE_STREET', id })}
              selectedProduct={mapState.selectedProduct}
              onAllocate={handleAllocate} onBulkFill={handleBulkFill} onCollect={handleCollect}
              highlightProductId={mapState.highlightProductId}
              colWidth={tweaks.colWidth} compact={compact}
            />
          ))}
        </div>

        {/* Prancheta */}
        {mapState.pranchetaOpen && (
          <Prancheta
            collected={mapState.collected}
            unallocated={mapState.unallocated}
            productMap={productMap}
            selectedProduct={mapState.selectedProduct}
            onSelectProduct={id => dispatch({ type: 'SELECT_PRODUCT', productId: id })}
            mode2aLeva={mapState.mode2aLeva}
            onToggle2aLeva={() => dispatch({ type: 'TOGGLE_2A_LEVA' })}
            width={300}
          />
        )}

        {/* Allocation hint */}
        {mapState.selectedProduct && (
          <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: 'rgba(13,171,119,0.96)', borderRadius: 20, padding: '7px 18px', fontSize: 11, fontWeight: 700, color: '#fff', pointerEvents: 'none', boxShadow: '0 4px 20px rgba(13,171,119,0.4)' }}>
            Clique em escaninho vazio para alocar · ESC cancela
          </div>
        )}

        {/* Config overlay */}
        {mapState.configOpen && (
          <ConfigPage asOverlay onClose={() => dispatch({ type: 'CLOSE_PANEL' })} />
        )}

        {/* Panels */}
        {mapState.openPanel === 'metrics' && (
          <MetricsPanel
            allocations={mapState.allocations}
            productMap={productMap}
            streets={mapState.mapStructure}
            onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
          />
        )}
        {mapState.openPanel === 'versions' && (
          <VersionsPanel onClose={() => dispatch({ type: 'CLOSE_PANEL' })} onRestore={() => window.location.reload()} />
        )}
        {mapState.openPanel === 'legend' && (
          <LegendPanel onClose={() => dispatch({ type: 'CLOSE_PANEL' })} />
        )}
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        dialog={mapState.pendingConfirm}
        onConfirm={() => { mapState.pendingConfirm?.onConfirm(); dispatch({ type: 'CLEAR_CONFIRM' }) }}
        onCancel={() => dispatch({ type: 'CLEAR_CONFIRM' })}
      />

      {/* Save modal */}
      {saveModalOpen && (
        <SaveModal onClose={() => setSaveModalOpen(false)} onSave={handleSaveVersion} />
      )}

      {/* Tweaks panel */}
      <TweaksPanel open={tweakOpen} onClose={() => setTweakOpen(false)}>
        <TweakSection label="Aparência" />
        <TweakToggle label="Dark mode" value={tweaks.dark} onChange={v => tweaks.setDark(v)} />
        <TweakSection label="Mapa" />
        <TweakRadio label="Densidade" value={tweaks.density} options={['compact', 'balanced', 'spacious']} onChange={v => tweaks.setDensity(v as 'compact' | 'balanced' | 'spacious')} />
        <TweakSlider label="Largura da coluna" value={tweaks.colWidth} min={280} max={700} step={10} unit="px" onChange={v => tweaks.setColWidth(v)} />
      </TweaksPanel>
    </div>
  )
}
