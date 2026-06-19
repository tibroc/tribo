import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Section } from '../lib/calendar'
import { getFamilyMembers, getChores, getReview, type FamilyMember, type Chore, type ChoreInstance, type Review } from '../lib/api'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import Button from '../components/Button'
import Icon from '../components/Icon'
import PersonAvatar from '../components/PersonAvatar'
import { ChoresPanel, RecurrencePill } from '../components/panels'
import { ChoreForm } from '../components/SettingsForms'

// Hero stats: done/total this week, a per-chore progress bar colored by owner,
// and the household's best week-streak.
function ChoresHero({ instances, members, streak }: { instances: ChoreInstance[]; members: FamilyMember[]; streak: number }) {
  const { t } = useTranslation()
  const total = instances.length
  const done = instances.filter((i) => i.status === 'done').length
  const colorOf = (id?: string) => members.find((m) => m.id === id)?.color || 'var(--t-track)'

  return (
    <Card padded={false} className="mb-4" style={{ padding: '20px 26px' }}>
      <div className="flex items-center" style={{ gap: 26 }}>
        <div className="shrink-0">
          <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 40, lineHeight: 1, color: 'var(--t-text)' }}>
            {done}
            <span style={{ fontSize: 22, color: 'var(--t-text-soft)' }}>/{total}</span>
          </div>
          <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 13, color: 'var(--t-text-soft)', marginTop: 2 }}>
            {t('chores.doneThisWeek')}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex overflow-hidden" style={{ height: 12, borderRadius: 8, background: 'var(--t-track)' }}>
            {instances.map((ch, i) => (
              <div
                key={ch.id}
                style={{
                  flex: 1, height: '100%', marginRight: i < total - 1 ? 2 : 0, borderRadius: 3,
                  background: ch.status === 'done' ? colorOf(ch.assignedMemberId) : 'transparent',
                }}
              />
            ))}
          </div>
          <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)', marginTop: 9 }}>
            {t('chores.barsHint')}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 28, lineHeight: 1, color: 'var(--t-text)' }}>{streak}</div>
          <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 13, color: 'var(--t-text-soft)', marginTop: 2 }}>{t('chores.weekStreak')}</div>
        </div>
      </div>
    </Card>
  )
}

// Per-person done/total balance bars.
function ByPerson({ instances, members }: { instances: ChoreInstance[]; members: FamilyMember[] }) {
  const { t } = useTranslation()
  const rows = members.map((p, idx) => {
    const mine = instances.filter((x) => x.assignedMemberId === p.id)
    return { p, idx, done: mine.filter((x) => x.status === 'done').length, total: mine.length }
  })
  return (
    <Card title={t('chores.byPerson')} action={<span style={{ fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)' }}>{t('chores.thisWeek')}</span>} padded={false}>
      {rows.map(({ p, idx, done, total }, i) => (
        <div key={p.id} className="flex items-center gap-3" style={{ padding: '11px 22px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--t-line)' }}>
          <PersonAvatar name={p.name} color={p.color} index={idx} size={26} />
          <div style={{ width: 86, fontFamily: 'var(--t-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{p.name}</div>
          <div className="flex-1 overflow-hidden" style={{ height: 8, borderRadius: 8, background: 'var(--t-track)' }}>
            <div style={{ height: '100%', borderRadius: 8, width: `${total ? (done / total) * 100 : 0}%`, background: p.color }} />
          </div>
          <div style={{ width: 30, textAlign: 'right', fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)' }}>{done}/{total}</div>
        </div>
      ))}
    </Card>
  )
}

// Rotation card: which rotating chores exist + who currently holds them.
function RotationCard({ chores, instances, members }: { chores: Chore[]; instances: ChoreInstance[]; members: FamilyMember[] }) {
  const { t } = useTranslation()
  const memberOf = (id?: string) => members.find((m) => m.id === id)
  const rotations = chores.filter((c) => c.assignmentMode === 'rotation')
  if (rotations.length === 0) return null
  const holderFor = (choreId: string) => memberOf(instances.find((i) => i.choreId === choreId)?.assignedMemberId)
  return (
    <Card title={t('chores.rotation')} padded={false}>
      {rotations.map((c, i) => {
        const holder = holderFor(c.id)
        return (
          <div key={c.id} className="flex items-center gap-3" style={{ padding: '11px 22px', borderBottom: i === rotations.length - 1 ? 'none' : '1px solid var(--t-line)' }}>
            <RecurrencePill label={t('chores.rotation')} rotation />
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }} className="truncate">{c.title}</div>
              <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)' }} className="truncate">{t('chores.thisWeekCap')}{holder ? ` · ${holder.name}` : ''}</div>
            </div>
            {holder && <PersonAvatar name={holder.name} color={holder.color} index={members.findIndex((m) => m.id === holder.id)} size={26} />}
          </div>
        )
      })}
    </Card>
  )
}

export default function ChoresPage({ go, openNew }: { go: (s: Section) => void; openNew?: boolean }) {
  const { t } = useTranslation()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  const [review, setReview] = useState<Review | null>(null)
  const { instances, toggleChore, reload } = useChoresTodos()
  // Add-chore modal: undefined = closed; null = add. (Editing happens in Family.)
  const [choreModal, setChoreModal] = useState<null | undefined>(openNew ? null : undefined)
  const reloadChores = () => getChores().then(setChores).catch(() => {})
  useEffect(() => {
    getFamilyMembers().then(setMembers).catch(() => {})
    reloadChores()
    getReview('week').then(setReview).catch(() => {})
  }, [])

  const streak = review ? Math.max(0, ...review.perPerson.map((p) => p.streak)) : 0

  return (
    <AppShell active="chores" onNavigate={go} header={<SimpleHeader title={t('nav.chores')} />} onFabClick={() => setChoreModal(null)}>
      <div style={{ padding: '22px 26px' }}>
        <ChoresHero instances={instances} members={members} streak={streak} />
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 items-start">
          <Card
            title={t('nav.chores')}
            action={<Button variant="ghost" size="sm" style={{ color: 'var(--t-brand)' }} onClick={() => setChoreModal(null)}><Icon name="plus" size={14} strokeWidth={2.6} /> {t('chores.addChore')}</Button>}
            padded={false}
          >
            <ChoresPanel instances={instances} members={members} chores={chores} onToggle={toggleChore} flush grouped />
          </Card>
          <div className="flex flex-col gap-4">
            <ByPerson instances={instances} members={members} />
            <RotationCard chores={chores} instances={instances} members={members} />
          </div>
        </div>
      </div>
      {choreModal !== undefined && (
        <ChoreForm members={members}
          onClose={() => setChoreModal(undefined)}
          onSaved={() => { setChoreModal(undefined); reloadChores(); reload() }} />
      )}
    </AppShell>
  )
}
