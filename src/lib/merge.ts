import { t } from '../i18n'
import { unlinkMissing } from './deps'
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

function combineTask(newer: Task, older: Task): Task {
  // Due persone possono completare la stessa task offline: non perdere mai un completamento.
  return {
    ...newer,
    lastCompletedAt: Math.max(newer.lastCompletedAt ?? 0, older.lastCompletedAt ?? 0) || null,
    completions: Math.max(newer.completions, older.completions),
    archived: newer.archived || older.archived,
  }
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

  return {
    schema: 1,
    houseName: base.houseName,
    settings: base.settings,
    settingsUpdatedAt: base.settingsUpdatedAt,
    members: mergeList(local.members, remote.members, tombstones),
    rooms: mergeList(local.rooms, remote.rooms, tombstones),
    tasks: unlinkMissing(mergeList(local.tasks, remote.tasks, tombstones, combineTask)),
    logs: mergeLogs(local.logs, remote.logs, tombstones),
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
