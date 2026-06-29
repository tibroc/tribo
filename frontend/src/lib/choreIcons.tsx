import {
  CheckSquare, Trash2, Recycle, Utensils, ChefHat, ShoppingCart, Shirt, WashingMachine,
  Bath, BedDouble, Brush, Sparkles, Dog, Cat, Sprout, Flower2, TreeDeciduous, Car,
  Dumbbell, BookOpen, Baby, Droplets, Wrench, Trash, type LucideIcon,
} from 'lucide-react'

// Curated set of Lucide icons offered for chores. The stored `chore.icon` is the
// string key; render via <ChoreIcon name>. Keep the list short and scannable —
// it backs a picker grid in the chore form.
const ICONS: Record<string, LucideIcon> = {
  trash: Trash2,
  trashEmpty: Trash,
  recycle: Recycle,
  dishes: Utensils,
  cook: ChefHat,
  groceries: ShoppingCart,
  laundry: Shirt,
  washer: WashingMachine,
  bath: Bath,
  bed: BedDouble,
  sweep: Brush,
  clean: Sparkles,
  dog: Dog,
  cat: Cat,
  plant: Sprout,
  flowers: Flower2,
  yard: TreeDeciduous,
  car: Car,
  exercise: Dumbbell,
  homework: BookOpen,
  baby: Baby,
  water: Droplets,
  fix: Wrench,
}

export const CHORE_ICON_NAMES = Object.keys(ICONS)

export function ChoreIcon({ name, size = 16, style }: { name?: string | null; size?: number; style?: React.CSSProperties }) {
  const Cmp = (name && ICONS[name]) || CheckSquare
  return <Cmp size={size} style={style} />
}
