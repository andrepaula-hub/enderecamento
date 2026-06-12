import { useState, useEffect } from 'react'

export interface ConfirmDialog {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  requireText?: string
  onConfirm: () => void
}

interface ConfirmModalProps {
  dialog: ConfirmDialog | null
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ dialog, onConfirm, onCancel }: ConfirmModalProps) {
  const [inp, setInp] = useState('')
  useEffect(() => { setInp('') }, [dialog])
  if (!dialog) return null
  const ok = !dialog.requireText || inp === dialog.requireText
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', background: 'var(--cfg-surface)', border: '1px solid var(--cfg-border)', borderRadius: 10, padding: '20px 24px', width: 380, boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cfg-text)', marginBottom: 6 }}>{dialog.title}</div>
        <div style={{ fontSize: 12, color: 'var(--cfg-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>{dialog.message}</div>
        {dialog.requireText && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--cfg-text-muted)', marginBottom: 4 }}>
              Digite <strong style={{ color: 'var(--cfg-text)' }}>"{dialog.requireText}"</strong> para confirmar:
            </div>
            <input
              value={inp}
              onChange={e => setInp(e.target.value)}
              autoFocus
              style={{ width: '100%', padding: '7px 10px', fontSize: 11, background: 'var(--cfg-input-bg)', border: '1px solid var(--cfg-border)', borderRadius: 5, color: 'var(--cfg-text)', outline: 'none' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: 'pointer', background: 'transparent', border: '1px solid var(--cfg-border)', color: 'var(--cfg-text-muted)', fontFamily: 'var(--font-sans)' }}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!ok}
            style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-sans)', border: 'none', background: dialog.danger ? '#9E1028' : 'var(--shopper-green)', color: '#fff', opacity: ok ? 1 : 0.4 }}
          >
            {dialog.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
