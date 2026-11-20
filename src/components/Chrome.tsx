import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellRing, CheckCheck, ClipboardPlus, Cloud, CloudCheck, CloudOff, LayoutGrid, ListChecks, Loader2, Plus, RefreshCw, Settings, Star, TriangleAlert, Trophy, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TabId } from '../types'
import { urgencyOf } from '../lib/clean'
import { timeAgo } from '../lib/stats'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import type { Notif } from '../lib/notifications'
import { t } from '../i18n'
import { MascotImg } from './Mascots'
import { Avatar, Sheet } from './ui'

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

/** Pulsante flottante «+». Si disegna nello strato fisso della schermata (le pagine hanno animazioni che altrimenti lo farebbero scorrere). */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.getElementById('shell-overlay')), [])
  if (!host) return null
  return createPortal(
    <motion.button
      whileTap={{ scale: 0.9 }} onClick={onClick} aria-label={label}
      className="glass-btn btn-primary pointer-events-auto absolute right-5 !h-14 !w-14 !p-0"
      style={{ bottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}
    >
      <Plus size={26} strokeWidth={2.6} />
    </motion.button>,
    host,
  )
}

export function BottomNav() {
  const { tab, setTab } = useUi()
  const { db } = useApp()
  const badge = useMemo(() => db.tasks.filter((x) => ['overdue', 'today'].includes(urgencyOf(x))).length, [db.tasks])
  const TABS: { id: TabId; label: string; icon: typeof ListChecks }[] = [
    { id: 'today', label: t('Oggi'), icon: ListChecks },
    { id: 'rooms', label: t('Stanze'), icon: LayoutGrid },
    { id: 'ranking', label: t('Sfida'), icon: Trophy },
    { id: 'settings', label: t('Impostazioni'), icon: Settings },
  ]

  return (
    <nav className="glass absolute inset-x-4 bottom-4 z-40 flex items-center justify-between !rounded-full p-1.5" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id
        return (
          <button key={id} onClick={() => setTab(id)} aria-label={label} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 transition active:scale-90">
            {active && (
              <motion.span layoutId="nav-drop" className="glass-active absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.9 }} />
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
    demo: { icon: <CloudOff size={15} />, text: t('Demo locale'), cls: '' },
    idle: { icon: dirty ? <Cloud size={15} /> : <CloudCheck size={15} />, text: lastSyncAt ? t('Sync {when}', { when: timeAgo(lastSyncAt) }) : t('Sync'), cls: 'text-inc' },
    syncing: { icon: <Loader2 size={15} className="animate-spin" />, text: t('Sync…'), cls: '' },
    offline: { icon: <CloudOff size={15} />, text: t('Offline'), cls: 'text-brand' },
    auth: { icon: <TriangleAlert size={15} />, text: t('Riconnetti'), cls: 'text-exp' },
    error: { icon: <TriangleAlert size={15} />, text: t('Errore'), cls: 'text-exp' },
  }[status]
  return (
    <button
      onClick={() => (status === 'auth' ? void reconnect() : mode === 'drive' ? void syncNow() : undefined)}
      className={`glass-btn !px-3 !py-1.5 text-xs ${map.cls}`}
      aria-label={t('Sincronizza')}
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
    <button onClick={() => openSwitcher(true)} className="glass-btn !p-1" aria-label={t('Cambia utente')}>
      <Avatar member={me} size={30} />
    </button>
  )
}

export function NotificationBell() {
  const { unread, setCenterOpen, mode } = useApp()
  if (mode === 'demo') return null
  return (
    <button className="glass-btn relative !p-2.5" aria-label={unread ? t('Notifiche ({n} non lette)', { n: unread }) : t('Notifiche')} onClick={() => setCenterOpen(true)}>
      <Bell size={20} />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-exp px-1 text-[10px] font-bold text-onbrand">{unread > 9 ? '9+' : unread}</span>}
    </button>
  )
}

const NOTIF_ICON = { done: CheckCheck, task: ClipboardPlus, member: UserPlus, reminder: BellRing } as const

function NotifIcon({ n }: { n: Notif }) {
  const I = NOTIF_ICON[n.kind]
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><I size={18} /></span>
}

/** Elenco delle notifiche; toccandone una si apre l'azione. */
export function NotificationCenter() {
  const { notifications, centerOpen, setCenterOpen, markRead, markAllRead, clearNotifications, unread, db } = useApp()
  const { openTaskSheet } = useUi()
  const open = (n: Notif) => {
    markRead(n.id)
    if (n.taskId && db.tasks.some((x) => x.id === n.taskId)) { setCenterOpen(false); openTaskSheet({ id: n.taskId }) }
  }
  return (
    <Sheet open={centerOpen} onClose={() => setCenterOpen(false)} title={t('Notifiche')}>
      {notifications.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted">
          <MascotImg kind="mochi" className="mx-auto mb-3 h-20 w-auto" />
          <p className="font-semibold text-ink">{t('Nessuna notifica')}</p>
          <p className="mx-auto mt-1 max-w-xs">{t('Ti avviso quando un altro membro completa o crea un’azione, quando entra qualcuno in casa e, se vuoi, con un promemoria delle azioni da fare.')}</p>
        </div>
      ) : (
        <>
          <ul className="-mx-2 divide-y divide-line/50">
            {notifications.map((n) => (
              <li key={n.id}>
                <button className="flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left hover:bg-line/30" onClick={() => open(n)}>
                  <NotifIcon n={n} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read ? 'font-medium' : 'font-bold'}`}>{n.title}</span>
                    <span className="block text-xs text-muted">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">{timeAgo(n.at)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label={t('Non letta')} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button className="glass-btn flex-1" disabled={unread === 0} onClick={markAllRead}>{t('Segna tutte come lette')}</button>
            <button className="glass-btn" onClick={clearNotifications}>{t('Svuota')}</button>
          </div>
        </>
      )}
    </Sheet>
  )
}

/** Avviso in primo piano quando arriva una notifica mentre l'app è aperta. */
export function NotificationToast() {
  const { toastNotif, dismissToastNotif, setCenterOpen } = useApp()
  return (
    <AnimatePresence>
      {toastNotif && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }}
          className="glass-strong absolute inset-x-4 top-4 z-[65] flex items-start gap-3 p-3" style={{ marginTop: 'env(safe-area-inset-top)' }} role="status" aria-live="polite"
        >
          <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => { dismissToastNotif(); setCenterOpen(true) }}>
            <NotifIcon n={toastNotif} />
            <span className="min-w-0"><span className="block text-sm font-bold">{toastNotif.title}</span><span className="block truncate text-xs text-muted">{toastNotif.body}</span></span>
          </button>
          <button className="rounded-full p-1 text-muted hover:bg-line/60" aria-label={t('Chiudi')} onClick={dismissToastNotif}><X size={16} /></button>
        </motion.div>
      )}
    </AnimatePresence>
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
