import { createPortal } from 'react-dom'

// Renders children into document.body so overlays (modals, confirm dialogs)
// escape the AppShell body's stacking context — otherwise a `fixed z-50` modal
// nested inside the z-index:2 body renders *behind* the z-index:3 app header,
// hiding its top action bar. (The calendar's EventForm avoids this by being a
// sibling of AppShell; screens that render forms as AppShell children need this.)
export default function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body)
}
