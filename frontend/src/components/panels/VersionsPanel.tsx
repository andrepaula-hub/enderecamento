// VersionsPanel — migrated from dse-panels.jsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { listVersions, restoreVersion, deleteVersion } from '../../api/versions'

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

function formatVersion(version: { id?: string; version_id?: string; name?: string; label?: string; nome?: string; saved_at?: string }) {
  const versionId = version.version_id ?? version.id ?? ''
  const label = version.label ?? version.nome ?? version.name ?? versionId
  const clean = label.replace(/^VERSAO_ENDERECAMENTO__/, '')
  const parts = clean.split('__')
  const stamp = parts[0] ?? ''
  const name = parts.slice(1).join(' ') || clean
  let data = stamp
  if (/^\d{8}_\d{6}$/.test(stamp)) {
    data = `${stamp.slice(6, 8)}/${stamp.slice(4, 6)}/${stamp.slice(0, 4)} ${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}`
  }
  return { id: versionId, nome: name, data }
}

interface VersionsPanelProps {
  onClose: () => void
  onRestore: () => void
}

export default function VersionsPanel({ onClose, onRestore }: VersionsPanelProps) {
  const [confirmRestore, setConfirmRestore] = useState<{ id: string; nome: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; nome: string } | null>(null)
  const [deleteText, setDeleteText] = useState('')
  const [localError, setLocalError] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['versions'],
    queryFn: listVersions,
  })

  const versions = (data?.versions ?? []).map(formatVersion)

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreVersion(id),
    onSuccess: () => { setConfirmRestore(null); onRestore() },
    onError: (e: Error) => setLocalError(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteVersion(id),
    onSuccess: () => { setConfirmDelete(null); setDeleteText('') },
    onError: (e: Error) => setLocalError(e.message),
  })

  useEffect(() => { setDeleteText('') }, [confirmDelete])

  const apiError = error instanceof Error ? error.message : ''

  return (
    <Overlay title="Versões salvas" onClose={onClose} width={380}>
      {isLoading && <div style={{ fontSize: 11, color: 'var(--panel-muted)' }}>Carregando versões…</div>}
      {(apiError || localError) && (
        <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 12 }}>{apiError || localError}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {versions.map(v => (
          <div key={v.id} style={{ background: 'var(--panel-surface)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--panel-text)' }}>{v.nome}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--panel-muted)', marginBottom: 8 }}>{v.data}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setConfirmRestore(v)} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-sans)', background: 'rgba(13,171,119,0.10)', border: '1px solid rgba(13,171,119,0.3)', color: 'var(--shopper-green)' }}>
                Restaurar
              </button>
              <button onClick={() => setConfirmDelete(v)} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-sans)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}>
                Excluir
              </button>
            </div>
            {confirmRestore?.id === v.id && (
              <div style={{ marginTop: 8, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#F59E0B', marginBottom: 6 }}>Isso substituirá o estado atual do mapa. Continuar?</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => restoreMut.mutate(v.id)}
                    disabled={restoreMut.isPending}
                    style={{ padding: '3px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-sans)', background: '#F59E0B', border: 'none', color: '#000' }}
                  >
                    Confirmar restauração
                  </button>
                  <button onClick={() => setConfirmRestore(null)} style={{ padding: '3px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-sans)', background: 'transparent', border: '1px solid var(--panel-border)', color: 'var(--panel-muted)' }}>Cancelar</button>
                </div>
              </div>
            )}
            {confirmDelete?.id === v.id && (
              <div style={{ marginTop: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#EF4444', marginBottom: 6 }}>Digite o nome da versão para confirmar exclusão:</div>
                <input
                  value={deleteText}
                  onChange={e => setDeleteText(e.target.value)}
                  placeholder={v.nome}
                  style={{ width: '100%', padding: '4px 8px', fontSize: 10, background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, color: 'var(--panel-text)', outline: 'none', marginBottom: 6 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => deleteMut.mutate(v.id)}
                    disabled={deleteText !== v.nome || deleteMut.isPending}
                    style={{ padding: '3px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-sans)', background: '#EF4444', border: 'none', color: '#fff', opacity: deleteText === v.nome ? 1 : 0.4 }}
                  >
                    Excluir
                  </button>
                  <button onClick={() => setConfirmDelete(null)} style={{ padding: '3px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-sans)', background: 'transparent', border: '1px solid var(--panel-border)', color: 'var(--panel-muted)' }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!isLoading && versions.length === 0 && !apiError && (
          <div style={{ fontSize: 11, color: 'var(--panel-muted)' }}>Nenhuma versão salva ainda.</div>
        )}
      </div>
    </Overlay>
  )
}
