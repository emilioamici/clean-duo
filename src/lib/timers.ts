import type { AppDatabase, Task } from '../types'
import { t } from '../i18n'
import { triggerDependents } from './deps'

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
export function startRunning(task: Task, memberId: string, now = Date.now()): Task {
  const min = Math.min(MAX_DURATION_MIN, Math.max(1, task.durationMin ?? 0))
  return { ...task, runningUntil: now + min * 60_000, runningBy: memberId, updatedAt: now }
}

/**
 * Completa le azioni il cui tempo è scaduto: segna l'ora di fine come completamento, assegna le stelle a chi l'ha avviata
 * e toglie lo stato «in corso». Ritorna lo stesso oggetto se non c'è nulla da fare (idempotente tra dispositivi).
 */
export function finalizeTimers(db: AppDatabase, now = Date.now()): AppDatabase {
  const due = db.tasks.filter((x) => x.runningUntil && x.runningUntil <= now)
  if (due.length === 0) return db
  const logs = [...db.logs]
  let tasks = db.tasks.map((x) => {
    if (!x.runningUntil || x.runningUntil > now) return x
    const until = x.runningUntil
    const by = x.runningBy && db.members.some((m) => m.id === x.runningBy) ? x.runningBy : db.members[0]?.id
    const id = timerLogId(x.id, until)
    if (by && !logs.some((l) => l.id === id)) {
      logs.unshift({ id, taskId: x.id, taskName: x.name, roomId: x.roomId, memberId: by, stars: x.stars, at: until, timer: true, prev: x.lastCompletedAt, prevTrigger: x.triggeredAt ?? null })
    }
    return {
      ...x, lastCompletedAt: Math.max(x.lastCompletedAt ?? 0, until), completions: x.completions + 1,
      archived: x.recurrence.type === 'once' && !x.afterTaskId, triggeredAt: x.afterTaskId ? null : x.triggeredAt,
      runningUntil: null, runningBy: undefined, updatedAt: now,
    }
  })
  // chi dipende da un'azione a tempo diventa «da fare» quando il tempo è finito
  for (const x of due) tasks = triggerDependents(tasks, x.id, x.runningUntil!, now)
  return { ...db, tasks, logs: logs.slice(0, 2000) }
}
