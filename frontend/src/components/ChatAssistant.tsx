import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, X, ArrowUp, Check, AlertTriangle } from 'lucide-react'
import { getAssistantStatus, streamAssistantChat, type ChatMessage } from '../lib/api'
import Portal from './Portal'

// One rendered conversation entry: a user/assistant bubble, with the tool
// trace that ran while the assistant produced it.
interface Entry {
  role: 'user' | 'assistant'
  content: string
  tools: { name: string; status: 'start' | 'ok' | 'error' }[]
  pending?: boolean
}

// The in-app chat assistant (phase 2, mockup option D): a ✦ button above the
// FAB opens a bottom sheet over any screen. Conversation state is ephemeral —
// kept in memory while the app is open, never persisted. Mounted once at the
// Router level; renders nothing when the assistant backend is unconfigured.
export default function ChatAssistant() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => { getAssistantStatus().then((s) => setEnabled(s.enabled)).catch(() => {}) }, [])
  // Keep the newest message in view.
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }) }, [entries, open])

  if (!enabled) return null

  const send = (text: string) => {
    const msg = text.trim()
    if (!msg || busy) return
    setDraft('')
    setBusy(true)

    // History for the backend: all completed user/assistant turns + this message.
    const history: ChatMessage[] = [
      ...entries.filter((e) => !e.pending && e.content).map((e) => ({ role: e.role, content: e.content })),
      { role: 'user' as const, content: msg },
    ]
    setEntries((cur) => [...cur, { role: 'user', content: msg, tools: [] }, { role: 'assistant', content: '', tools: [], pending: true }])

    const patchPending = (fn: (e: Entry) => Entry) =>
      setEntries((cur) => cur.map((e, i) => (i === cur.length - 1 ? fn(e) : e)))

    streamAssistantChat(history, (ev) => {
      if (ev.type === 'tool' && ev.name) {
        patchPending((e) => {
          const tools = [...e.tools]
          const last = tools.length - 1
          if (ev.status !== 'start' && last >= 0 && tools[last].name === ev.name && tools[last].status === 'start') {
            tools[last] = { name: ev.name!, status: ev.status! }
          } else {
            tools.push({ name: ev.name!, status: ev.status ?? 'start' })
          }
          return { ...e, tools }
        })
      } else if (ev.type === 'message') {
        patchPending((e) => ({ ...e, content: ev.content ?? '', pending: false }))
      } else if (ev.type === 'error') {
        patchPending((e) => ({ ...e, content: ev.content ?? 'error', pending: false }))
      }
    })
      .catch((err) => patchPending((e) => ({ ...e, content: String(err), pending: false })))
      .finally(() => setBusy(false))
  }

  const starters = [t('assistant.chat.starter1'), t('assistant.chat.starter2'), t('assistant.chat.starter3')]

  return (
    <Portal>
      {/* ✦ launcher, above the FAB slot */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed flex items-center justify-center transition-transform hover:-translate-y-1 right-5 bottom-[152px] lg:right-8 lg:bottom-[84px]"
        style={{
          width: 46, height: 46, borderRadius: '50% 50% 50% 16px',
          background: 'var(--t-brand)', color: 'var(--t-on-brand)',
          boxShadow: '0 8px 20px rgba(62,98,89,.35)', zIndex: 30,
        }}
        aria-label={t('assistant.chat.open')}
        aria-expanded={open}
      >
        <Sparkles size={19} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0" style={{ background: 'rgba(15,20,16,.45)', zIndex: 44 }} onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label={t('assistant.title')}
            className="fixed bottom-0 left-0 right-0 lg:left-auto lg:right-8 lg:w-[420px] flex flex-col"
            style={{
              maxHeight: '78vh', zIndex: 45,
              background: 'var(--t-surface)', color: 'var(--t-text)',
              border: '1px solid var(--t-line)', borderBottom: 'none',
              borderRadius: 'var(--t-radius-lg) var(--t-radius-lg) 0 0',
              boxShadow: '0 -12px 32px rgba(15,20,16,.22)',
            }}
          >
            <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--t-line)' }}>
              <Sparkles size={15} style={{ color: 'var(--t-accent)' }} />
              <span className="font-display text-base" style={{ fontWeight: 500 }}>{t('assistant.title')}</span>
              <button className="ml-auto p-1" onClick={() => setOpen(false)} aria-label={t('common.close')} style={{ color: 'var(--t-text-soft)' }}>
                <X size={17} />
              </button>
            </div>

            <div ref={bodyRef} className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-2" style={{ minHeight: 180 }}>
              {entries.length === 0 && (
                <>
                  <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('assistant.chat.hello')}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {starters.map((s) => (
                      <button key={s} onClick={() => send(s)}
                        className="text-xs font-semibold rounded-full px-3 py-1.5"
                        style={{ color: 'var(--t-brand)', border: '1px solid var(--t-brand)', background: 'transparent' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {entries.map((e, i) => (
                <div key={i} className="flex flex-col" style={{ alignItems: e.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    className="text-sm px-3 py-2"
                    style={{
                      maxWidth: '85%', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                      borderRadius: e.role === 'user' ? '14px 14px 5px 14px' : '14px 14px 14px 5px',
                      background: e.role === 'user' ? 'var(--t-brand)' : 'var(--t-shell)',
                      color: e.role === 'user' ? 'var(--t-on-brand)' : 'var(--t-text)',
                      border: e.role === 'user' ? 'none' : '1px solid var(--t-line)',
                    }}
                  >
                    {e.pending && !e.content ? <span className="animate-pulse">{t('assistant.chat.thinking')}</span> : e.content}
                  </div>
                  {e.tools.length > 0 && (
                    <div className="flex flex-wrap gap-x-2.5 mt-1 px-1 text-xs" style={{ color: 'var(--t-text-soft)' }}>
                      {e.tools.map((tool, j) => (
                        <span key={j} className="inline-flex items-center gap-1">
                          <Sparkles size={9} style={{ color: 'var(--t-accent)' }} />
                          {t(`assistant.tools.${tool.name}`, { defaultValue: tool.name })}
                          {tool.status === 'ok' && <Check size={10} style={{ color: 'var(--t-brand)' }} />}
                          {tool.status === 'error' && <AlertTriangle size={10} style={{ color: 'var(--t-danger)' }} />}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form
              className="flex items-center gap-2 px-3.5 py-3 shrink-0"
              style={{ borderTop: '1px solid var(--t-line)' }}
              onSubmit={(e) => { e.preventDefault(); send(draft) }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('assistant.chat.placeholder')}
                className="flex-1 text-sm rounded-full px-4 py-2 outline-hidden"
                style={{ border: '1px solid var(--t-line)', background: 'var(--t-bg)', color: 'var(--t-text)' }}
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="flex items-center justify-center rounded-full disabled:opacity-40"
                style={{ width: 36, height: 36, background: 'var(--t-brand)', color: 'var(--t-on-brand)', border: 'none' }}
                aria-label={t('assistant.chat.send')}
              >
                <ArrowUp size={16} />
              </button>
            </form>
          </div>
        </>
      )}
    </Portal>
  )
}
