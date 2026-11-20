import type { AppDatabase } from '../types'
import { currentAssignee, endOfDay, nextDue } from './clean'
import { isEventDriven } from './deps'
import { t } from '../i18n'
import type { ScheduledReminder } from '../services/push'

export const DEFAULT_REMINDER_TIME = '18:00'
export const validTime = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

/** Azioni di cui `me` deve occuparsi entro la fine del giorno `day` (se nessuno le completa prima). */
export function dueFor(db: AppDatabase, me: string | null, day: number): number {
  return db.tasks.filter((x) => {
    if (x.archived) return false
    const due = nextDue(x)
    if (due === null || due > endOfDay(day)) return false
    const who = currentAssignee(x)
    return !who || who === me
  }).length
}

/** Quante azioni ci sono ora da fare oggi (o in ritardo) per `me`. */
export const dueNow = (db: AppDatabase, me: string | null, now = Date.now()): number => dueFor(db, me, now)

export function reminderText(n: number): { title: string; body: string } {
  return {
    title: t('Azioni da fare oggi'),
    body: n === 1 ? t('C’è 1 azione da fare: dai un’occhiata a cosa manca.') : t('Ci sono {n} azioni da fare: dai un’occhiata a cosa manca.', { n }),
  }
}

/** I promemoria dei prossimi giorni all'ora scelta; si ricalcolano a ogni sincronizzazione. Solo i giorni con azioni da fare. */
export function buildReminders(db: AppDatabase, me: string | null, time: string, now = Date.now(), days = 4): ScheduledReminder[] {
  if (!validTime(time)) return []
  const [hh, mm] = time.split(':').map(Number)
  const out: ScheduledReminder[] = []
  for (let i = 0; i < days; i++) {
    const at = new Date(now); at.setDate(at.getDate() + i); at.setHours(hh, mm, 0, 0)
    if (at.getTime() <= now + 30_000) continue
    const n = dueFor(db, me, at.getTime())
    if (n > 0) out.push({ at: at.getTime(), ...reminderText(n), tag: 'cleanduo-reminder' })
  }
  return out
}

/** Ora (locale) a cui avvisare che un'azione con scadenza a giorni è diventata «da fare». */
export const TODO_NOTICE_HOUR = 8

/**
 * Notifiche «è ora da fare» per le azioni con il flag e una scadenza nei prossimi giorni, all'ora fissa del mattino
 * del giorno di scadenza. Più azioni nello stesso giorno diventano una sola notifica. Quelle in attesa di un'altra
 * azione o di un dispositivo non c'entrano: le avvisa il momento in cui partono.
 */
export function buildTodoNotices(db: AppDatabase, me: string | null, now = Date.now(), days = 7): ScheduledReminder[] {
  const byTime = new Map<number, string[]>()
  for (const x of db.tasks) {
    if (!x.notifyWhenTodo || x.archived || isEventDriven(x)) continue
    const due = nextDue(x)
    if (due === null) continue
    const who = currentAssignee(x)
    if (who && who !== me) continue
    const at = new Date(due); at.setHours(TODO_NOTICE_HOUR, 0, 0, 0)
    if (at.getTime() <= now + 30_000 || at.getTime() > now + days * 86_400_000) continue
    byTime.set(at.getTime(), [...(byTime.get(at.getTime()) ?? []), x.name])
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([at, names]) => ({
    at, tag: `cleanduo-todo-${at}`,
    title: names.length === 1 ? t('«{task}» è ora da fare', { task: names[0] }) : t('{n} azioni da fare', { n: names.length }),
    body: names.length === 1 ? t('Dai un’occhiata alla lista.') : names.join(', '),
  }))
}
