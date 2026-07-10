import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Renders children into document.body so overlays (modals, confirm dialogs,
// pinned pills) escape the AppShell body's stacking context — otherwise a
// `fixed z-50` element nested inside the z-index:2 body renders *behind* the
// z-index:3 app header.
//
// AppShell mounts its children twice (desktop + mobile layouts; the inactive
// one is display:none). Portals escape that hiding, so a portal'd overlay
// would appear as two stacked copies. The `singleton` key dedupes: the first
// mounted instance claims the key and renders; its layout twin renders
// nothing. Give every call site inside AppShell children a distinct key.
const claims = new Map<string, symbol>()

export default function Portal({ children, singleton }: { children: React.ReactNode; singleton?: string }) {
  const id = useRef<symbol | null>(null)
  if (id.current === null) id.current = Symbol('portal')
  const [active, setActive] = useState(!singleton)

  useEffect(() => {
    if (!singleton) return
    if (!claims.has(singleton)) {
      claims.set(singleton, id.current!)
      setActive(true)
    }
    return () => {
      if (claims.get(singleton) === id.current) claims.delete(singleton)
    }
  }, [singleton])

  if (!active) return null
  return createPortal(children, document.body)
}
