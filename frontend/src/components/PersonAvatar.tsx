import type { LucideIcon } from 'lucide-react'

// Solid-color circle with an initial (or an icon, e.g. the "Family" group).
export default function PersonAvatar({ name, color, icon: Icon, size = 32 }: {
  name?: string
  color: string
  icon?: LucideIcon
  size?: number
}) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.44 }}
    >
      {Icon ? <Icon size={size * 0.5} /> : name?.[0]}
    </div>
  )
}
