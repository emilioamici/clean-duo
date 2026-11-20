import { t } from '../i18n'
import { unlinkMissing } from './deps'
import { taskRooms } from './rooms'
import type { ActivityLog, AppDatabase, Task } from '../types'

const DEDUPE_WINDOW = 2 * 60_000
const MAX_LOGS = 2000

interface Versioned { id: string; updatedAt: number }

function mergeList<T extends Versioned>(
  a: T[], b: T[], tombstones: Record<string, number>, combine?: (newer: T, older: T) => T,
): T[] {
  const map = new Map<string, T>()
  for (const item of [...a, ...b]) {
    const cur = map.get(item.id)
    if (!cur) { map.set(item.id, item); continue }
    const [newer, older] = item.updatedAt >= cur.updatedAt ? [item, cur] : [cur, item]
    map.set(item.id, combine ? combine(newer, older) : newer)
  }
  return [...map.values()]
    .filter((x) => !(tombstones[x.id] !== undefined && tombstones[x.id] >= x.updatedAt))
    .sort((x, y) => x.id.localeCompare(y.id))
}

/**
 * Per le azioni vince la modifica più recente (anche per un completamento annullato). Il completamento che non fosse
 * presente nella copia più recente (due persone completano offline) lo si recupera dallo storico: vedi `reconcileWithLogs`.
 */
const combineTask = (newer: Task): Task => newer

/**
 * Se nello storico c'è un completamento più recente di quello registrato nell'azione, l'azione lo recepisce
 * (anche per stanza). Gli storici annullati non contano.
 */
function reconcileWithLogs(tasks: Task[], logs: ActivityLog[]): Task[] {
  const last = new Map<string, number>()
  const perRoom = new Map<string, Map<string, number>>()
  for (const l of logs) {
    last.set(l.taskId, Math.max(last.get(l.taskId) ?? 0, l.at))
    const m = perRoom.get(l.taskId) ?? new Map<string, number>()
    for (const r of l.roomIds ?? [l.roomId]) m.set(r, Math.max(m.get(r) ?? 0, l.at))
    perRoom.set(l.taskId, m)
  }
  return tasks.map((x) => {
    let out = x
    const multi = taskRooms(x).length > 1
    if (multi) {
      // per stanza: un completamento fatto altrove (offline) e non ancora nell'azione
      const rooms = perRoom.get(x.id)
      const done = { ...(x.roomDone ?? {}) }
      let changed = false
      for (const r of taskRooms(x)) {
        const at = rooms?.get(r) ?? 0
        if (at > (done[r] ?? 0)) { done[r] = at; changed = true }
      }
      if (changed) out = { ...out, roomDone: done }
    }
    const m = last.get(x.id) ?? 0
    if (m > (out.lastCompletedAt ?? 0)) {
      out = { ...out, lastCompletedAt: m, completions: out.completions + 1, archived: out.archived || (out.recurrence.type === 'once' && !out.afterTaskId) }
    }
    return out
  })
}

function mergeLogs(a: ActivityLog[], b: ActivityLog[], tombstones: Record<string, number>): ActivityLog[] {
  const map = new Map<string, ActivityLog>()
  for (const l of [...a, ...b]) if (!tombstones[l.id]) map.set(l.id, l)
  const sorted = [...map.values()].sort((x, y) => x.at - y.at || x.id.localeCompare(y.id))
  // Anti-doppione: stessa task completata "contemporaneamente" da due persone -> vale solo la prima.
  const out: ActivityLog[] = []
  const lastByTask = new Map<string, ActivityLog>()
  for (const l of sorted) {
    const prev = lastByTask.get(l.taskId)
    if (prev && prev.memberId !== l.memberId && l.at - prev.at < DEDUPE_WINDOW) continue
    lastByTask.set(l.taskId, l)
    out.push(l)
  }
  return out.reverse().slice(0, MAX_LOGS)
}

/** Merge a livello di entità (last-write-wins per id, con regole speciali per le task). */
export function mergeDb(local: AppDatabase, remote: AppDatabase): AppDatabase {
  const tombstones: Record<string, number> = { ...remote.tombstones }
  for (const [k, v] of Object.entries(local.tombstones)) tombstones[k] = Math.max(tombstones[k] ?? 0, v)

  const settingsFromLocal = local.settingsUpdatedAt >= remote.settingsUpdatedAt
  const base = settingsFromLocal ? local : remote

  const logs = mergeLogs(local.logs, remote.logs, tombstones)
  return {
    schema: 1,
    houseName: base.houseName,
    settings: base.settings,
    settingsUpdatedAt: base.settingsUpdatedAt,
    members: mergeList(local.members, remote.members, tombstones),
    rooms: mergeList(local.rooms, remote.rooms, tombstones),
    tasks: unlinkMissing(reconcileWithLogs(mergeList(local.tasks, remote.tasks, tombstones, combineTask), logs)),
    logs,
    tombstones,
    lastUpdated: Math.max(local.lastUpdated, remote.lastUpdated),
  }
}

/** Confronto del contenuto ignorando lastUpdated e l'ordine. */
export function sameContent(a: AppDatabase, b: AppDatabase): boolean {
  const norm = (d: AppDatabase) => JSON.stringify({ ...mergeDb(d, d), lastUpdated: 0 })
  return norm(a) === norm(b)
}

/** Validazione minima di un file scaricato da Drive. */
export function parseDb(raw: unknown): AppDatabase {
  const d = raw as Partial<AppDatabase> | null
  if (!d || typeof d !== 'object' || !Array.isArray(d.members) || !Array.isArray(d.rooms) || !Array.isArray(d.tasks)) {
    throw new Error(t('Il file non è un database Clean Duo valido.'))
  }
  return {
    schema: 1,
    houseName: d.houseName ?? 'La mia casa',
    members: d.members,
    rooms: d.rooms,
    tasks: d.tasks,
    logs: d.logs ?? [],
    settings: d.settings ?? { weeklyGoal: 10, prize: '', prizeEmoji: '🏆' },
    settingsUpdatedAt: d.settingsUpdatedAt ?? 0,
    tombstones: d.tombstones ?? {},
    lastUpdated: d.lastUpdated ?? 0,
  }
}
