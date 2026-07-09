import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Sparkles, RefreshCw } from 'lucide-react'
import {
  getAssistantBrief, refreshAssistantBrief, setChoreStatus, setTodoStatus,
  type AssistantBrief, type BriefPriority, type FamilyMember,
} from '../lib/api'
import { fmtTime } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import type { Section, Intent, EventFocus } from '../lib/calendar'
import Card from './Card'
import PersonAvatar from './PersonAvatar'

type Kind = 'day' | 'week'

// The AI assistant's structured brief (design mockup option B): prioritized
// actions with a Today/Week toggle, an optional watch-out and praise callout.
// Rendered on Home only when the assistant backend is configured.
export default function BriefCard({ members, go }: {
  members: FamilyMember[]
  go: (s: Section, intent?: Intent, focus?: EventFocus) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [kind, setKind] = useState<Kind>('day')
  const [briefs, setBriefs] = useState<Partial<Record<Kind, AssistantBrief | null>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (briefs[kind] !== undefined) return
    getAssistantBrief(kind)
      .then((b) => setBriefs((cur) => ({ ...cur, [kind]: b })))
      .catch((e) => setError(String(e)))
  }, [kind, briefs])

  const refresh = () => {
    setBusy(true); setError(null)
    refreshAssistantBrief(kind)
      .then((b) => setBriefs((cur) => ({ ...cur, [kind]: b })))
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  // Completing straight from the brief: chores + todos check off in place;
  // event priorities deep-link to the event instead.
  const complete = (p: BriefPriority, key: string) => {
    if (doneIds.has(key)) return
    if (p.choreInstanceId) {
      setDoneIds((cur) => new Set(cur).add(key))
      setChoreStatus(p.choreInstanceId, 'done', p.memberId).catch(() => {
        setDoneIds((cur) => { const n = new Set(cur); n.delete(key); return n })
      })
    } else if (p.todoId) {
      setDoneIds((cur) => new Set(cur).add(key))
      setTodoStatus(p.todoId, 'done').catch(() => {
        setDoneIds((cur) => { const n = new Set(cur); n.delete(key); return n })
      })
    }
  }

  const brief = briefs[kind]
  const memberOf = (id?: string) => members.find((m) => m.id === id)

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase flex items-center gap-1.5" style={{ color: 'var(--t-text-soft)' }}>
          <Sparkles size={13} style={{ color: 'var(--t-accent)' }} /> {t('assistant.briefTitle')}
        </div>
        <div className="flex gap-1 rounded-full p-0.5" style={{ background: 'var(--t-shell)', border: '1px solid var(--t-line)' }}>
          {(['day', 'week'] as Kind[]).map((k) => (
            <button key={k} onClick={() => setKind(k)} className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={k === kind ? { backgroundColor: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { color: 'var(--t-text-soft)' }}>
              {t(`assistant.kind.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-xs mb-2" style={{ color: 'var(--t-danger)' }}>{error}</div>}

      {brief === undefined && !error && (
        <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('common.loading')}</div>
      )}

      {brief === null && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('assistant.noBrief')}</div>
          <button onClick={refresh} disabled={busy} className="text-sm font-semibold shrink-0 disabled:opacity-50" style={{ color: 'var(--t-brand)' }}>
            {busy ? t('assistant.generating') : t('assistant.generate')}
          </button>
        </div>
      )}

      {brief && (
        <>
          <div>
            {brief.priorities.map((p, i) => {
              const key = `${brief.kind}-${i}`
              const done = doneIds.has(key)
              const member = memberOf(p.memberId)
              const checkable = Boolean(p.choreInstanceId || p.todoId)
              const isEvent = Boolean(p.eventId)
              return (
                <div key={key} className="flex items-center gap-2.5 py-2" style={{ borderBottom: i === brief.priorities.length - 1 ? 'none' : '1px solid var(--t-line)' }}>
                  {checkable ? (
                    <button
                      onClick={() => complete(p, key)}
                      aria-label={t('assistant.markDone', { title: p.title })}
                      className="shrink-0 rounded-full"
                      style={{
                        width: 18, height: 18, border: '2px solid',
                        borderColor: done ? 'var(--t-brand)' : 'var(--t-line)',
                        background: done ? 'var(--t-brand)' : 'transparent',
                      }}
                    />
                  ) : (
                    <span className="shrink-0 rounded-full" style={{ width: 18, height: 18, border: '2px dashed var(--t-line)' }} />
                  )}
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => { if (isEvent && p.eventId && p.eventStartAt) go('calendar', 'open-event', { eventId: p.eventId, date: p.eventStartAt }) }}
                    style={{ cursor: isEvent ? 'pointer' : 'default' }}
                  >
                    <span className="block text-sm font-medium truncate" style={{ textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--t-text-soft)' : 'var(--t-text)' }}>{p.title}</span>
                    {p.why && <span className="block text-xs truncate" style={{ color: 'var(--t-text-soft)' }}>{p.why}</span>}
                  </button>
                  {member && <PersonAvatar name={member.name} color={member.color} size={22} />}
                </div>
              )
            })}
          </div>

          {brief.watchOut && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2 mt-2 text-sm"
              style={{ background: 'color-mix(in oklab, var(--t-danger) 12%, var(--t-surface))', color: 'var(--t-danger)' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{brief.watchOut}</span>
            </div>
          )}
          {brief.praise && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2 mt-2 text-sm"
              style={{ background: 'color-mix(in oklab, var(--t-brand) 12%, var(--t-surface))', color: 'var(--t-brand)' }}>
              <Sparkles size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{brief.praise}</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-2.5 text-xs" style={{ color: 'var(--t-text-soft)' }}>
            <span>{t('assistant.generatedAt', { time: fmtTime(new Date(brief.generatedAt), locale), model: brief.model })}</span>
            <button onClick={refresh} disabled={busy} className="flex items-center gap-1 font-semibold disabled:opacity-50" style={{ color: 'var(--t-brand)' }}>
              <RefreshCw size={12} className={busy ? 'animate-spin' : undefined} /> {t('assistant.refresh')}
            </button>
          </div>
        </>
      )}
    </Card>
  )
}
