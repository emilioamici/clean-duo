import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import type { TabId } from '../types'
import { t } from '../i18n'
import { timeOfDay } from '../lib/timers'
import { useApp } from './AppContext'

export type TaskSheetState = { id?: string; roomId?: string } | null
export type CelebrationState = { key: number; stars: number; x: number; y: number } | null

interface UiCtx {
  tab: TabId
  setTab: (t: TabId) => void
  roomId: string | null
  openRoom: (id: string | null) => void
  taskSheet: TaskSheetState
  openTaskSheet: (s: TaskSheetState) => void
  roomSheet: { id?: string } | null
  openRoomSheet: (s: { id?: string } | null) => void
  memberSheet: { id?: string } | null
  openMemberSheet: (s: { id?: string } | null) => void
  switcherOpen: boolean
  openSwitcher: (o: boolean) => void
  celebration: CelebrationState
  /** Completa una task come membro corrente, con feedback aptico + animazione. */
  complete: (taskId: string, origin?: { x: number; y: number }) => void
  /** «Completa ora» su un'azione in corso. */
  finish: (taskId: string, origin?: { x: number; y: number }) => void
  resumePending: (memberId: string) => void
}

const Ctx = createContext<UiCtx | null>(null)
export function useUi(): UiCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useUi fuori da UiProvider')
  return c
}

export function UiProvider({ children }: { children: ReactNode }) {
  const app = useApp()
  const [tab, setTabState] = useState<TabId>('today')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [taskSheet, openTaskSheet] = useState<TaskSheetState>(null)
  const [roomSheet, openRoomSheet] = useState<{ id?: string } | null>(null)
  const [memberSheet, openMemberSheet] = useState<{ id?: string } | null>(null)
  const [switcherOpen, openSwitcher] = useState(false)
  const [celebration, setCelebration] = useState<CelebrationState>(null)
  const pending = useRef<{ taskId: string; origin?: { x: number; y: number } } | null>(null)

  const setTab = (t: TabId) => { setTabState(t); if (t !== 'rooms') setRoomId(null) }
  const openRoom = (id: string | null) => { setRoomId(id); if (id) setTabState('rooms') }

  const doComplete = useCallback((taskId: string, memberId: string, origin?: { x: number; y: number }) => {
    const task = app.db.tasks.find((x) => x.id === taskId)
    if (task?.durationMin) {
      // azione con durata: il tap la avvia; si completa da sola alla fine
      if (task.runningUntil) return
      const until = app.startTimer(taskId, memberId)
      if (until) {
        try { navigator.vibrate?.(30) } catch { /* non supportato (iOS) */ }
        app.notify(t('«{task}» in corso: finisce alle {time}', { task: task.name, time: timeOfDay(until) }))
      }
      return
    }
    const stars = app.completeTask(taskId, memberId)
    if (!stars) return
    try { navigator.vibrate?.([18, 40, 24]) } catch { /* non supportato (iOS) */ }
    setCelebration({ key: Date.now(), stars, x: origin?.x ?? window.innerWidth / 2, y: origin?.y ?? window.innerHeight / 2 })
  }, [app])

  const complete = useCallback((taskId: string, origin?: { x: number; y: number }) => {
    const members = app.db.members
    const who = app.me ?? (members.length === 1 ? members[0] : null)
    if (!who) {
      pending.current = { taskId, origin }
      openSwitcher(true)
      return
    }
    doComplete(taskId, who.id, origin)
  }, [app.db.members, app.me, doComplete])

  const finish = useCallback((taskId: string, origin?: { x: number; y: number }) => {
    const stars = app.finishTimer(taskId)
    if (!stars) return
    try { navigator.vibrate?.([18, 40, 24]) } catch { /* non supportato (iOS) */ }
    setCelebration({ key: Date.now(), stars, x: origin?.x ?? window.innerWidth / 2, y: origin?.y ?? window.innerHeight / 2 })
  }, [app])

  const resumePending = useCallback((memberId: string) => {
    const p = pending.current
    pending.current = null
    if (p) doComplete(p.taskId, memberId, p.origin)
  }, [doComplete])

  return (
    <Ctx.Provider value={{ tab, setTab, roomId, openRoom, taskSheet, openTaskSheet, roomSheet, openRoomSheet, memberSheet, openMemberSheet, switcherOpen, openSwitcher, celebration, complete, finish, resumePending }}>
      {children}
    </Ctx.Provider>
  )
}
