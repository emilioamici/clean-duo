import { AnimatePresence, motion } from 'framer-motion'
import { Cloud, CloudOff, ListChecks, LayoutGrid, Loader2, RefreshCw, Settings, Star, TriangleAlert, Trophy, CloudCheck } from 'lucide-react'
import { useMemo } from 'react'
import type { TabId } from '../types'
import { urgencyOf } from '../lib/clean'
import { timeAgo } from '../lib/stats'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { Avatar } from './ui'

export function Background() {
  const blob = (v: string) => ({ background: `rgb(var(--${v}))` })
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <div className="absolute -left-24 -top-24 h-96 w-96 animate-float1 rounded-full blur-3xl" style={blob('blob-a')} />
      <div className="absolute -right-32 top-1/4 h-[28rem] w-[28rem] animate-float2 rounded-full blur-3xl" style={blob('blob-b')} />
      <div className="absolute -bottom-32 left-1/4 h-[30rem] w-[30rem] animate-float3 rounded-full blur-3xl" style={blob('blob-c')} />
    </div>
  )
}

const TABS: { id: TabId; label: string; icon: typeof ListChecks }[] = [
  { id: 'today', label: 'Oggi', icon: ListChecks },
  { id: 'rooms', label: 'Stanze', icon: LayoutGrid },
  { id: 'ranking', label: 'Sfida', icon: Trophy },
  { id: 'settings', label: 'Impostazioni', icon: Settings },
]

export function BottomNav() {
  const { tab, setTab } = useUi()
  const { db } = useApp()
  const badge = useMemo(() => db.tasks.filter((t) => ['overdue', 'today'].includes(urgencyOf(t))).length, [db.tasks])

  return (
    <nav className="glass absolute inset-x-4 bottom-4 z-40 flex items-center justify-between !rounded-full p-1.5" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id
        return (
          <button key={id} onClick={() => setTab(id)} aria-label={label} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 transition active:scale-90">
            {active && (
              <motion.span
                layoutId="nav-drop"
                className="glass-active absolute inset-0 rounded-full"
                transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.9 }}
              />
            )}
            <span className={`relative ${active ? 'text-brand' : 'text-muted'}`}>
              <Icon size={22} strokeWidth={active ? 2.6 : 2.1} />
              {id === 'today' && badge > 0 && (
                <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-exp px-1 text-[10px] font-bold text-onbrand">{badge}</span>
              )}
            </span>
            <span className={`relative text-[10px] font-semibold ${active ? 'text-brand' : 'text-muted'}`}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function SyncPill() {
  const { status, syncNow, reconnect, mode, lastSyncAt, dirty } = useApp()
  const map = {
    demo: { icon: <CloudOff size={15} />, text: 'Demo locale', cls: '' },
    idle: { icon: dirty ? <Cloud size={15} /> : <CloudCheck size={15} />, text: lastSyncAt ? `Sync ${timeAgo(lastSyncAt)}` : 'Sync', cls: 'text-inc' },
    syncing: { icon: <Loader2 size={15} className="animate-spin" />, text: 'Sync…', cls: '' },
    offline: { icon: <CloudOff size={15} />, text: 'Offline', cls: 'text-brand' },
    auth: { icon: <TriangleAlert size={15} />, text: 'Riconnetti', cls: 'text-exp' },
    error: { icon: <TriangleAlert size={15} />, text: 'Errore', cls: 'text-exp' },
  }[status]
  return (
    <button
      onClick={() => (status === 'auth' ? void reconnect() : mode === 'drive' ? void syncNow() : undefined)}
      className={`glass-btn !px-3 !py-1.5 text-xs ${map.cls}`}
      aria-label="Sincronizza"
    >
      {map.icon}{map.text}
      {mode === 'drive' && status !== 'syncing' && status !== 'auth' && <RefreshCw size={12} className="opacity-60" />}
    </button>
  )
}

export function MeChip() {
  const { me } = useApp()
  const { openSwitcher } = useUi()
  return (
    <button onClick={() => openSwitcher(true)} className="glass-btn !p-1" aria-label="Cambia utente">
      <Avatar member={me} size={30} />
    </button>
  )
}

export function Toast() {
  const { toast } = useApp()
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }}
          className="glass-strong absolute inset-x-6 top-4 z-[70] px-4 py-3 text-center text-sm font-semibold"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Celebration() {
  const { celebration } = useUi()
  const particles = useMemo(() => {
    if (!celebration) return []
    const n = 8 + celebration.stars * 4
    return Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5
      const d = 50 + Math.random() * 90
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 30, r: Math.random() * 360, s: 0.6 + Math.random() * 0.9, c: ['#d9772b', '#e6bb78', '#c0283f', '#2a6b99', '#23764b'][i % 5] }
    })
  }, [celebration])

  return (
    <AnimatePresence>
      {celebration && (
        <motion.div key={celebration.key} className="pointer-events-none fixed inset-0 z-[80]" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {particles.map((p, i) => (
            <motion.span
              key={i}
              className="absolute"
              style={{ left: celebration.x, top: celebration.y, color: p.c }}
              initial={{ x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }}
              animate={{ x: p.dx, y: p.dy + 40, scale: p.s, rotate: p.r, opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            >
              <Star size={18} className="fill-current" />
            </motion.span>
          ))}
          <motion.div
            className="absolute -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-base font-extrabold text-onbrand shadow-lg"
            style={{ left: celebration.x, top: celebration.y }}
            initial={{ y: 0, scale: 0.4, opacity: 0 }} animate={{ y: -70, scale: 1, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          >
            +{celebration.stars} ⭐
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
