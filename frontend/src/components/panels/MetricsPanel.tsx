// MetricsPanel — migrated from dse-panels.jsx
import { useState, useMemo } from 'react'
import type { Allocation } from '../../store/addressing'
import type { Product } from '../../store/addressing'
import { CURVA_COLOR } from '../Escaninho'

interface Street {
  id: string
  nome: string
  equipment: Equipment[]
}

interface Equipment {
  id: string
  tipo: string
  niveis: number
  escsPerNivel: number
}

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

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--panel-surface)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--panel-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? 'var(--panel-text)', fontFamily: 'var(--font-numeric)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--panel-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function CurvaBar({ distribution }: { distribution: Record<string, number> }) {
  const [hov, setHov] = useState<string | null>(null)
  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 2, height: 8, borderRadius: 3, overflow: 'hidden', width: '100%' }}>
        {['A', 'B', 'C', 'D', 'E'].map(c => {
          const count = distribution[c] ?? 0
          const pct = count / total * 100
          if (!pct) return null
          return (
            <div key={c} style={{ flex: `0 0 ${pct}%`, background: CURVA_COLOR[c], height: '100%', cursor: 'default' }}
              onMouseEnter={() => setHov(c)} onMouseLeave={() => setHov(null)} />
          )
        })}
      </div>
      {hov && distribution[hov] && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 5px)', left: '50%', transform: 'translateX(-50%)', background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '4px 9px', fontSize: 11, fontWeight: 700, color: CURVA_COLOR[hov] ?? '#fff', whiteSpace: 'nowrap', zIndex: 20, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          Curva {hov} · {distribution[hov]} produtos
        </div>
      )}
    </div>
  )
}

const TYPE_LABELS: Record<string, string> = {
  prateleira: 'Prateleiras', prateleira_pamplona: 'Prat. Pamplona',
  geladeira: 'Geladeiras', geladeira_alta: 'Geladeiras Altas',
  geladeira_gerador: 'Gel. Gerador', freezer: 'Freezers', quimico: 'Químico',
}

interface MetricsPanelProps {
  allocations: Record<string, Allocation>
  productMap: Record<string, Product>
  streets: Street[]
  onClose: () => void
}

export default function MetricsPanel({ allocations, productMap, streets, onClose }: MetricsPanelProps) {
  const metrics = useMemo(() => {
    let totalSlots = 0, filledSlots = 0
    const streetStats: Record<string, { filled: number; total: number; nome: string }> = {}
    const equipTypeStats: Record<string, { count: number; empty: number; curvaDist: Record<string, number>; totalA: number; gerador: number }> = {}
    const allocatedSkus = new Set<string>()

    streets.forEach(street => {
      let sf = 0, st = 0
      street.equipment.forEach(eq => {
        const tipo = eq.tipo
        if (!equipTypeStats[tipo]) equipTypeStats[tipo] = { count: 0, empty: 0, curvaDist: {}, totalA: 0, gerador: 0 }
        equipTypeStats[tipo]!.count++
        let eqFilled = 0
        for (let n = 1; n <= eq.niveis; n++) {
          for (let s = 1; s <= eq.escsPerNivel; s++) {
            totalSlots++; st++
            const key = `${eq.id}-${n}-${s}`
            const alloc = allocations[key]
            if (alloc?.p1) {
              filledSlots++; sf++; eqFilled++
              const p = productMap[alloc.p1]
              if (p) {
                allocatedSkus.add(p.id)
                const c = p.curva || 'E'
                equipTypeStats[tipo]!.curvaDist[c] = (equipTypeStats[tipo]!.curvaDist[c] ?? 0) + 1
                if (c === 'A') equipTypeStats[tipo]!.totalA++
                if (p.degelo === 'NÃO') equipTypeStats[tipo]!.gerador++
              }
            }
          }
        }
        if (eqFilled === 0) equipTypeStats[tipo]!.empty++
      })
      streetStats[street.id] = { filled: sf, total: st, nome: street.nome }
    })

    return { totalSlots, filledSlots, allocatedSkus: allocatedSkus.size, streetStats, equipTypeStats }
  }, [allocations, productMap, streets])

  const fillPct = metrics.totalSlots > 0 ? Math.round(metrics.filledSlots / metrics.totalSlots * 100) : 0

  return (
    <Overlay title="Métricas da loja" onClose={onClose} width={400}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--panel-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Visão geral</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <StatCard label="Taxa de ocupação" value={`${fillPct}%`}
            sub={`${metrics.filledSlots} / ${metrics.totalSlots} escaninhos`}
            accent={fillPct >= 75 ? '#0DAB77' : fillPct >= 40 ? '#F59E0B' : '#EF4444'} />
          <StatCard label="SKUs alocados" value={metrics.allocatedSkus} />
        </div>
        <div style={{ height: 6, background: 'var(--panel-border)', borderRadius: 3, marginBottom: 4 }}>
          <div style={{ height: '100%', width: `${fillPct}%`, background: 'var(--shopper-green)', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--panel-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Por rua</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(metrics.streetStats).map(([sid, s]) => {
            const pct = s.total > 0 ? Math.round(s.filled / s.total * 100) : 0
            const color = pct >= 75 ? '#0DAB77' : pct >= 40 ? '#F59E0B' : '#EF4444'
            return (
              <div key={sid} style={{ background: 'var(--panel-surface)', border: '1px solid var(--panel-border)', borderRadius: 7, padding: '9px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--panel-text)' }}>{sid} <span style={{ fontWeight: 400, color: 'var(--panel-muted)' }}>{s.nome}</span></span>
                  <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: 'var(--font-numeric)' }}>{pct}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--panel-border)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 9, color: 'var(--panel-muted)', marginTop: 4 }}>{s.filled} / {s.total} escaninhos</div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--panel-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Por tipo de equipamento</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(metrics.equipTypeStats).map(([tipo, s]) => (
            <div key={tipo} style={{ background: 'var(--panel-surface)', border: '1px solid var(--panel-border)', borderRadius: 7, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--panel-text)' }}>{TYPE_LABELS[tipo] ?? tipo}</span>
                <span style={{ fontSize: 9, color: 'var(--panel-muted)' }}>{s.count} equip. · {s.empty} vaz.</span>
              </div>
              <CurvaBar distribution={s.curvaDist} />
              <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 9, color: 'var(--panel-muted)' }}>
                <span>Curva A: <strong style={{ color: 'var(--panel-text)' }}>{s.totalA}</strong></span>
                {tipo.includes('geladeira') && <span>Gerador: <strong style={{ color: '#F59E0B' }}>{s.gerador}</strong></span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  )
}
