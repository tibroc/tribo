import type { ButtonHTMLAttributes, ReactNode, CSSProperties } from 'react'

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--t-brand)',   color: 'var(--t-on-brand)',  border: '1px solid transparent' },
  accent:  { background: 'var(--t-accent)',  color: 'var(--t-on-accent)', border: '1px solid transparent' },
  outline: { background: 'transparent',      color: 'var(--t-text)',      border: '1.5px solid var(--t-line)' },
  ghost:   { background: 'transparent',      color: 'var(--t-text-soft)', border: '1px solid transparent' },
  danger:  { background: 'transparent',      color: 'var(--t-danger)',    border: '1.5px solid var(--t-danger)' },
}

const SIZES: Record<Size, CSSProperties> = {
  sm: { padding: '8px 14px',  fontSize: 13, borderRadius: 'var(--t-radius-sm)' },
  md: { padding: '12px 22px', fontSize: 15, borderRadius: 'var(--t-radius-md)' },
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  style,
  ...rest
}: {
  variant?: Variant
  size?: Size
  children: ReactNode
  style?: CSSProperties
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'>) {
  return (
    <button
      className="tribo-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontFamily: 'var(--t-font-body)',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'transform .16s, box-shadow .16s, filter .16s',
        whiteSpace: 'nowrap',
        ...SIZES[size],
        ...VARIANTS[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
