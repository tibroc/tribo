// Shared error banner — themed (works in light + dark), replacing the
// hardcoded light-pink boxes that were invisible in dark mode. Matches the
// page-level error style used on Home/Calendar/Review.
export default function ErrorBanner({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-3 text-sm ${className ?? ''}`}
      style={{ background: 'color-mix(in oklab, var(--t-danger) 16%, var(--t-shell))', color: 'var(--t-danger)' }}
    >
      {children}
    </div>
  )
}
