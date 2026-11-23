import type { ActivityLog, AppDatabase, Automation, Task } from '../types'
import { t } from '../i18n'
import { triggerDependents } from './deps'
import { applyCompletion, taskRooms } from './rooms'
import { AUTO_RUN_MAX_MS } from './timers'

/** Un segnale del dispositivo, consegnato dal server (Worker) all'app. `kind` solo per inizio/fine di un ciclo. */
export interface AutomationEvent { id: string; ruleId: string; at: number; kind?: 'start' | 'finish' }

/** Identificativo stabile del completamento a fine ciclo: due dispositivi che applicano lo stesso segnale producono lo stesso. */
export const cycleLogId = (ruleId: string, at: number): string => `l-auto-${ruleId}-${at}`

/**
 * Applica i segnali dei dispositivi.
 * - Tuya: l'azione collegata diventa «da fare» da quel momento (se lo era già resta la data più vecchia).
 * - Ciclo (`cycle`): `start` mette l'azione «in corso» (senza ora di fine); `finish` la completa, senza membro e senza stelle.
 * Idempotente: due dispositivi che applicano lo stesso segnale producono lo stesso risultato.
 */
export function applyAutomationEvents(db: AppDatabase, events: AutomationEvent[], now = Date.now()): AppDatabase {
  if (events.length === 0) return db
  let tasks = db.tasks
  let logs = db.logs
  let automations = db.automations ?? []
  let changed = false
  const touch = (id: string, at: number) => { automations = automations.map((a) => (a.id === id ? { ...a, lastFiredAt: Math.max(a.lastFiredAt ?? 0, at), updatedAt: now } : a)) }

  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const auto = automations.find((a) => a.id === e.ruleId)
    if (auto?.kind === 'cycle') {
      const task = tasks.find((x) => x.id === auto.taskId && !x.archived)
      if (!task || !auto.enabled) continue
      if (e.kind === 'start') {
        if (e.at + AUTO_RUN_MAX_MS <= now) continue // segnale troppo vecchio: il ciclo sarà già finito
        if (task.runningUntil || (task.autoRunSince && task.autoRunSince >= e.at)) continue
        if (task.lastCompletedAt && task.lastCompletedAt >= e.at) continue // il «finito» è già stato applicato (segnali fuori ordine)
        tasks = tasks.map((x) => (x.id === task.id ? { ...x, autoRunSince: e.at, autoRunRule: auto.id, updatedAt: now } : x))
      } else if (e.kind === 'finish') {
        const id = cycleLogId(auto.id, e.at)
        if (logs.some((l) => l.id === id) || (task.lastCompletedAt && task.lastCompletedAt >= e.at)) continue
        const rooms = taskRooms(task)
        const log: ActivityLog = {
          id, taskId: task.id, taskName: task.name, roomId: rooms[0], ...(rooms.length > 1 ? { roomIds: rooms } : {}),
          memberId: '', stars: 0, at: e.at, timer: true, auto: true,
          prev: task.lastCompletedAt, prevTrigger: task.triggeredAt ?? null, prevRoomDone: task.roomDone ?? null,
        }
        tasks = triggerDependents(tasks.map((x) => (x.id === task.id ? applyCompletion(x, rooms, e.at, now) : x)), task.id, e.at, now)
        logs = [log, ...logs].slice(0, 2000)
      } else continue
      touch(auto.id, e.at)
      changed = true
      continue
    }
    if (!tasks.some((x) => x.onEvent === e.ruleId && !x.archived)) continue
    tasks = tasks.map((x) => (x.onEvent === e.ruleId && !x.archived ? { ...x, triggeredAt: x.triggeredAt ?? e.at, updatedAt: now } : x))
    touch(e.ruleId, e.at)
    changed = true
  }
  return changed ? { ...db, tasks, automations, logs } : db
}

/** Le azioni collegate a un'automazione che non esiste più tornano normali. */
export function unlinkMissingAutomations(tasks: Task[], automations: Automation[] | undefined): Task[] {
  const ids = new Set((automations ?? []).map((a) => a.id))
  if (!tasks.some((x) => x.onEvent && !ids.has(x.onEvent))) return tasks
  return tasks.map((x) => (x.onEvent && !ids.has(x.onEvent) ? { ...x, onEvent: undefined, triggeredAt: null } : x))
}

export const OP_LABEL: Record<Automation['op'], () => string> = {
  eq: () => t('è uguale a'),
  ne: () => t('è diverso da'),
  lt: () => t('è minore di'),
  gt: () => t('è maggiore di'),
  bit: () => t('ha il bit attivo'),
  contains: () => t('contiene'),
}

export const describeCondition = (a: Pick<Automation, 'code' | 'op' | 'value'>): string => `${a.code} ${OP_LABEL[a.op]()} ${a.value}`
/** Descrizione breve per l'elenco delle automazioni. */
export const describeAutomation = (a: Pick<Automation, 'kind' | 'code' | 'op' | 'value'>): string => (a.kind === 'cycle' ? t('Inizio e fine del ciclo') : describeCondition(a))
