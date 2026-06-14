import { useState } from 'react'
import type { Section } from './lib/calendar'
import { palette } from './lib/tokens'
import { SessionProvider, useSession } from './lib/session'
import { LoginScreen, MapProfileScreen } from './views/AuthScreens'
import OnboardingWizard from './views/OnboardingWizard'
import HomePage from './views/HomePage'
import CalendarPage from './views/CalendarPage'
import ChoresPage from './views/ChoresPage'
import TodosPage from './views/TodosPage'
import FamilyPage from './views/FamilyPage'
import ReviewPage from './views/ReviewPage'

export default function App() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  )
}

// Gate decides between loading / login / onboarding / first-login mapping / app.
function Gate() {
  const { session, refresh } = useSession()

  if (!session) {
    return <div className="min-h-screen flex items-center justify-center font-body" style={{ backgroundColor: palette.mist, color: palette.inkSoft }}>Loading…</div>
  }
  if (session.authEnabled && !session.authenticated) return <LoginScreen />
  // Fresh instance: no family members yet → run the onboarding wizard.
  if (session.members.length === 0) return <OnboardingWizard onDone={refresh} />
  if (session.needsMapping) return <MapProfileScreen />
  return <Router />
}

// Top-level section router. `go` accepts any Section; the nav rail/bottom bar
// only surface the five NavKeys, while Review is reached from Home.
function Router() {
  const [section, setSection] = useState<Section>('home')
  const go = (s: Section) => setSection(s)

  switch (section) {
    case 'calendar':
      return <CalendarPage onNavigate={go} />
    case 'chores':
      return <ChoresPage go={go} />
    case 'todos':
      return <TodosPage go={go} />
    case 'family':
      return <FamilyPage go={go} />
    case 'review':
      return <ReviewPage go={go} />
    default:
      return <HomePage go={go} />
  }
}
