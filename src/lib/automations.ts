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
  const isMember = (id?: string | null): id is string => !!id && db.members.some((m) => m.id === id)
  const who = isMember(e.who) ? e.who : null
  // chi ha avviato l'azione la tiene: un comando «finisci» si limita a chiuderla; se non ha assegnatario, ci si assegna chi dà il comando (se c'è)
  const owner = isMember(task.runningBy) ? task.runningBy : who
  const running = isRunning(task)
  const action = e.do ?? (running ? 'finish' : task.durationMin ? 'start' : 'complete')
  const stamp = (x: Task): Task => ({ ...x, lastCommandAt: e.at, updatedAt: now })

  let next: AppDatabase | null = null
  if (action === 'finish') {
    // «finisci» vale solo se l'azione è davvero in corso: altrimenti non si fa nulla (e l'errore si vede nella scheda)
    if (task.runningUntil) next = finishEarly({ ...db, tasks: db.tasks.map((x) => (x.id === task.id ? { ...x, runningBy: owner ?? undefined } : x)) }, task.id, now, e.at)
    else if (running) next = completeBy(db, task, owner, `l-sc-${e.id}`, e.at, now) // «in corso» da dispositivo: si completa
  } else if (action === 'start') {
    if (!running) {
      // senza membro (`who` assente o sconosciuto) parte senza assegnatario: qualcuno può prenderla dopo con «Assegna a me»
      if (task.durationMin) next = { ...db, tasks: db.tasks.map((x) => (x.id === task.id ? startRunning(x, who ?? undefined, e.at, undefined) : x)) }
      else next = { ...db, tasks: db.tasks.map((x) => (x.id === task.id ? { ...x, autoRunSince: e.at, autoRunRule: auto.id, runningBy: who ?? undefined } : x)) }
    }
  } else if (action === 'complete') {
    if (!(task.lastCompletedAt && task.lastCompletedAt >= e.at)) next = completeBy(db, task, who, `l-sc-${e.id}`, e.at, now)
  } else if (action === 'todo') {
    if (isOnDemand(task)) next = { ...db, tasks: db.tasks.map((x) => (x.id === task.id ? { ...x, todoAt: Math.max(e.at, (x.lastCompletedAt ?? 0) + 1) } : x)) }
  }
  if (!next) return mark(t('Comando «{cmd}» non applicabile a «{name}» in questo momento.', { cmd: action, name: task.name }))
  task = next.tasks.find((x) => x.id === task.id)!
  return { ...next, tasks: next.tasks.map((x) => (x.id === task.id ? stamp(x) : x)), automations: (mark().automations) }
}

/**
 * Completa un'azione «in corso» o richiesta da un'automazione: a un membro (stelle) oppure senza membro né stelle.
 * `id` stabile: lo stesso comando applicato due volte non duplica il completamento.
 */
export function completeBy(db: AppDatabase, task: Task, who: string | null, id: string, at: number, now: number, flags: Partial<ActivityLog> = {}): AppDatabase {
  if (db.logs.some((l) => l.id === id)) return db
  const rooms = taskRooms(task)
  const log: ActivityLog = {
    id, taskId: task.id, taskName: task.name, roomId: rooms[0], ...(rooms.length > 1 ? { roomIds: rooms } : {}),
    memberId: who ?? '', stars: who ? task.stars : 0, at, ...(who ? {} : { timer: true, auto: true }),
    prev: task.lastCompletedAt, prevTrigger: task.triggeredAt ?? null, prevRoomDone: task.roomDone ?? null, ...flags,
  }
  const tasks = triggerDependents(db.tasks.map((x) => (x.id === task.id ? applyCompletion(x, rooms, at, now) : x)), task.id, at, now)
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
        const assignee = auto.assignTo && db.members.some((m) => m.id === auto.assignTo) ? auto.assignTo : undefined
        tasks = tasks.map((x) => (x.id === task.id ? { ...x, autoRunSince: e.at, autoRunRule: auto.id, runningBy: assignee, updatedAt: now } : x))
      } else if (e.kind === 'finish') {
        const id = cycleLogId(auto.id, e.at)
        if (logs.some((l) => l.id === id) || (task.lastCompletedAt && task.lastCompletedAt >= e.at)) continue
        // le stelle vanno a chi si è assegnato il ciclo (o a chi l'automazione assegna di base); se nessuno, nessuna stella
        const who = task.autoRunSince && task.runningBy && db.members.some((m) => m.id === task.runningBy) ? task.runningBy : null
        const out = completeBy({ ...db, tasks, logs, automations }, task, who, id, e.at, now, { timer: true, ...(who ? {} : { auto: true }) })
        tasks = out.tasks; logs = out.logs
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
