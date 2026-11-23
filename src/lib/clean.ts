import type { Room, Task } from '../types'
import { locale, t } from '../i18n'
import { isEventDriven } from './deps'
import { inRoom, lastFor, taskRooms } from './rooms'

export const DAY = 86_400_000

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ts: number): number {
  return startOfDay(ts) + DAY - 1
}

/** Lunedì della settimana contenente ts (00:00 locali) */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts))
  const dow = (d.getDay() + 6) % 7 // lun=0
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

export function startOfMonth(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

function addMonths(ts: number, months: number): number {
  const d = new Date(ts)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, max))
  return d.getTime()
}

/**
 * Prossima scadenza (ms) oppure null se «su richiesta» già fatta. Con `roomId` è quella di quella stanza;
 * senza, per un'azione con più stanze, è la più vicina (la più urgente).
 */
export function nextDue(task: Task, roomId?: string): number | null {
  if (task.archived) return null
  // azione che parte dopo un'altra: «da fare» da quando l'altra è stata completata, altrimenti in attesa
  if (isEventDriven(task)) return task.triggeredAt ? startOfDay(task.triggeredAt) : null
  const rooms = taskRooms(task)
  if (!roomId && rooms.length > 1) {
    const dues = rooms.map((r) => nextDue(task, r)).filter((d): d is number => d !== null)
    return dues.length ? Math.min(...dues) : null
  }
  const last = lastFor(task, roomId ?? rooms[0])
  const { type, every, weekdays } = task.recurrence
  const n = Math.max(1, every || 1)
  const ref = last ?? task.createdAt

  // «su richiesta»: da fare finché non è fatta la prima volta e ogni volta che viene segnata «da fare» dopo l'ultimo completamento
  if (type === 'once') {
    if (task.todoAt === null) return null
    return !last ? startOfDay(task.todoAt ?? task.createdAt) : task.todoAt && task.todoAt > last ? startOfDay(task.todoAt) : null
  }

  if (type === 'daily') {
    return last ? startOfDay(ref) + n * DAY : startOfDay(ref)
  }

  if (type === 'weekly') {
    if (weekdays && weekdays.length > 0) {
      const days = [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
      if (!last) {
        // Mai fatta: prima occorrenza da oggi della creazione in poi
        const base = startOfDay(ref)
        for (let i = 0; i < 7; i++) {
          const t = base + i * DAY
          if (days.includes(new Date(t).getDay())) return t
        }
      }
      const refDay = startOfDay(ref)
      const weekStart = startOfWeek(ref)
      // stessa settimana, giorno successivo a quello di completamento
      for (let i = 0; i < 7; i++) {
        const t = new Date(weekStart)
        t.setDate(t.getDate() + i)
        const ts = t.getTime()
        if (ts > refDay && days.includes(t.getDay())) return ts
      }
      // altrimenti: prima occorrenza di N settimane dopo
      const next = new Date(weekStart)
      next.setDate(next.getDate() + 7 * n)
      for (let i = 0; i < 7; i++) {
        const t = new Date(next)
        t.setDate(t.getDate() + i)
        if (days.includes(t.getDay())) return t.getTime()
      }
    }
    return last ? startOfDay(ref) + n * 7 * DAY : startOfDay(ref)
  }

  // monthly
  return last ? startOfDay(addMonths(ref, n)) : startOfDay(ref)
}

export type Urgency = 'overdue' | 'today' | 'soon' | 'later'

export function urgencyOf(task: Task, now = Date.now(), roomId?: string): Urgency {
  const due = nextDue(task, roomId)
  if (due === null) return 'later'
  if (due < startOfDay(now)) return 'overdue'
  if (due <= endOfDay(now)) return 'today'
  if (due <= endOfDay(now) + 2 * DAY) return 'soon'
  return 'later'
}

/** 0..1 — quanto è "pulita" la task (1 = appena fatta, 0 = scaduta). */
export function taskCleanliness(task: Task, now = Date.now(), roomId?: string): number {
  if (task.archived) return 1
  const rooms = taskRooms(task)
  if (!roomId && rooms.length > 1) return rooms.reduce((s, r) => s + taskCleanliness(task, now, r), 0) / rooms.length
  const due = nextDue(task, roomId)
  if (due === null) return 1
  // la scadenza è a inizio giornata: il "tempo utile" arriva a fine giornata
  const deadline = due + DAY
  const ref = isEventDriven(task) ? task.triggeredAt ?? now : lastFor(task, roomId ?? rooms[0]) ?? task.createdAt
  const total = task.recurrence.type === 'once' && !isEventDriven(task) ? 7 * DAY : Math.max(DAY, deadline - ref)
  return Math.max(0, Math.min(1, (deadline - now) / total))
}

/** 0..100 — media pesata per difficoltà delle task attive della stanza. */
export function roomCleanliness(room: Room, tasks: Task[], now = Date.now()): number {
  const active = tasks.filter((t) => inRoom(t, room.id) && !t.archived)
  if (active.length === 0) return 100
  let sum = 0
  let weight = 0
  for (const t of active) {
    sum += taskCleanliness(t, now, room.id) * t.stars
    weight += t.stars
  }
  return Math.round((sum / weight) * 100)
}

export function cleanColor(pct: number): string {
  // 0 = rosso (0°), 100 = verde (140°)
  const hue = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 140)
  return `hsl(${hue} 58% 48%)`
}

export function dueLabel(task: Task, now = Date.now(), roomId?: string): string {
  const due = nextDue(task, roomId)
  if (due === null) return lastFor(task, roomId ?? taskRooms(task)[0]) ? t('Completata') : t('Su richiesta')
  const diff = Math.round((startOfDay(due) - startOfDay(now)) / DAY)
  if (diff < -1) return t('Scaduta da {n} giorni', { n: -diff })
  if (diff === -1) return t('Scaduta ieri')
  if (diff === 0) return t('Oggi')
  if (diff === 1) return t('Domani')
  return t('Tra {n} giorni', { n: diff })
}

/** Nome breve del giorno della settimana (0 = domenica) nella lingua in uso. */
export function weekdayShort(d: number): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2024, 0, 7 + d)) // 7 gen 2024 era una domenica
}

export function recurrenceLabel(task: Task): string {
  const { type, every, weekdays } = task.recurrence
  switch (type) {
    case 'once': return t('Su richiesta')
    case 'daily': return every === 1 ? t('Ogni giorno') : t('Ogni {n} giorni', { n: every })
    case 'weekly':
      if (weekdays && weekdays.length) {
        const d = [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(weekdayShort).join(' ')
        return every === 1 ? d : t('Ogni {n} sett. · {days}', { n: every, days: d })
      }
      return every === 1 ? t('Ogni settimana') : t('Ogni {n} settimane', { n: every })
    case 'monthly': return every === 1 ? t('Ogni mese') : t('Ogni {n} mesi', { n: every })
  }
}

/** Membro responsabile attuale (per assegnazione a rotazione o fissa). */
export function currentAssignee(task: Task): string | null {
  const a = task.assignment
  if (a.mode === 'member') return a.memberId
  if (a.mode === 'rotation' && a.memberIds.length > 0) {
    return a.memberIds[task.completions % a.memberIds.length]
  }
  return null
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}
