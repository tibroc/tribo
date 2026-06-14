import { useEffect, useState } from 'react'
import {
  Users, CalendarDays, CheckSquare, Globe, Repeat, Shuffle, ChevronRight, MapPin, Palette, LogIn,
} from 'lucide-react'
import { palette } from '../lib/tokens'
import type { Section } from '../lib/calendar'
import {
  getFamilyMembers, getWorkSchedules, getChores,
  type FamilyMember, type WorkSchedule, type Chore,
} from '../lib/api'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import PersonAvatar from '../components/PersonAvatar'

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function FamilyPage({ go }: { go: (s: Section) => void }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [schedules, setSchedules] = useState<WorkSchedule[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  useEffect(() => {
    getFamilyMembers().then(setMembers).catch(() => {})
    getWorkSchedules().then(setSchedules).catch(() => {})
    getChores().then(setChores).catch(() => {})
  }, [])

  const nameOf = (id?: string) => members.find((m) => m.id === id)?.name ?? ''
  const choreWho = (c: Chore) =>
    c.assignmentMode === 'rotation'
      ? (c.rotationMemberIds ?? []).map(nameOf).filter(Boolean).join(', ')
      : nameOf(c.assignedMemberId)

  return (
    <AppShell active="family" onNavigate={go} showFab={false} header={<SimpleHeader title="Family" />}>
      <div className="space-y-4">
        {/* Family members */}
        <Section title="Family members" icon={Users}>
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-4">
            {members.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <PersonAvatar name={p.name} color={p.color} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="text-xs truncate" style={{ color: palette.inkSoft }}>
                    {p.role === 'guardian' ? 'Guardian' : `Child · Default guardian: ${nameOf(p.defaultGuardianId) || '—'}`}
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </Section>

        {/* Work schedules */}
        <Section title="Work schedules" icon={CalendarDays}>
          <div className="space-y-4">
            {schedules.map((s) => {
              const m = members.find((x) => x.id === s.memberId)
              const color = m?.color ?? palette.brand
              return (
                <div key={s.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <PersonAvatar name={m?.name} color={color} size={28} />
                    <div className="text-sm font-semibold">{m?.name}</div>
                    <div className="text-xs ml-auto" style={{ color: palette.inkSoft }}>{s.startTime} – {s.endTime}</div>
                  </div>
                  <div className="flex gap-1 mb-2">
                    {DAY_LABELS.map((d, i) => {
                      const on = s.daysOfWeek[i] === '1'
                      return (
                        <div key={i} className="flex-1 rounded-md text-center text-xs font-semibold py-1.5"
                          style={on ? { backgroundColor: color + '20', color: palette.ink } : { backgroundColor: palette.mist, color: palette.inkSoft }}>
                          {d}
                        </div>
                      )
                    })}
                  </div>
                  <label className="flex items-center gap-2 text-xs" style={{ color: palette.inkSoft }}>
                    <input type="checkbox" checked={s.showOnCalendar} readOnly className="w-3.5 h-3.5 rounded" />
                    Show as "busy" on calendar
                  </label>
                </div>
              )
            })}
          </div>
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chores */}
          <Section title="Chores" icon={CheckSquare}>
            <div className="space-y-2">
              {chores.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color ?? palette.brand }} />
                  <span className="text-sm flex-1 truncate">{c.title}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{cap(c.recurrenceRule)} · {choreWho(c)}</span>
                  {c.assignmentMode === 'rotation'
                    ? <Shuffle size={14} style={{ color: palette.inkSoft, flexShrink: 0 }} />
                    : <Repeat size={14} style={{ color: palette.inkSoft, flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          </Section>

          {/* Calendars — full source management arrives in Milestone 6. */}
          <Section title="Calendars" icon={Globe}>
            <div className="flex items-center gap-2 py-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: palette.brand }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">Family Calendar</div>
                <div className="text-xs truncate" style={{ color: palette.inkSoft }}>Built-in · Synced</div>
              </div>
            </div>
            <div className="text-xs mt-2" style={{ color: palette.inkSoft }}>External calendar sync arrives in a later update.</div>
          </Section>
        </div>

        {/* App settings (static) */}
        <Section title="App settings">
          <div className="space-y-3">
            <SettingRow icon={MapPin} title="Location" sub="Lisbon, Portugal — used for weather" />
            <SettingRow icon={Palette} title="Appearance" sub="Default color theme" />
            <SettingRow icon={LogIn} title="Account" sub="Sign-in via Authentik arrives in a later update" />
          </div>
        </Section>
      </div>
    </AppShell>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon?: typeof Users; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="font-display text-base font-bold mb-3 flex items-center gap-2">{Icon && <Icon size={16} />} {title}</div>
      {children}
    </Card>
  )
}

function SettingRow({ icon: Icon, title, sub }: { icon: typeof MapPin; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs truncate" style={{ color: palette.inkSoft }}>{sub}</div>
      </div>
      <ChevronRight size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
    </div>
  )
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
