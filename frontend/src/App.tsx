import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Section, Intent, EventFocus } from './lib/calendar'
import { palette } from './lib/tokens'
import { SessionProvider, useSession } from './lib/session'
import { ThemeProvider } from './lib/theme'
import { TimeFormatProvider } from './lib/timeformat'
import { LoginScreen, MapProfileScreen } from './views/AuthScreens'
import ChatAssistant from './components/ChatAssistant'
import ReloadPrompt from './components/ReloadPrompt'
import OnboardingWizard from './views/OnboardingWizard'
import HomePage from './views/HomePage'
import CalendarPage from './views/CalendarPage'
import ChoresPage from './views/ChoresPage'
import TodosPage from './views/TodosPage'
import FamilyPage from './views/FamilyPage'
import ReviewPage from './views/ReviewPage'

export default function App() {
  return (
    <ThemeProvider>
      <TimeFormatProvider>
        <SessionProvider>
          <Gate />
        </SessionProvider>
        <ReloadPrompt />
      </TimeFormatProvider>
    </ThemeProvider>
  )
}

// Gate decides between loading / login / onboarding / first-login mapping / app.
function Gate() {
  const { session, refresh } = useSession()
  const { t } = useTranslation()

  if (!session) {
    return <div className="min-h-screen flex items-center justify-center font-body" style={{ backgroundColor: palette.mist, color: palette.inkSoft }}>{t('common.loading')}</div>
  }
  if (session.authEnabled && !session.authenticated) return <LoginScreen />
  // A fresh instance (zero members) always runs the onboarding wizard, in any
  // auth mode. With OIDC enabled this also covers the first user who wasn't
  // auto-provisioned from groups — onboarding links them via selfMemberIndex,
  // so it must come before the mapping check (which would otherwise show an
  // empty member list and trap them).
  if (session.members.length === 0) return <OnboardingWizard onDone={refresh} />
  if (session.needsMapping) return <MapProfileScreen />
  return <Router />
}

// Top-level section router. `go` accepts any Section; the nav rail/bottom bar
// only surface the five NavKeys, while Review is reached from Home. An optional
// `intent` opens the calendar's add-event form (new-event) or focuses a
// specific event (open-event) on arrival.
function Router() {
  const [section, setSection] = useState<Section>('home')
  const [intent, setIntent] = useState<Intent | undefined>(undefined)
  const [focus, setFocus] = useState<EventFocus | undefined>(undefined)
  const go = (s: Section, i?: Intent, f?: EventFocus) => { setSection(s); setIntent(i); setFocus(f) }

  let screen: React.ReactNode
  switch (section) {
    case 'calendar':
      screen = <CalendarPage onNavigate={go} openNew={intent === 'new-event'} focus={intent === 'open-event' ? focus : undefined} />
      break
    case 'chores':
      screen = <ChoresPage go={go} />
      break
    case 'todos':
      screen = <TodosPage go={go} />
      break
    case 'family':
      screen = <FamilyPage go={go} />
      break
    case 'review':
      screen = <ReviewPage go={go} />
      break
    default:
      screen = <HomePage go={go} />
  }

  // The chat assistant lives outside the section switch so its ✦ button and
  // (ephemeral) conversation survive navigation between screens.
  return (
    <>
      {screen}
      <ChatAssistant />
    </>
  )
}
