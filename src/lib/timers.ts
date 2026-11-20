import type { AppDatabase, Task } from '../types'
import { t } from '../i18n'
import { triggerDependents } from './deps'
import { applyCompletion, taskRooms } from './rooms'

export const MAX_DURATION_MIN = 24 * 60
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180]

export const isRunning = (task: Task): boolean => !!task.runningUntil && !task.archived
export const remainingMs = (task: Task, now = Date.now()): number => Math.max(0, (task.runningUntil ?? 0) - now)

/** «45 min», «1 h», «1 h 30» */
export function durationLabel(min: number): string {
  if (min < 60) return t('{n} min', { n: min })
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? t('{n} h', { n: h }) : t('{h} h {m}', { h, m })
}

/** Tempo che manca, per l'elenco: «tra 23 min», «tra 1 h 05». */
export function remainingLabel(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return t('tra {n} min', { n: min })
  const h = Math.floor(min / 60)
  const m = min % 60
  return t('tra {h} h {m}', { h, m: String(m).padStart(2, '0') })
}

export const timeOfDay = (ts: number): string => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Identificativo stabile del completamento a fine timer: due dispositivi che lo registrano insieme producono lo stesso. */
export const timerLogId = (taskId: string, until: number): string => `l-run-${taskId}-${until}`

/** Avvia il timer di un'azione (se ha una durata). */
export function startRunning(task: Task, memberId: string, now = Date.now(), rooms?: string[]): Task {
  const min = Math.min(MAX_DURATION_MIN, Math.max(1, task.durationMin ?? 0))
  return { ...task, runningUntil: now + min * 60_000, runningBy: memberId, runningRooms: rooms && rooms.length > 0 ? rooms : undefined, updatedAt: now }
}

function applyFinish(db: AppDatabase, items: Array<{ task: Task; end: number; early?: boolean }>, now: number): AppDatabase {
  const logs = [...db.logs]
  const ids = new Set(items.map((i) => i.task.id))
  const endOf = new Map(items.map((i) => [i.task.id, i]))
  let tasks = db.tasks.map((x) => {
    const it = endOf.get(x.id)
    if (!it) return x
    const by = x.runningBy && db.members.some((m) => m.id === x.runningBy) ? x.runningBy : db.members[0]?.id
    // lo stesso id anche se si finisce prima: la notifica del server (se arrivasse) ha lo stesso tag e non si duplica
    const id = timerLogId(x.id, x.runningUntil!)
    const rooms = x.runningRooms && x.runningRooms.length > 0 ? x.runningRooms : taskRooms(x)
    if (by && !logs.some((l) => l.id === id)) {
      logs.unshift({
        id, taskId: x.id, taskName: x.name, roomId: rooms[0], ...(taskRooms(x).length > 1 ? { roomIds: rooms } : {}), memberId: by, stars: x.stars, at: it.end, timer: true,
        ...(it.early ? { early: true } : {}), prev: x.lastCompletedAt, prevTrigger: x.triggeredAt ?? null, prevRoomDone: x.roomDone ?? null,
      })
    }
    return { ...applyCompletion(x, rooms, it.end, now), runningUntil: null, runningBy: undefined, runningRooms: undefined }
  })
  // chi dipende da un'azione a tempo diventa «da fare» quando il tempo è finito (o quando la si completa prima)
  for (const x of db.tasks) if (ids.has(x.id)) tasks = triggerDependents(tasks, x.id, endOf.get(x.id)!.end, now)
  return { ...db, tasks, logs: logs.slice(0, 2000) }
}

/**
 * Completa le azioni il cui tempo è scaduto: segna l'ora di fine come completamento, assegna le stelle a chi l'ha avviata
 * e toglie lo stato «in corso». Ritorna lo stesso oggetto se non c'è nulla da fare (idempotente tra dispositivi).
 */
export function finalizeTimers(db: AppDatabase, now = Date.now()): AppDatabase {
  const due = db.tasks.filter((x) => x.runningUntil && x.runningUntil <= now)
  return due.length === 0 ? db : applyFinish(db, due.map((x) => ({ task: x, end: x.runningUntil! })), now)
}

/** «Completa ora»: finisce subito un'azione in corso, senza aspettare la fine della durata. */
export function finishEarly(db: AppDatabase, taskId: string, now = Date.now()): AppDatabase {
  const x = db.tasks.find((y) => y.id === taskId)
  return x?.runningUntil ? applyFinish(db, [{ task: x, end: now, early: true }], now) : db
}
