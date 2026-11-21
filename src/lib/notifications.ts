import type { AppDatabase, Member, NotifyPrefs } from '../types'
import { t } from '../i18n'
import { taskRooms } from './rooms'
import { isOnDemand, isWaiting } from './deps'

export type NotifKind = 'done' | 'task' | 'member' | 'reminder' | 'todo'

export interface Notif {
  id: string
  kind: NotifKind
  title: string
  body: string
  at: number
  read: boolean
  /** per aprire l'azione dalla notifica */
  taskId?: string
}

/** Un fatto avvenuto nella casa, ricavato confrontando il database prima e dopo. */
export interface ChangeEvent {
  kind: 'done' | 'task' | 'member' | 'todo'
  key: string
  /** chi l'ha fatto (null = non si sa: un membro aggiunto) */
  actor: string | null
  /** il membro a cui si riferisce (per «nuovo membro») */
  subject?: string
  taskId?: string
  /** completata da sola a fine durata: il server la notifica a tutti, anche a chi l'ha avviata */
  timer?: boolean
  /** completata prima della scadenza: il server non la notificherà (timer annullato), quindi la inviamo noi */
  early?: boolean
  title: string
  body: string
}

export const DEFAULT_NOTIFY: NotifyPrefs = { done: true, task: true, member: true }
export const notifyPrefs = (m?: Member | null): NotifyPrefs => ({ ...DEFAULT_NOTIFY, ...(m?.notify ?? {}) })

const GROUP_AFTER = 3 // oltre questa soglia, per tipo, si manda un riepilogo
const MASS_LIMIT = 20 // oltre, è un'importazione: nessuna notifica

/**
 * Eventi nuovi tra `prev` e `next`: azioni completate, azioni create, membri entrati.
 * Funzione pura: nessun accesso a storage o rete.
 */
export function changeEvents(prev: AppDatabase, next: AppDatabase): ChangeEvent[] {
  const who = (id?: string | null) => (id ? next.members.find((m) => m.id === id)?.name ?? t('Un membro') : t('Un membro'))
  const room = (id: string) => next.rooms.find((r) => r.id === id)?.name ?? ''
  const out: ChangeEvent[] = []

  const prevLogs = new Set(prev.logs.map((l) => l.id))
  const logs = next.logs.filter((l) => !prevLogs.has(l.id))
  if (logs.length <= MASS_LIMIT) {
    for (const l of logs) {
      out.push({
        kind: 'done', key: `done:${l.id}`, actor: l.memberId, taskId: l.taskId, timer: l.timer, early: l.early,
        title: l.timer ? t('Il task «{task}» è finito', { task: l.taskName }) : t('{who} ha completato «{task}»', { who: who(l.memberId), task: l.taskName }),
        body: [(l.roomIds ?? [l.roomId]).map(room).filter(Boolean).join(', '), `+${l.stars} ⭐`].filter(Boolean).join(' · '),
      })
    }
  }

  const prevTasks = new Set(prev.tasks.map((x) => x.id))
  const tasks = next.tasks.filter((x) => !prevTasks.has(x.id))
  if (tasks.length <= MASS_LIMIT) {
    for (const x of tasks) {
      out.push({
        kind: 'task', key: `task:${x.id}`, actor: x.createdBy ?? null, taskId: x.id,
        title: t('{who} ha creato una nuova azione', { who: who(x.createdBy) }),
        body: [x.name, taskRooms(x).map(room).filter(Boolean).join(', ')].filter(Boolean).join(' · '),
      })
    }
  }

  // azioni «in attesa» che diventano «da fare» (dopo un'altra azione): solo se hanno il flag. Quelle da dispositivo le notifica il server.
  const before = new Map(prev.tasks.map((x) => [x.id, x]))
  const woke = next.tasks.filter((x) => x.notifyWhenTodo && !x.archived && before.has(x.id) && (
    (x.afterTaskId && !x.onEvent && !isWaiting(x) && isWaiting(before.get(x.id)!)) ||
    (isOnDemand(x) && !!x.todoAt && x.todoAt !== before.get(x.id)!.todoAt) // «su richiesta» segnata da fare
  ))
  if (woke.length <= MASS_LIMIT) {
    for (const x of woke) {
      out.push({
        kind: 'todo', key: `todo:${x.id}:${x.todoAt ?? x.triggeredAt ?? 0}`, actor: null, taskId: x.id,
        title: t('«{task}» è ora da fare', { task: x.name }),
        body: [taskRooms(x).map(room).filter(Boolean).join(', '), `${x.stars} ⭐`].filter(Boolean).join(' · '),
      })
    }
  }

  const prevMembers = new Set(prev.members.map((m) => m.id))
  const members = next.members.filter((m) => !prevMembers.has(m.id))
  if (members.length <= MASS_LIMIT) {
    for (const m of members) {
      out.push({ kind: 'member', key: `member:${m.id}`, actor: null, subject: m.id, title: t('{name} è entrato in casa', { name: m.name }), body: next.houseName })
    }
  }
  return out
}

/** Raggruppa (per tipo) quando gli eventi sono troppi: una notifica di riepilogo invece di una per elemento. */
function group<T extends { kind: string }>(items: T[], make: (kind: string, list: T[]) => T | null): T[] {
  const kinds = [...new Set(items.map((i) => i.kind))]
  return kinds.flatMap((k) => {
    const list = items.filter((i) => i.kind === k)
    if (list.length <= GROUP_AFTER) return list
    const g = make(k, list)
    return g ? [g] : list
  })
}

/** Notifiche per il membro `me`: eventi fatti da altri che gli interessano (mai le sue modifiche). */
export function diffNotifications(prev: AppDatabase, next: AppDatabase, me: string, at = Date.now()): Notif[] {
  const myPrefs = notifyPrefs(next.members.find((m) => m.id === me))
  const events = changeEvents(prev, next).filter((e) => (e.actor !== me || e.timer) && e.subject !== me && (e.kind === 'todo' || myPrefs[e.kind]))
  const notifs: Notif[] = events.map((e) => ({ id: e.key, kind: e.kind, title: e.title, body: e.body, at, read: false, taskId: e.taskId }))
  return group(notifs, (kind, list) => ({
    id: `${kind}:group:${list.map((n) => n.id).sort()[0]}:${list.length}`, kind: kind as NotifKind, at, read: false,
    title: kind === 'done' ? t('{n} azioni completate', { n: list.length }) : kind === 'todo' ? t('{n} azioni da fare', { n: list.length }) : kind === 'task' ? t('{n} nuove azioni', { n: list.length }) : t('{n} nuovi membri', { n: list.length }),
    body: [...new Set(list.map((n) => n.title.split(' ')[0]))].join(', '),
  }))
}

export interface PushTarget { event: ChangeEvent; email: string; memberId: string }

/**
 * Chi deve ricevere una notifica push per una modifica fatta da `me` su questo dispositivo.
 * Destinatari: gli altri membri con email e con quel tipo di notifica attivo.
 */
export function pushTargets(prev: AppDatabase, next: AppDatabase, me: string): PushTarget[] {
  const out: PushTarget[] = []
  for (const e of changeEvents(prev, next)) {
    if (e.timer && !e.early) continue // il fine-durata lo invia il server a tutti all'ora giusta (vedi scheduleTimer)
    if (e.actor !== null && e.actor !== me) continue // l'ha fatto un altro: ci pensa il suo dispositivo
    for (const m of next.members) {
      if (m.id === me || m.id === e.subject || !m.email) continue
      if (e.kind !== 'todo' && !notifyPrefs(m)[e.kind]) continue
      out.push({ event: e, email: m.email.toLowerCase(), memberId: m.id })
    }
  }
  return out
}

const MAX_KEPT = 100

/** Aggiunge le nuove notifiche in testa, senza duplicati, mantenendo al massimo MAX_KEPT elementi. */
export function mergeNotifications(current: Notif[], incoming: Notif[]): Notif[] {
  const seen = new Set(current.map((n) => n.id))
  return [...incoming.filter((n) => !seen.has(n.id)), ...current].slice(0, MAX_KEPT)
}
