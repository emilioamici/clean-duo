import { Baby, Bath, BedDouble, Briefcase, Car, CookingPot, DoorOpen, PawPrint, Shirt, Sofa, Trees, Utensils, Home, type LucideIcon } from 'lucide-react'

export const ROOM_ICON_MAP: Record<string, LucideIcon> = {
  'cooking-pot': CookingPot, bath: Bath, sofa: Sofa, 'bed-double': BedDouble, trees: Trees, shirt: Shirt,
  car: Car, briefcase: Briefcase, baby: Baby, 'paw-print': PawPrint, utensils: Utensils, 'door-open': DoorOpen,
}

export function RoomIcon({ name, className, size = 22 }: { name: string; className?: string; size?: number }) {
  const I = ROOM_ICON_MAP[name] ?? Home
  return <I size={size} className={className} strokeWidth={2.2} />
}
