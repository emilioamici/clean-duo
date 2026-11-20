import type { AppDatabase, Automation, Task } from '../types'
import { t } from '../i18n'

/** Un segnale del dispositivo, consegnato dal server (Worker) all'app. */
export interface AutomationEvent { id: string; ruleId: string; at: number }

/**
 * Applica i segnali dei dispositivi: l'azione collegata diventa «da fare» da quel momento
 * (se lo era già resta la data più vecchia). Idempotente: due dispositivi che applicano lo stesso segnale producono lo stesso risultato.
 */
export function applyAutomationEvents(db: AppDatabase, events: AutomationEvent[], now = Date.now()): AppDatabase {
  if (events.length === 0) return db
  let tasks = db.tasks
  let automations = db.automations ?? []
  let changed = false
  for (const e of events) {
    if (!tasks.some((x) => x.onEvent === e.ruleId && !x.archived)) continue
    tasks = tasks.map((x) => (x.onEvent === e.ruleId && !x.archived ? { ...x, triggeredAt: x.triggeredAt ?? e.at, updatedAt: now } : x))
    automations = automations.map((a) => (a.id === e.ruleId ? { ...a, lastFiredAt: Math.max(a.lastFiredAt ?? 0, e.at), updatedAt: now } : a))
    changed = true
  }
  return changed ? { ...db, tasks, automations } : db
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
