import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTranslation } from 'react-i18next'

// Surfaces the service-worker lifecycle: a small toast when a new build is
// waiting (registerType: 'prompt' means we don't reload behind the user's back),
// and a brief "ready to work offline" confirmation on first install.
export default function ReloadPrompt() {
  const { t } = useTranslation()
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  // The "ready to work offline" note is just a confirmation — auto-dismiss it so
  // it doesn't linger over the UI. The update prompt stays until acted on.
  useEffect(() => {
    if (offlineReady && !needRefresh) {
      const id = setTimeout(() => setOfflineReady(false), 5000)
      return () => clearTimeout(id)
    }
  }, [offlineReady, needRefresh, setOfflineReady])

  if (!offlineReady && !needRefresh) return null

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div
      role="status"
      className="fixed z-50 font-body flex items-center gap-3"
      style={{
        left: 16,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        maxWidth: 'calc(100vw - 32px)',
        padding: '12px 14px',
        borderRadius: 14,
        background: 'var(--t-surface)',
        color: 'var(--t-text)',
        border: '1px solid var(--t-line)',
        boxShadow: '0 8px 28px rgba(0,0,0,.16)',
      }}
    >
      <span style={{ fontSize: 14 }}>
        {needRefresh ? t('pwa.updateAvailable') : t('pwa.offlineReady')}
      </span>
      {needRefresh && (
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            fontSize: 14,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 10,
            background: 'var(--t-brand)',
            color: 'var(--t-on-brand)',
          }}
        >
          {t('pwa.reload')}
        </button>
      )}
      <button
        onClick={close}
        aria-label={t('pwa.dismiss')}
        style={{ fontSize: 14, padding: '6px 8px', color: 'var(--t-text-soft)' }}
      >
        ✕
      </button>
    </div>
  )
}
