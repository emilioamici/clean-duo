/** I due gattini: Zenitsu è il gatto scuro (tema scuro), Mochi quello bianco e arancione (tema chiaro). */
export type Mascot = 'zenitsu' | 'mochi' | 'pair'
const FILE: Record<Mascot, string> = { zenitsu: 'cats/zenitsu.png', mochi: 'cats/mochi.png', pair: 'cats/pair.png' }

export function MascotImg({ kind, className = '' }: { kind: Mascot; className?: string }) {
  // immagine decorativa: nessun testo alternativo e non trascinabile
  return <img src={import.meta.env.BASE_URL + FILE[kind]} alt="" draggable={false} decoding="async" className={`pointer-events-none select-none ${className}`} />
}
