import type { AppDatabase } from '../types'

/**
 * Annulla un completamento dalla cronologia (ci si è sbagliati a spuntare): toglie il log (e quindi le stelle) e fa tornare l'azione
 * «da fare», come prima di quel completamento. Il log si segna come eliminato (lapide) perché non riappaia dagli altri dispositivi.
 */
export function undoCompletion(d: AppDatabase, logId: string, now = Date.now()): AppDatabase {
  const log = d.logs.find((l) => l.id === logId)
  if (!log) return d
  const logs = d.logs.filter((l) => l.id !== logId)
  const tasks = d.tasks.map((x) => {
    if (x.id === log.taskId && x.lastCompletedAt === log.at) {
      // era l'ultimo completamento: si torna al precedente (o a «mai fatta»)
      // il log ricorda lo stato di prima; per i log vecchi si ricava dallo storico
      const rest = logs.filter((l) => l.taskId === x.id).map((l) => l.at)
      const before = log.prev !== undefined ? log.prev : rest.length ? Math.max(...rest) : null
      return {
        ...x, lastCompletedAt: before, completions: Math.max(0, x.completions - 1), archived: false,
        triggeredAt: x.afterTaskId ? log.prevTrigger ?? x.triggeredAt : x.triggeredAt, updatedAt: now,
      }
    }
    // chi dipendeva da questa azione e si era attivato per quel completamento, torna in attesa
    if (x.afterTaskId === log.taskId && x.triggeredAt === log.at) return { ...x, triggeredAt: null, updatedAt: now }
    return x
  })
  return { ...d, tasks, logs, tombstones: { ...d.tombstones, [logId]: now } }
}
