import {
  Armchair, Baby, Bath, BedDouble, Bot, BookOpen, BrushCleaning, Briefcase, Car, Cat, CookingPot, Dog, DoorOpen, Droplets, Fan, Fish, Flame, Flower2, Hammer,
  Home, Key, Lamp, Leaf, Lightbulb, Mail, Microwave, Package, PawPrint, Pill, Recycle, Refrigerator, Scissors, ShoppingCart, ShowerHead, Shirt, Snowflake, Sofa,
  SprayCan, Sparkles, Sprout, Timer, Toilet, Trash2, TreePine, Trees, Utensils, WashingMachine, Waves, Wind, Wrench, type LucideIcon,
} from 'lucide-react'

export const ROOM_ICON_MAP: Record<string, LucideIcon> = {
  'cooking-pot': CookingPot, bath: Bath, sofa: Sofa, 'bed-double': BedDouble, trees: Trees, shirt: Shirt,
  car: Car, briefcase: Briefcase, baby: Baby, 'paw-print': PawPrint, utensils: Utensils, 'door-open': DoorOpen,
}

/** Icone che si possono dare a una singola azione (in più di quelle delle stanze). */
export const TASK_ICON_MAP: Record<string, LucideIcon> = {
  ...ROOM_ICON_MAP,
  'washing-machine': WashingMachine, droplets: Droplets, sparkles: Sparkles, 'brush-cleaning': BrushCleaning, 'spray-can': SprayCan, 'trash-2': Trash2, recycle: Recycle,
  refrigerator: Refrigerator, microwave: Microwave, flame: Flame, snowflake: Snowflake, 'shower-head': ShowerHead, toilet: Toilet, waves: Waves,
  dog: Dog, cat: Cat, fish: Fish, leaf: Leaf, 'flower-2': Flower2, sprout: Sprout, 'tree-pine': TreePine,
  'shopping-cart': ShoppingCart, package: Package, mail: Mail, wrench: Wrench, hammer: Hammer, lightbulb: Lightbulb, fan: Fan, wind: Wind, lamp: Lamp,
  armchair: Armchair, key: Key, scissors: Scissors, pill: Pill, 'book-open': BookOpen, bot: Bot, timer: Timer, home: Home,
}
export const TASK_ICONS = Object.keys(TASK_ICON_MAP)

export function RoomIcon({ name, className, size = 22 }: { name: string; className?: string; size?: number }) {
  const I = TASK_ICON_MAP[name] ?? Home
  return <I size={size} className={className} strokeWidth={2.2} />
}
