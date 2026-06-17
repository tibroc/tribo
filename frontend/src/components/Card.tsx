import type { CSSProperties, ReactNode } from 'react'

// Floating cream surface. Optional `title` (+ `action`) renders a header with a
// divider; otherwise children fill a padded rounded panel.
export default function Card({ title, subtitle, action, children, padded = true, className = '', style }: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children?: ReactNode
  padded?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`tribo-card ${className}`}
      style={{
        background: 'var(--t-shell)',
        border: '1px solid var(--t-line)',
        borderRadius: 'var(--t-radius-lg)',
        boxShadow: 'var(--t-shadow)',
        overflow: 'hidden',
        color: 'var(--t-text)',
        fontFamily: 'var(--t-font-body)',
        ...style,
      }}
    >
      {(title || action) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--t-line)',
        }}>
          <div>
            {title && (
              <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 20, color: 'var(--t-text)' }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: 12, color: 'var(--t-text-soft)', marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          {action}
        </div>
      )}
      <div style={padded ? { padding: '18px 22px' } : undefined}>{children}</div>
    </div>
  )
}
