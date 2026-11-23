import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { ChevronDown, Star, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import type { Member } from '../types'
import { cleanColor } from '../lib/clean'
import { t } from '../i18n'

export function Avatar({ member, size = 32 }: { member?: Member | null; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-surface shadow-sm"
      style={{ width: size, height: size, background: member?.color ?? '#cbd5e1', fontSize: size * 0.55 }}
    >
      {member?.avatar ?? '👤'}
    </span>
  )
}

export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (n: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value
        const star = <Star size={size} className={on ? 'fill-brand text-brand' : 'text-line'} strokeWidth={2} />
        return onChange
          ? <button key={n} type="button" onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)} className="p-1 transition active:scale-75" aria-label={t('{n} stelle', { n })}>{star}</button>
          : <span key={n}>{star}</span>
      })}
    </span>
  )
}

export function CleanBar({ pct, height = 8 }: { pct: number; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-line" style={{ height }}>
      <motion.div
        className="h-full rounded-full"
        initial={false}
        animate={{ width: `${pct}%`, backgroundColor: cleanColor(pct) }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="relative flex rounded-full border border-line bg-line/40 p-1">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className="relative flex-1 rounded-full whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition active:scale-95">
          {value === o.id && (
            <motion.span layoutId={`seg-${options.map((x) => x.id).join('-')}`} className="absolute inset-0 rounded-full bg-surface shadow-[0_2px_8px_rgb(var(--ink)/0.15)]" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
          )}
          <span className={`relative ${value === o.id ? '' : 'text-muted'}`}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function PageHeader({ title, subtitle, right, left }: { title: string; subtitle?: string; right?: ReactNode; left?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 pb-4 pt-2">
      <div className="flex min-w-0 items-center gap-2">
        {left}
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </header>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const controls = useDragControls()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
          <motion.div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="glass-strong relative z-10 flex max-h-[92%] w-full max-w-md md:max-w-xl flex-col rounded-t-3xl rounded-b-none md:rounded-3xl shadow-2xl"
            initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 120 || i.velocity.y > 600) onClose() }}
          >
            <div className="flex cursor-grab touch-none justify-center pb-1 pt-3 md:hidden" onPointerDown={(e) => controls.start(e)}><div className="h-1.5 w-10 rounded-full bg-muted/50" /></div>
            <div className="flex items-center justify-between px-5 pb-1 md:pt-4">
              <h2 className="text-xl font-bold">{title}</h2>
              <button onClick={onClose} className="glass-btn !p-2" aria-label={t('Chiudi')}><X size={18} /></button>
            </div>
            <div className="overflow-y-auto px-5 pb-8 pt-1 pb-safe">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 py-1 text-left">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brand' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

/** Scheda a scomparsa: da chiusa mostra titolo e riepilogo, aperta anche il dettaglio. */
export function Accordion({ title, summary, icon, open, onToggle, children }: {
  title: string; summary?: ReactNode; icon: ReactNode; open: boolean; onToggle: () => void; children: ReactNode
}) {
  return (
    <section className="card overflow-hidden" data-open={open || undefined}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left active:bg-line/30">
        <span className="text-brand">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{title}</span>
          {summary && !open && <span className="block truncate text-xs text-muted">{summary}</span>}
        </span>
        <ChevronDown size={20} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-line/60 p-4">{children}</div>}
    </section>
  )
}
