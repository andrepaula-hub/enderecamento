// ConfigPage — migrated from dse-config.jsx
// All API calls are async (fetch-based). No window.DSEApi.
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { listStores } from '../api/stores'
import { connectSheets } from '../api/workflow'
import { runEtl, getJobStatus, buildSalesTarget, exportSalesXlsx } from '../api/etl'
import type { JobResponse } from '../api/etl'
import { generateSlotsFromCadastro } from '../api/addressing'
import { importCard175Metabase } from '../api/card175'
import { useUIStore } from '../store/ui'
import { useConfigStore } from '../store/config'
import type { StoreInfo } from '../api/types'

interface LogEntry { msg: string; type: 'success' | 'error' | 'info' | 'warn'; ts: string }

const COLOR_MAP: Record<string, string> = {
  success: '#0DAB77', error: '#EF4444', info: '#94A3B8', warn: '#F59E0B',
}

function LogItem({ entry }: { entry: LogEntry }) {
  const color = COLOR_MAP[entry.type] ?? COLOR_MAP['info']!
  const sym = entry.type === 'success' ? '✓' : entry.type === 'error' ? '✕' : entry.type === 'warn' ? '⚠' : '·'
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--cfg-border)', fontSize: 11, lineHeight: 1.45, fontFamily: 'var(--font-numeric)' }}>
      <span style={{ color, flexShrink: 0, marginTop: 1, fontWeight: 700 }}>{sym}</span>
      <span style={{ color: 'var(--cfg-text-muted)', flexShrink: 0 }}>{entry.ts}</span>
      <span style={{ color: 'var(--cfg-text)', flex: 1, wordBreak: 'break-word' }}>{entry.msg}</span>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, monospace }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; monospace?: boolean }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--cfg-text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'https://docs.google.com/spreadsheets/…'}
        style={{ width: '100%', padding: '6px 10px', fontSize: 11, fontFamily: monospace ? 'var(--font-numeric)' : 'var(--font-sans)', background: 'var(--cfg-input-bg)', border: '1px solid var(--cfg-border)', borderRadius: 5, color: 'var(--cfg-text)', outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  )
}

function CfgBtn({ label, onClick, primary, disabled, loading }: { label: string; onClick: () => void; primary?: boolean; disabled?: boolean; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled ?? loading}
      style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: disabled ?? loading ? 'default' : 'pointer', border: primary ? 'none' : '1px solid var(--cfg-border)', background: primary ? 'var(--shopper-green)' : 'var(--cfg-input-bg)', color: primary ? '#fff' : 'var(--cfg-text)', opacity: disabled ?? loading ? 0.5 : 1, fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 5 }}
    >
      {loading && <span style={{ display: 'inline-block', width: 8, height: 8, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'dse-spin 0.7s linear infinite' }} />}
      {label}
    </button>
  )
}

function smallBtnStyle(bg: string, border: string, color: string): React.CSSProperties {
  return { background: bg, border: `1px solid ${border}`, color, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
}

const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--cfg-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--cfg-text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }

function StoreCheckboxes({ stores, selected, onChange }: { stores: StoreInfo[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) => onChange(
    selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginTop: 6 }}>
      {stores.map(s => (
        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cfg-text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
            style={{ accentColor: 'var(--shopper-green)', width: 12, height: 12 }} />
          {s.nome}
        </label>
      ))}
    </div>
  )
}

interface ConfigPageProps {
  asOverlay?: boolean
  onClose?: () => void
}

export default function ConfigPage({ asOverlay = false, onClose }: ConfigPageProps) {
  const openMap = useUIStore(s => s.openMap)
  const { selectedStore, sheetLinks, setSelectedStore, setSheetLink } = useConfigStore()

  const [flow, setFlow] = useState(1)
  const [loja, setLoja] = useState('')
  const [dates, setDates] = useState({ ini: '2026-01-01', fim: '2026-01-31' })
  const [lojas, setLojas] = useState<string[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState<{ val: number; label: string } | null>(null)
  const [status, setStatus] = useState<{ msg: string; type: string }>({ msg: 'Aguardando configuração.', type: 'info' })
  const [running, setRunning] = useState<string | null>(null)
  const [autoOpen, setAutoOpen] = useState(false)
  const [etlJobId, setEtlJobId] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const { data: storesData } = useQuery({ queryKey: ['stores'], queryFn: listStores })
  const stores = storesData ?? []

  // Polling de status do job ETL
  const { data: jobStatus } = useQuery<JobResponse>({
    queryKey: ['job', etlJobId],
    queryFn: () => getJobStatus(etlJobId!),
    enabled: !!etlJobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'done' || s === 'failed' ? false : 2000
    },
  })

  // Reage ao fim do job ETL
  useEffect(() => {
    if (!jobStatus) return
    if (jobStatus.status === 'done') {
      setProgress({ val: 100, label: 'ETL concluído.' })
      addLog('ETL concluído com sucesso.', 'success')
      setStatusMsg('ETL concluído.', 'success')
      setRunning(null)
      setTimeout(() => setProgress(null), 500)
      setEtlJobId(null)
    } else if (jobStatus.status === 'failed') {
      const errMsg = jobStatus.error ?? 'Falha ao rodar ETL.'
      addLog(errMsg, 'error')
      setStatusMsg(errMsg, 'error')
      setRunning(null)
      setTimeout(() => setProgress(null), 500)
      setEtlJobId(null)
    } else if (jobStatus.status === 'running') {
      setProgress({ val: 60, label: 'ETL em execução…' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobStatus?.status])

  const runEtlMutation = useMutation({
    mutationFn: runEtl,
    onSuccess: (data: JobResponse) => {
      if (data.job_id) {
        setEtlJobId(data.job_id)
        setProgress({ val: 35, label: 'Job ETL enfileirado…' })
        addLog(`Job ETL iniciado (id: ${data.job_id})`, 'info')
      }
    },
    onError: (err: unknown) => {
      const msg = String(err)
      addLog(msg, 'error')
      setStatusMsg(msg, 'error')
      setRunning(null)
      setProgress(null)
    },
  })

  const now = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const addLog = (msg: string, type: LogEntry['type'] = 'info') =>
    setLogs(l => [...l, { msg, type, ts: now() }])
  const setStatusMsg = (msg: string, type = 'info') => setStatus({ msg, type })

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.parentElement?.scrollTo(0, logsEndRef.current.parentElement.scrollHeight)
    }
  }, [logs])

  const handleSaveLinks = async () => {
    if (!sheetLinks.etl || !sheetLinks.mix) {
      setStatusMsg('Erro: links obrigatórios faltando.', 'error')
      addLog('Erro: preencha todos os links antes de salvar.', 'error')
      return
    }
    setRunning('save')
    setProgress({ val: 25, label: 'Conectando planilhas…' })
    addLog('Conectando Endereçamento, ETL e Mix…', 'info')
    try {
      const target = flow === 1 ? sheetLinks.ender : sheetLinks.mapaEq
      const response = await connectSheets(target, sheetLinks.etl, sheetLinks.mix)
      if (response?.success) {
        setProgress({ val: 100, label: 'Links salvos com sucesso.' })
        addLog('Links salvos com sucesso.', 'success')
        setStatusMsg('Links salvos com sucesso.', 'success')
      } else {
        throw new Error(response?.error ?? 'Não foi possível conectar as planilhas.')
      }
    } catch (err) {
      addLog(String(err), 'error')
      setStatusMsg(String(err), 'error')
    } finally {
      setRunning(null)
      setTimeout(() => setProgress(null), 500)
    }
  }

  const handleETL = () => {
    setRunning('etl')
    setProgress({ val: 20, label: 'Enfileirando ETL…' })
    addLog('Iniciando ETL em background…', 'info')
    runEtlMutation.mutate()
  }

  const handleVendasAlvo = async () => {
    if (!lojas.length) { addLog('Selecione ao menos uma loja.', 'error'); return }
    setRunning('vendas')
    setProgress({ val: 30, label: 'Montando Vendas Alvo…' })
    try {
      const response = await buildSalesTarget({ data_inicial: dates.ini, data_final: dates.fim, stores: lojas })
      if (response?.success) {
        setProgress({ val: 100, label: 'Vendas Alvo concluído.' })
        addLog('Vendas Alvo concluído.', 'success')
        setStatusMsg('Vendas Alvo concluído.', 'success')
      } else {
        throw new Error(response?.error ?? 'Falha ao montar Vendas Alvo.')
      }
    } catch (err) {
      addLog(String(err), 'error')
      setStatusMsg(String(err), 'error')
    } finally {
      setRunning(null)
      setTimeout(() => setProgress(null), 500)
    }
  }

  const handleEscaninhos = async () => {
    setRunning('escs')
    setProgress({ val: 40, label: 'Gerando escaninhos…' })
    try {
      const response = await generateSlotsFromCadastro()
      if (response?.success) {
        setProgress({ val: 100, label: 'Escaninhos gerados.' })
        addLog('Escaninhos gerados com sucesso.', 'success')
        setStatusMsg('Escaninhos gerados com sucesso.', 'success')
      } else {
        throw new Error(response?.error ?? 'Falha ao gerar escaninhos.')
      }
    } catch (err) {
      addLog(String(err), 'error')
      setStatusMsg(String(err), 'error')
    } finally {
      setRunning(null)
      setTimeout(() => setProgress(null), 500)
    }
  }

  const handleImportCard175 = async () => {
    setRunning('c175')
    setProgress({ val: 35, label: 'Importando Card 175…' })
    try {
      const selected = stores.find(s => s.id === loja)
      const response = await importCard175Metabase({
        sheet_link: sheetLinks.mapaEq,
        store_code: loja,
        galpao: selected?.codigo ?? '',
      })
      if (response?.success) {
        setProgress({ val: 100, label: 'Plano inicial criado.' })
        addLog('Importação do Card 175 concluída.', 'success')
        setStatusMsg('Importação do Card 175 concluída.', 'success')
      } else {
        throw new Error(response?.error ?? 'Falha ao importar Card 175.')
      }
    } catch (err) {
      addLog(String(err), 'error')
      setStatusMsg(String(err), 'error')
    } finally {
      setRunning(null)
      setTimeout(() => setProgress(null), 500)
    }
  }

  const statusColor = COLOR_MAP[status.type] ?? COLOR_MAP['info']!

  const cfgContent = (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
      {/* LEFT: Form */}
      <div style={{ flex: '0 0 460px', overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Flow selector */}
        <div>
          <div style={sectionLabel}>Fluxo de trabalho</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['1', 'Endereçar nova loja'], ['2', 'Reendereçar (Card 175)']] .map(([v, label]) => (
              <button key={v} onClick={() => setFlow(+v)}
                style={{ flex: 1, padding: '8px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer', textAlign: 'left', border: flow === +v ? '1px solid var(--shopper-green)' : '1px solid var(--cfg-border)', background: flow === +v ? 'rgba(13,171,119,0.10)' : 'var(--cfg-input-bg)', color: flow === +v ? 'var(--shopper-green)' : 'var(--cfg-text-muted)', fontFamily: 'var(--font-sans)' }}>
                <span style={{ display: 'block', fontSize: 9, opacity: 0.7, marginBottom: 2 }}>FLUXO {v}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Planilhas */}
        <div>
          <div style={sectionLabel}>Planilhas</div>
          {flow === 1 ? (
            <>
              <Field label="Endereçamento" value={sheetLinks.ender} onChange={v => setSheetLink('ender', v)} />
              <Field label="ETL" value={sheetLinks.etl} onChange={v => setSheetLink('etl', v)} />
              <Field label="Mix" value={sheetLinks.mix} onChange={v => setSheetLink('mix', v)} />
            </>
          ) : (
            <>
              <Field label="Mapa de Equipamentos" value={sheetLinks.mapaEq} onChange={v => setSheetLink('mapaEq', v)} />
              <Field label="ETL" value={sheetLinks.etl} onChange={v => setSheetLink('etl', v)} />
              <Field label="Mix" value={sheetLinks.mix} onChange={v => setSheetLink('mix', v)} />
              <div style={{ marginBottom: 8 }}>
                <label style={fieldLabel}>Loja</label>
                <select value={loja} onChange={e => {
                  setLoja(e.target.value)
                  const found = stores.find(s => s.id === e.target.value)
                  setSelectedStore(found ?? null)
                }}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 11, background: 'var(--cfg-input-bg)', border: '1px solid var(--cfg-border)', borderRadius: 5, color: 'var(--cfg-text)' }}>
                  <option value="">Selecionar loja…</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                {loja && <div style={{ fontSize: 10, color: 'var(--cfg-text-muted)', marginTop: 3 }}>Código interno: {stores.find(s => s.id === loja)?.codigo}</div>}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <CfgBtn label="Salvar links" onClick={handleSaveLinks} loading={running === 'save'} disabled={!!running && running !== 'save'} />
            {flow === 1 && (
              <>
                <CfgBtn label="Rodar ETL" primary onClick={handleETL} loading={running === 'etl'} disabled={!!running && running !== 'etl'} />
                <CfgBtn label="Gerar escaninhos" onClick={handleEscaninhos} loading={running === 'escs'} disabled={!!running && running !== 'escs'} />
              </>
            )}
            {flow === 2 && (
              <CfgBtn label="Importar Card 175" primary onClick={handleImportCard175} loading={running === 'c175'} disabled={!!running && running !== 'c175'} />
            )}
          </div>
        </div>

        {/* Vendas Alvo (Fluxo 1 only) */}
        {flow === 1 && (
          <div style={{ background: 'var(--cfg-input-bg)', border: '1px solid var(--cfg-border)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={sectionLabel}>Vendas Alvo via Metabase <span style={{ color: '#94A3B8', fontWeight: 400 }}>(card 823)</span></div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Data inicial</label>
                <input type="date" value={dates.ini} onChange={e => setDates(d => ({ ...d, ini: e.target.value }))}
                  style={{ width: '100%', padding: '5px 8px', fontSize: 11, background: 'var(--cfg-surface)', border: '1px solid var(--cfg-border)', borderRadius: 4, color: 'var(--cfg-text)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Data final</label>
                <input type="date" value={dates.fim} onChange={e => setDates(d => ({ ...d, fim: e.target.value }))}
                  style={{ width: '100%', padding: '5px 8px', fontSize: 11, background: 'var(--cfg-surface)', border: '1px solid var(--cfg-border)', borderRadius: 4, color: 'var(--cfg-text)' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cfg-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lojas</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setLojas(stores.map(s => s.id))} style={smallBtnStyle('transparent', 'var(--cfg-border)', 'var(--cfg-text-muted)')}>Todas</button>
                <button onClick={() => setLojas([])} style={smallBtnStyle('transparent', 'var(--cfg-border)', 'var(--cfg-text-muted)')}>Limpar</button>
                <span style={{ fontSize: 10, color: lojas.length > 0 ? 'var(--shopper-green)' : 'var(--cfg-text-muted)', fontWeight: 700 }}>{lojas.length}/{stores.length} selecionadas</span>
              </div>
            </div>
            <StoreCheckboxes stores={stores} selected={lojas} onChange={setLojas} />
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <CfgBtn label="Montar Vendas Alvo" primary onClick={handleVendasAlvo} loading={running === 'vendas'} disabled={!!running && running !== 'vendas'} />
              <CfgBtn label="Baixar XLSX bruto" onClick={async () => {
                try {
                  const firstStore = lojas[0] ?? ''
                  const response = await exportSalesXlsx({ data_inicial: dates.ini, data_final: dates.fim, loja: firstStore, cod_loja: firstStore })
                  const res = response as { success?: boolean; error?: string; download_url?: string }
                  if (res?.success && res.download_url) {
                    window.location.href = res.download_url
                    addLog('Download iniciado.', 'success')
                  } else {
                    throw new Error(res?.error ?? 'Falha ao exportar XLSX bruto.')
                  }
                } catch (err) {
                  addLog(String(err), 'error')
                  setStatusMsg(String(err), 'error')
                }
              }} disabled={!!running} />
            </div>
          </div>
        )}

        {/* Abrir Mapa */}
        <div style={{ borderTop: '1px solid var(--cfg-border)', paddingTop: 14 }}>
          <div style={sectionLabel}>Abrir mapa</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cfg-text-muted)', marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoOpen} onChange={e => setAutoOpen(e.target.checked)} style={{ accentColor: 'var(--shopper-green)' }} />
            Abrir automaticamente ao recarregar (se houver plano salvo)
          </label>
          <CfgBtn label="Abrir mapa →" primary onClick={openMap} />
        </div>
      </div>

      {/* RIGHT: Status + Logs */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--cfg-border)', minHeight: 0 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--cfg-border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--cfg-text)', fontFamily: 'var(--font-numeric)' }}>{status.msg}</span>
        </div>
        {progress && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--cfg-border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--cfg-text-muted)' }}>{progress.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--shopper-green)' }}>{progress.val}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--cfg-border)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${progress.val}%`, background: 'var(--shopper-green)', borderRadius: 2, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', minHeight: 0 }}>
          {logs.length === 0 && <div style={{ color: 'var(--cfg-text-muted)', fontSize: 11, paddingTop: 8 }}>Nenhuma operação executada ainda.</div>}
          {logs.map((e, i) => <LogItem key={i} entry={e} />)}
          <div ref={logsEndRef} />
        </div>
        <div style={{ borderTop: '1px solid var(--cfg-border)', padding: '10px 16px', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cfg-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Alertas ETL</div>
          <div style={{ fontSize: 11, color: 'var(--cfg-text-muted)' }}>Nenhum alerta crítico no ETL.</div>
        </div>
      </div>
    </div>
  )

  if (!asOverlay) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--cfg-surface)' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--cfg-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cfg-text)' }}>Configuração do endereçamento</div>
            <div style={{ fontSize: 11, color: 'var(--cfg-text-muted)', marginTop: 1 }}>Configure as planilhas e gere o plano antes de abrir o mapa.</div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--cfg-text-muted)', background: 'var(--cfg-input-bg)', padding: '4px 10px', borderRadius: 20, border: '1px solid var(--cfg-border)' }}>
            {selectedStore ? selectedStore.nome : 'Nenhum mapa aberto'}
          </div>
        </div>
        {cfgContent}
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 52 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', width: 'min(900px, 92vw)', height: 'calc(100vh - 72px)', display: 'flex', flexDirection: 'column', background: 'var(--cfg-surface)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.4)', border: '1px solid var(--cfg-border)' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--cfg-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cfg-text)' }}>Configuração</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cfg-text-muted)', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>✕</button>
        </div>
        {cfgContent}
      </div>
    </div>
  )
}
