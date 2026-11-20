import type { Task } from '../types'

/** L'azione aspetta il completamento di un'altra e non è ancora stata attivata. */
export const isWaiting = (task: Task): boolean => !!task.afterTaskId && !task.triggeredAt && !task.archived

/**
 * Quando `doneId` viene completata (o, se a tempo, finisce), le azioni che dipendono da lei diventano «da fare».
 * Se erano già attive resta la data più vecchia (non si rimandano).
 */
export function triggerDependents(tasks: Task[], doneId: string, at: number, now: number): Task[] {
  if (!tasks.some((x) => x.afterTaskId === doneId)) return tasks
  return tasks.map((x) => (x.afterTaskId === doneId && !x.archived ? { ...x, triggeredAt: x.triggeredAt ?? at, updatedAt: now } : x))
}

/** Se l'azione da cui si dipende non esiste più, il legame si toglie (e l'azione torna normale). */
export function unlinkMissing(tasks: Task[]): Task[] {
  const ids = new Set(tasks.map((x) => x.id))
  if (!tasks.some((x) => x.afterTaskId && !ids.has(x.afterTaskId))) return tasks
  return tasks.map((x) => (x.afterTaskId && !ids.has(x.afterTaskId) ? { ...x, afterTaskId: undefined, triggeredAt: null } : x))
}

/** `taskId` può dipendere da `predId`? No se è se stessa o se `predId` dipende (anche da lontano) da `taskId`: sarebbe un giro chiuso. */
export function canDependOn(tasks: Task[], taskId: string | undefined, predId: string): boolean {
  if (!taskId) return true
  if (taskId === predId) return false
  const byId = new Map(tasks.map((x) => [x.id, x]))
  const seen = new Set<string>()
  for (let cur = byId.get(predId); cur?.afterTaskId; cur = byId.get(cur.afterTaskId)) {
    if (cur.afterTaskId === taskId) return false
    if (seen.has(cur.id)) return false
    seen.add(cur.id)
  }
  return true
}
