// Escaninho — core visual cell (migrated from dse-escaninho.jsx)
// Note: no data normalization here; data is expected pre-normalized by the backend.

export const CURVA_COLOR: Record<string, string> = {
  A: '#0DAB77', B: '#3B82F6', C: '#F59E0B', D: '#F97316', E: '#EF4444',
}

export const GROUP_STYLE: Record<string, { bg: string; badge: string; text: string; label: string }> = {
  FLV:        { bg: 'rgba(13,171,119,0.13)',  badge: 'rgba(13,171,119,0.22)',  text: '#0DAB77', label: 'FLV' },
  Alimento:   { bg: 'rgba(152,108,60,0.09)',  badge: 'rgba(152,108,60,0.20)',  text: '#8B6332', label: 'ALM' },
  Bebidas:    { bg: 'rgba(59,130,246,0.11)',  badge: 'rgba(59,130,246,0.22)',  text: '#2563EB', label: 'BEB' },
  Perfumaria: { bg: 'rgba(236,72,153,0.10)',  badge: 'rgba(236,72,153,0.22)',  text: '#BE185D', label: 'PRF' },
  Químico:    { bg: 'rgba(239,68,68,0.13)',   badge: 'rgba(239,68,68,0.22)',   text: '#DC2626', label: 'QMC' },
  Neutro:     { bg: 'rgba(148,163,184,0.09)', badge: 'rgba(148,163,184,0.18)', text: '#64748B', label: 'NEU' },
}

const FLAG_DEF: Record<string, { sym: string; color: string; title: string }> = {
  quimico:  { sym: '⚠', color: '#EF4444', title: 'Produto Químico — restrição crítica' },
  pesado:   { sym: '⬤', color: '#92400E', title: 'Pesado (>5 kg)' },
  alto:     { sym: '↑', color: '#EF4444', title: 'Alto (>30 cm)' },
  pequeno:  { sym: '↓', color: '#0891B2', title: 'Item pequeno / compacto' },
  fragil:   { sym: '◇', color: '#A855F7', title: 'Frágil' },
  degelo:   { sym: '❄', color: '#38BDF8', title: 'Degelo = NÃO' },
  faltaEsc: { sym: '!', color: '#F97316', title: 'Falta escaninho' },
  origem:   { sym: '⇌', color: '#8B5CF6', title: 'Em transição / Origem' },
}

interface FlagBadgeProps {
  type: string
  size?: number
}

function FlagBadge({ type, size = 9 }: FlagBadgeProps) {
  const d = FLAG_DEF[type]
  if (!d) return null
  return (
    <span title={d.title} style={{ fontSize: size, color: d.color, lineHeight: 1, fontWeight: 800, flexShrink: 0 }}>
      {d.sym}
    </span>
  )
}

export interface EscaninhoProduct {
  id: string
  nome: string
  grupo: string
  curva: string
  sub: string
  degelo: string
  pesado: boolean
  alto: boolean
  pequeno: boolean
  fragil: boolean
  quimico: boolean
  escsNec: number
}

function getFlags(product: EscaninhoProduct): string[] {
  const flags: string[] = []
  if (product.quimico) flags.push('quimico')
  else {
    if (product.pesado) flags.push('pesado')
    if (product.alto) flags.push('alto')
  }
  if (product.pequeno) flags.push('pequeno')
  if (product.degelo === 'NÃO') flags.push('degelo')
  return flags
}

interface EscaninhoProps {
  id: string
  product1: EscaninhoProduct | null
  product2: EscaninhoProduct | null
  isHighlighted: boolean
  isSelected: boolean
  compact: boolean
  onClickEmpty: (id: string, slot: 1 | 2) => void
  onClickOccupied: (id: string, product: EscaninhoProduct, slot: 1 | 2) => void
}

function ProductHalf({ product, compact }: { product: EscaninhoProduct; compact: boolean }) {
  const gs = GROUP_STYLE[product.grupo] ?? GROUP_STYLE['Neutro']!
  const cc = CURVA_COLOR[product.curva] ?? '#94A3B8'
  const flags = getFlags(product)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: compact ? '2px 4px' : '3px 5px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <span style={{ fontSize: compact ? 8 : 9, fontWeight: 800, color: cc, flexShrink: 0 }}>{product.curva}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {flags.slice(0, 2).map(f => <FlagBadge key={f} type={f} size={compact ? 7 : 9} />)}
        </div>
      </div>
      <div style={{ fontSize: compact ? 8 : 9, fontWeight: 600, color: 'var(--esc-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
        {product.nome}
      </div>
      <div style={{ fontSize: compact ? 7 : 8, color: gs.text, fontWeight: 700 }}>{gs.label}</div>
    </div>
  )
}

function EmptySlot({ compact }: { compact: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.18 }}>
      <span style={{ fontSize: compact ? 9 : 11, color: 'var(--esc-empty-text)' }}>+</span>
    </div>
  )
}

export default function Escaninho({
  id, product1, product2, isHighlighted, isSelected, compact,
  onClickEmpty, onClickOccupied,
}: EscaninhoProps) {
  const hasP2 = product1 !== null && product2 !== null
  const slotH = compact ? 22 : 28

  const handleClick = (slot: 1 | 2, e: React.MouseEvent) => {
    e.stopPropagation()
    const product = slot === 1 ? product1 : product2
    if (product) onClickOccupied(id, product, slot)
    else onClickEmpty(id, slot)
  }

  const border = isHighlighted
    ? '1px solid #0DAB77'
    : isSelected
    ? '1px solid rgba(99,102,241,0.7)'
    : '1px solid var(--esc-border)'

  return (
    <div
      style={{
        border,
        borderRadius: 4,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: hasP2 ? 'column' : 'row',
        height: hasP2 ? slotH * 2 : slotH,
        background: isHighlighted ? 'rgba(13,171,119,0.07)' : 'var(--esc-bg)',
        transition: 'border-color 0.15s',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {/* Slot 1 */}
      <div
        onClick={e => handleClick(1, e)}
        style={{ flex: 1, overflow: 'hidden', borderBottom: hasP2 ? '1px solid var(--esc-divider)' : 'none' }}
      >
        {product1 ? <ProductHalf product={product1} compact={compact} /> : <EmptySlot compact={compact} />}
      </div>
      {/* Slot 2 (only shown when slot 1 is occupied) */}
      {product1 && (
        <div
          onClick={e => handleClick(2, e)}
          style={{ flex: 1, overflow: 'hidden' }}
        >
          {product2 ? <ProductHalf product={product2} compact={compact} /> : <EmptySlot compact={compact} />}
        </div>
      )}
    </div>
  )
}
