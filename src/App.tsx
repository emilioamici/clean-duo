import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { BottomNav, Background, Celebration, NotificationCenter, NotificationToast, Toast } from './components/Chrome'
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
      <div className="mx-auto flex h-full max-w-md items-stretch md:items-center">
        {/* guscio "telefono" su desktop */}
        <div className="relative h-full w-full overflow-hidden md:h-[min(52rem,calc(100dvh-2rem))] md:rounded-[2.75rem] md:border md:border-line md:shadow-[0_40px_100px_-20px_rgb(var(--glass-shade))]">
          <div ref={scroller} className={`h-full overflow-y-auto overscroll-contain px-4 pt-safe ${gate ? 'pb-6' : 'pb-32'}`}>
            {gate ? (
              <Gate key={gate} reconnect={gate === 'reconnect'} />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(6px)' }}
                  transition={{ duration: 0.18 }}
                  className="pt-4"
                >
                  {tab === 'today' && <TodayView />}
                  {tab === 'rooms' && <RoomsView />}
                  {tab === 'ranking' && <RankingView />}
                  {tab === 'settings' && <SettingsView />}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
          {!gate && <div id="shell-overlay" className="pointer-events-none absolute inset-0 z-30" />}
          {!gate && (
            <>
              <BottomNav />
              <TaskSheet />
              <RoomSheet />
              <MemberSheet />
              <AutomationSheet />
              <MemberSwitcher />
              <NotificationCenter />
              <NotificationToast />
            </>
          )}
          <Toast />
        </div>
      </div>
      <Celebration />
    </>
  )
}
