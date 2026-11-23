import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { BottomNav, SidebarNav, Background, Celebration, NotificationCenter, NotificationToast, Toast } from './components/Chrome'
import { useLang } from './i18n'
import { RankingView } from './components/RankingView'
import { RoomsView } from './components/RoomsView'
import { SettingsView } from './components/SettingsView'
import { MemberSheet, MemberSwitcher, RoomSheet, TaskSheet } from './components/Sheets'
import { AutomationSheet } from './components/AutomationSheet'
import { TodayView } from './components/TodayView'
import { Gate } from './components/Gate'
import { useApp } from './store/AppContext'
import { useUi } from './store/UiContext'

export default function App() {
  useLang()
  const { tab, roomId } = useUi()
  const { mode, status, demoSkipped, offlineSkipped } = useApp()
  // prima pagina: accesso con Google (o demo se scelta); sessione scaduta -> riaccesso
  const gate: 'login' | 'reconnect' | null = mode === 'demo' ? (demoSkipped ? null : 'login') : status === 'auth' && !offlineSkipped ? 'reconnect' : null
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }) }, [tab, roomId])

  return (
    <>
      <Background />
      {gate ? (
        <div className="mx-auto flex h-full max-w-md items-center justify-center p-4">
          <div className="relative h-full w-full overflow-hidden rounded-3xl border border-line bg-surface/80 p-4 shadow-xl backdrop-blur-md">
            <div ref={scroller} className="h-full overflow-y-auto overscroll-contain px-2 py-4">
              <Gate key={gate} reconnect={gate === 'reconnect'} />
            </div>
            <Toast />
          </div>
        </div>
      ) : (
        <div className="mx-auto flex h-full w-full max-w-7xl items-stretch md:p-6 md:gap-6">
          {/* Barra laterale per tablet e desktop */}
          <SidebarNav />

          {/* Pannello principale responsive */}
          <main className="relative flex-1 h-full min-w-0 overflow-hidden md:rounded-[2.5rem] md:border md:border-line md:shadow-[0_20px_60px_-15px_rgb(var(--glass-shade))] bg-surface/30 md:backdrop-blur-sm">
            <div
              ref={scroller}
              className="h-full overflow-y-auto overscroll-contain px-4 md:px-8 pt-safe md:pt-6 pb-28 md:pb-8"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="pt-2 md:pt-0 max-w-5xl mx-auto"
                >
                  {tab === 'today' && <TodayView />}
                  {tab === 'rooms' && <RoomsView />}
                  {tab === 'ranking' && <RankingView />}
                  {tab === 'settings' && <SettingsView />}
                </motion.div>
              </AnimatePresence>
            </div>

            <div id="shell-overlay" className="pointer-events-none absolute inset-0 z-30" />
            <BottomNav />
            <TaskSheet />
            <RoomSheet />
            <MemberSheet />
            <AutomationSheet />
            <MemberSwitcher />
            <NotificationCenter />
            <NotificationToast />
            <Toast />
          </main>
        </div>
      )}
      <Celebration />
    </>
  )
}
