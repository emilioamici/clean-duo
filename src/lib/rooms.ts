import type { Task } from '../types'
import { isEventDriven } from './deps'

/** Tutte le stanze dell'azione (la principale per prima). */
export const taskRooms = (task: Task): string[] => (task.roomIds && task.roomIds.length > 0 ? task.roomIds : [task.roomId])
export const inRoom = (task: Task, roomId: string): boolean => taskRooms(task).includes(roomId)

/** Ultimo completamento di quella stanza. Senza stato per stanza vale quello dell'azione. */
export function lastFor(task: Task, roomId: string): number | null {
  if (!task.roomDone) return task.lastCompletedAt
  return task.roomDone[roomId] ?? null
}

/**
 * Applica un completamento fatto alle stanze `done` all'ora `at`: aggiorna l'ultimo completamento di quelle stanze
 * (le altre restano com'erano) e l'ultimo completamento generale. Le stelle non cambiano: sono quelle dell'azione.
 */
export function applyCompletion(task: Task, done: string[], at: number, now = at): Task {
  const all = taskRooms(task)
  const doneRooms = done.length > 0 ? done.filter((r) => all.includes(r)) : all
  let roomDone: Record<string, number> | undefined
  if (all.length > 1) {
    const base = task.roomDone ?? Object.fromEntries(all.filter(() => task.lastCompletedAt != null).map((r) => [r, task.lastCompletedAt as number]))
    roomDone = {}
    for (const r of all) {
      const v = doneRooms.includes(r) ? at : base[r]
      if (v != null) roomDone[r] = v
    }
  }
  const everyRoomDone = all.every((r) => (roomDone ? roomDone[r] != null : true))
  return {
    ...task,
    roomDone,
    lastCompletedAt: Math.max(task.lastCompletedAt ?? 0, at),
    completions: task.completions + 1,
    archived: task.recurrence.type === 'once' && !isEventDriven(task) && everyRoomDone,
    triggeredAt: isEventDriven(task) ? null : task.triggeredAt,
    updatedAt: now,
  }
}

/**
 * L'azione cambia stanze dal form. Le stanze rimaste tengono il loro ultimo completamento; una stanza nuova parte
 * «mai fatta» (quindi da fare), perché lì non è stata ancora completata.
 */
export function setRooms(task: Task, rooms: string[]): Task {
  const list = rooms.length > 0 ? rooms : [task.roomId]
  const before = taskRooms(task)
  if (list.length === 1) {
    // una sola stanza: torna lo stato semplice
    const last = before.length === 1 ? task.lastCompletedAt : before.includes(list[0]) ? lastFor(task, list[0]) : null
    return { ...task, roomId: list[0], roomIds: undefined, roomDone: undefined, lastCompletedAt: last }
  }
  const roomDone: Record<string, number> = {}
  for (const r of list) {
    if (!before.includes(r)) continue
    const v = lastFor(task, r)
    if (v != null) roomDone[r] = v
  }
  return { ...task, roomId: list[0], roomIds: list, roomDone }
}

/** Una stanza viene eliminata: le azioni che c'erano solo lì si eliminano, le altre perdono solo quella stanza. */
export function removeRoom(tasks: Task[], roomId: string): { tasks: Task[]; removed: string[] } {
  const removed: string[] = []
  const out: Task[] = []
  for (const x of tasks) {
    const rooms = taskRooms(x)
    if (!rooms.includes(roomId)) { out.push(x); continue }
    if (rooms.length === 1) { removed.push(x.id); continue }
    out.push({ ...setRooms(x, rooms.filter((r) => r !== roomId)), updatedAt: Date.now() })
  }
  return { tasks: out, removed }
}
