import { useTranslation } from 'react-i18next'
import Button from './Button'

// Small centered confirmation for destructive actions. Renders above other
// modals (zIndex 60 > the 50 used by forms) so it can confirm a delete from
// within an open edit modal.
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, busy }: {
  title?: string
  message?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }}>
      <div
        className="w-full max-w-xs p-5"
        style={{ background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-lg)', boxShadow: 'var(--t-shadow-pop)' }}
      >
        <div className="font-display text-lg mb-1" style={{ fontWeight: 500 }}>{title ?? t('common.confirmDeleteTitle')}</div>
        <div className="text-sm mb-4" style={{ color: 'var(--t-text-soft)' }}>{message ?? t('common.confirmDeleteBody')}</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy} style={{ flex: 1 }}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy} style={{ flex: 1 }}>{confirmLabel ?? t('common.delete')}</Button>
        </div>
      </div>
    </div>
  )
}
