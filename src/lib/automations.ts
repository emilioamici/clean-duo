import type { ActivityLog, AppDatabase, Automation, Task } from '../types'
import { t } from '../i18n'
import { isOnDemand, triggerDependents } from './deps'
import { applyCompletion, taskRooms } from './rooms'
import { AUTO_RUN_MAX_MS, finalizeTimers, finishEarly, isRunning, startRunning } from './timers'

/** Un segnale del dispositivo, consegnato dal server (Worker) all'app. `kind` solo per inizio/fine di un ciclo. */
export interface AutomationEvent { id: string; ruleId: string; at: number; kind?: 'start' | 'finish' | 'act'; task?: string; do?: 'todo' | 'complete' | 'start' | 'finish'; who?: string }

/** Identificativo stabile del completamento a fine ciclo: due dispositivi che applicano lo stesso segnale producono lo stesso. */
export const cycleLogId = (ruleId: string, at: number): string => `l-auto-${ruleId}-${at}`

/**
 * Comando da Shortcuts: `do` = todo | complete | start | finish; assente = decide lo stato dell'azione
 * (in corso → finisce; con durata → avvia; altrimenti completa). L'azione si indica con l'id o con il nome (se è uno solo).
 * Un comando non più recente dell'ultimo già applicato non si applica di nuovo (il segno viaggia con l'azione, nel merge).
 * Chi non è un membro non riceve stelle; avviare un'azione a tempo richiede un membro (a lui vanno le stelle).
 */
function runCommand(db: AppDatabase, auto: Automation, e: AutomationEvent, now: number): AppDatabase {
  const text = (e.task ?? '').trim()
  const live = db.tasks.filter((x) => !x.archived)
  const byId = live.find((x) => x.id === text)
  const found = byId ? [byId] : live.filter((x) => x.name.trim().toLowerCase() === text.toLowerCase())
  const mark = (error?: string): AppDatabase => ({ ...db, automations: (db.automations ?? []).map((a) => (a.id === auto.id ? { ...a, lastFiredAt: Math.max(a.lastFiredAt ?? 0, e.at), lastError: error, updatedAt: now } : a)) })
  if (!text || found.length !== 1) return mark(found.length > 1 ? t('Più azioni si chiamano «{name}»: usa l’id.', { name: text }) : t('Azione non riconosciuta: «{name}»', { name: text }))

  // i timer finiti prima di questo comando si chiudono all'ora giusta: due comandi accodati ad app chiusa non si confondono
  db = finalizeTimers(db, e.at)
  let task = db.tasks.find((x) => x.id === found[0].id)!
  if (task.lastCommandAt && task.lastCommandAt >= e.at) return db
  const who = e.who && db.members.some((m) => m.id === e.who) ? e.who : null
  const running = isRunning(task)
  const action = e.do ?? (running ? 'finish' : task.durationMin ? 'start' : 'complete')
  const stamp = (x: Task): Task => ({ ...x, lastCommandAt: e.at, updatedAt: now })

  let next: AppDatabase | null = null
  if (action === 'finish') {
    if (task.runningUntil) next = finishEarly(db, task.id, now, e.at)
    else if (running) next = completeBy(db, task, who, e, now) // «in corso» da dispositivo: si completa
  } else if (action === 'start') {
    if (!running) {
      if (task.durationMin && who) next = { ...db, tasks: db.tasks.map((x) => (x.id === task.id ? startRunning(x, who, e.at, undefined) : x)) }
      else if (!task.durationMin) next = { ...db, tasks: db.tasks.map((x) => (x.id === task.id ? { ...x, autoRunSince: e.at, autoRunRule: auto.id } : x)) }
    }
  } else if (action === 'complete') {
    if (!(task.lastCompletedAt && task.lastCompletedAt >= e.at)) next = completeBy(db, task, who, e, now)
  } else if (action === 'todo') {
    if (isOnDemand(task)) next = { ...db, tasks: db.tasks.map((x) => (x.id === task.id ? { ...x, todoAt: Math.max(e.at, (x.lastCompletedAt ?? 0) + 1) } : x)) }
  }
  if (!next) return mark(t('Comando «{cmd}» non applicabile a «{name}» in questo momento.', { cmd: action, name: task.name }))
  task = next.tasks.find((x) => x.id === task.id)!
  return { ...next, tasks: next.tasks.map((x) => (x.id === task.id ? stamp(x) : x)), automations: (mark().automations) }
}

/** Completa un'azione per un comando: a un membro (stelle) oppure senza membro né stelle. Log con id stabile. */
function completeBy(db: AppDatabase, task: Task, who: string | null, e: AutomationEvent, now: number): AppDatabase {
  const id = `l-sc-${e.id}`
  if (db.logs.some((l) => l.id === id)) return db
  const rooms = taskRooms(task)
  const log: ActivityLog = {
    id, taskId: task.id, taskName: task.name, roomId: rooms[0], ...(rooms.length > 1 ? { roomIds: rooms } : {}),
    memberId: who ?? '', stars: who ? task.stars : 0, at: e.at, ...(who ? {} : { timer: true, auto: true }),
    prev: task.lastCompletedAt, prevTrigger: task.triggeredAt ?? null, prevRoomDone: task.roomDone ?? null,
  }
  const tasks = triggerDependents(db.tasks.map((x) => (x.id === task.id ? applyCompletion(x, rooms, e.at, now) : x)), task.id, e.at, now)
  return { ...db, tasks, logs: [log, ...db.logs].slice(0, 2000) }
}

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
    if (auto?.kind === 'shortcut') {
      if (e.kind !== 'act' || !auto.enabled) continue
      const out = runCommand({ ...db, tasks, logs, automations }, auto, e, now)
      tasks = out.tasks; logs = out.logs; automations = out.automations ?? automations
      changed = true
      continue
    }
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
export const describeAutomation = (a: Pick<Automation, 'kind' | 'code' | 'op' | 'value'>): string => (a.kind === 'cycle' ? t('Inizio e fine del ciclo') : a.kind === 'shortcut' ? t('Comandi da Shortcuts (iPhone)') : describeCondition(a))
