import { useEffect, useState } from 'react'
import type { Section } from '../lib/calendar'
import { getFamilyMembers, type FamilyMember } from '../lib/api'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import { ChoresPanel } from '../components/panels'

export default function ChoresPage({ go }: { go: (s: Section) => void }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const { instances, toggleChore } = useChoresTodos()
  useEffect(() => { getFamilyMembers().then(setMembers).catch(() => {}) }, [])

  return (
    <AppShell active="chores" onNavigate={go} header={<SimpleHeader title="Chores" />}>
      <Card className="p-4 max-w-2xl">
        <ChoresPanel instances={instances} members={members} onToggle={toggleChore} title="This week" />
      </Card>
    </AppShell>
  )
}
