// LegendPanel — migrated from dse-panels.jsx
import { GROUP_STYLE } from '../Escaninho'

function Overlay({ title, onClose, width, children }: { title: string; onClose: () => void; width: number; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: 52 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{ position: 'relative', width, maxWidth: '96vw', height: 'calc(100vh - 52px)', display: 'flex', flexDirection: 'column', background: 'var(--panel-bg)', borderLeft: '1px solid var(--panel-border)', boxShadow: '-20px 0 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--panel-text)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--panel-muted)', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>{children}</div>
      </div>
    </div>
  )
}

const equipTypes: [string, string, string][] = [
  ['PRT', 'Prateleira', '#64748B'], ['PMP', 'Prateleira Pamplona', '#7C3AED'],
  ['GLD', 'Geladeira', '#2563EB'], ['GDA', 'Geladeira Alta', '#1D4ED8'],
  ['GDG', 'Geladeira de Gerador', '#D97706'], ['FRZ', 'Freezer', '#0891B2'], ['QMC', 'Químico', '#DC2626'],
]

const flags: [string, string, string][] = [
  ['⚠', '#EF4444', 'Produto Químico — crítico'],
  ['⬤', '#92400E', 'Pesado (>5 kg)'],
  ['↑', '#F59E0B', 'Alto (>30 cm)'],
  ['↓', '#0891B2', 'Item pequeno / compacto'],
  ['❄', '#38BDF8', 'Degelo = NÃO'],
  ['!', '#F97316', 'Falta escaninho'],
  ['⇌', '#8B5CF6', 'Em transição / Origem'],
]

const atalhos: [string, string][] = [
  ['Clique em vazio', 'Aloca produto selecionado'],
  ['Clique em ocupado', 'Recolhe produto p/ prancheta'],
  ['Shift + clique vazio', 'Aloca em todos os vazios do nível'],
  ['Cmd/Ctrl + clique vazio', 'Aloca em todos os vazios do equipamento'],
  ['Shift + clique ocupado', 'Recolhe todos do nível'],
  ['Cmd/Ctrl + clique ocupado', 'Recolhe todos do equipamento'],
  ['Alt + clique', 'Adiciona como 2º slot'],
  ['Alt + Shift + clique', '2º slot em todos do nível'],
  ['Ctrl+Z / Cmd+Z', 'Desfazer'],
  ['Ctrl+Y / Cmd+Y', 'Refazer'],
  ['Escape', 'Fechar sobreposição / cancelar seleção'],
]

function Section({ label }: { label: string }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--panel-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '16px 0 8px' }}>{label}</div>
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 11 }}>{children}</div>
}

interface LegendPanelProps {
  onClose: () => void
}

export default function LegendPanel({ onClose }: LegendPanelProps) {
  const grupos = Object.entries(GROUP_STYLE).map(([g, s]) => [g, s.text, s.bg] as [string, string, string])

  return (
    <Overlay title="Legenda e atalhos" onClose={onClose} width={360}>
      <Section label="Tipos de equipamento" />
      {equipTypes.map(([code, label, color]) => (
        <Row key={code}>
          <span style={{ width: 36, fontSize: 9, fontWeight: 800, color, background: `${color}18`, padding: '2px 5px', borderRadius: 3, textAlign: 'center', flexShrink: 0 }}>{code}</span>
          <span style={{ color: 'var(--panel-text)' }}>{label}</span>
        </Row>
      ))}

      <Section label="Grupos de produto" />
      {grupos.map(([g, text, bg]) => (
        <Row key={g}>
          <span style={{ width: 36, fontSize: 9, fontWeight: 800, color: text, background: bg, padding: '2px 5px', borderRadius: 3, textAlign: 'center', flexShrink: 0 }}>
            {GROUP_STYLE[g]?.label}
          </span>
          <span style={{ color: 'var(--panel-text)' }}>{g}</span>
        </Row>
      ))}

      <Section label="Indicadores de status" />
      {flags.map(([sym, color, label]) => (
        <Row key={label}>
          <span style={{ width: 28, textAlign: 'center', fontSize: 12, color, fontWeight: 800, flexShrink: 0 }}>{sym}</span>
          <span style={{ color: 'var(--panel-text)' }}>{label}</span>
        </Row>
      ))}

      <Section label="Atalhos de teclado" />
      {atalhos.map(([k, v]) => (
        <Row key={k}>
          <span style={{ width: 170, fontSize: 10, fontFamily: 'var(--font-numeric)', color: 'var(--panel-muted)', flexShrink: 0 }}>{k}</span>
          <span style={{ color: 'var(--panel-text)', fontSize: 10 }}>{v}</span>
        </Row>
      ))}
    </Overlay>
  )
}
