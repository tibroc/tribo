import { useState } from 'react'
import type { Section } from './lib/calendar'
import HomePage from './views/HomePage'
import CalendarPage from './views/CalendarPage'
import ChoresPage from './views/ChoresPage'
import TodosPage from './views/TodosPage'
import FamilyPage from './views/FamilyPage'
import ReviewPage from './views/ReviewPage'

// Top-level section router. `go` accepts any Section; the nav rail/bottom bar
// only surface the five NavKeys, while Review is reached from Home.
export default function App() {
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
