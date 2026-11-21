import { describe, expect, it } from 'vitest'
import { createDemoDb } from './demo'
import { changeEvents, diffNotifications, pushTargets } from './notifications'
import { buildReminders, dueFor } from './reminders'
import { mergeDb } from './merge'
import type { AppDatabase } from '../types'

const base = (): AppDatabase => {
  const d = createDemoDb()
  d.members = d.members.map((m) => ({ ...m, email: `${m.id}@example.com` }))
  return d
}
const clone = (d: AppDatabase): AppDatabase => JSON.parse(JSON.stringify(d))

describe('notifiche', () => {
  it('azione completata da un altro: notifica per me, mai per le mie modifiche', () => {
    const prev = base()
    const next = clone(prev)
    next.logs.unshift({ id: 'new1', taskId: 't1', taskName: 'Lavare i piatti', roomId: 'r1', memberId: 'm2', stars: 1, at: Date.now() })
    expect(diffNotifications(prev, next, 'm1').map((n) => n.kind)).toEqual(['done'])
    expect(diffNotifications(prev, next, 'm2')).toEqual([])
  })

  it('nuova azione creata da un altro e nuovo membro', () => {
    const prev = base()
    const next = clone(prev)
    next.tasks.push({ ...prev.tasks[0], id: 'tx', createdBy: 'm2' })
    next.members.push({ id: 'm3', name: 'Anna', color: '#000', avatar: '🐱', updatedAt: Date.now() })
    expect(diffNotifications(prev, next, 'm1').map((n) => n.kind).sort()).toEqual(['member', 'task'])
  })

  it('rispetta le preferenze del membro', () => {
    const prev = base()
    const next = clone(prev)
    next.members[0].notify = { done: false, task: true, member: true }
    next.logs.unshift({ id: 'new1', taskId: 't1', taskName: 'x', roomId: 'r1', memberId: 'm2', stars: 1, at: Date.now() })
    expect(diffNotifications(prev, next, 'm1')).toEqual([])
  })

  it('raggruppa oltre 3 eventi dello stesso tipo', () => {
    const prev = base()
    const next = clone(prev)
    for (let i = 0; i < 5; i++) next.logs.unshift({ id: `n${i}`, taskId: 't1', taskName: 'x', roomId: 'r1', memberId: 'm2', stars: 1, at: Date.now() + i })
    const n = diffNotifications(prev, next, 'm1')
    expect(n).toHaveLength(1)
    expect(n[0].title).toContain('5')
  })

  it('push: i destinatari sono gli altri membri con email e con quel tipo attivo', () => {
    const prev = base()
    const next = clone(prev)
    next.members[1].notify = { done: false, task: true, member: true }
    next.logs.unshift({ id: 'mine', taskId: 't1', taskName: 'x', roomId: 'r1', memberId: 'm1', stars: 1, at: Date.now() })
    expect(pushTargets(prev, next, 'm1')).toEqual([]) // m2 ha disattivato «completate»
    next.members[1].notify = undefined
    expect(pushTargets(prev, next, 'm1').map((t) => t.email)).toEqual(['m2@example.com'])
  })

  it('push: un membro nuovo non riceve la notifica su se stesso', () => {
    const prev = base()
    const next = clone(prev)
    next.members.push({ id: 'm3', name: 'Anna', color: '#000', avatar: '🐱', email: 'm3@example.com', updatedAt: Date.now() })
    expect(pushTargets(prev, next, 'm1').map((t) => t.email).sort()).toEqual(['m2@example.com'])
  })

  it('un\'importazione di massa non notifica', () => {
    const prev = base()
    const next = clone(prev)
    for (let i = 0; i < 30; i++) next.logs.push({ id: `b${i}`, taskId: 't1', taskName: 'x', roomId: 'r1', memberId: 'm2', stars: 1, at: i })
    expect(changeEvents(prev, next)).toEqual([])
  })
})

describe('promemoria', () => {
  it('programma solo i giorni futuri con azioni da fare, all\'ora scelta', () => {
    const db = base()
    const now = new Date(2026, 10, 20, 9, 0).getTime()
    const items = buildReminders(db, 'm1', '18:00', now)
    expect(items.length).toBeGreaterThan(0)
    for (const it of items) { const d = new Date(it.at); expect([d.getHours(), d.getMinutes()]).toEqual([18, 0]); expect(it.at).toBeGreaterThan(now) }
    expect(buildReminders(db, 'm1', '25:99', now)).toEqual([])
  })
  it('conta le azioni libere e quelle assegnate a me, non quelle di un altro', () => {
    const db = base()
    const day = Date.now()
    const mine = dueFor(db, 'm2', day)
    const other = dueFor(db, 'm1', day)
    expect(mine).toBeGreaterThan(other - 1) // t4 è assegnata a m2
  })
})

describe('merge', () => {
  it('due completamenti simultanei della stessa azione contano una volta sola', () => {
    const a = base(); const b = clone(a)
    const at = Date.now()
    a.logs.unshift({ id: 'a1', taskId: 't1', taskName: 'x', roomId: 'r1', memberId: 'm1', stars: 1, at })
    b.logs.unshift({ id: 'b1', taskId: 't1', taskName: 'x', roomId: 'r1', memberId: 'm2', stars: 1, at: at + 5000 })
    const m = mergeDb(a, b)
    expect(m.logs.filter((l) => l.id === 'a1' || l.id === 'b1')).toHaveLength(1)
  })
})

describe('azioni con durata', () => {
  it('a fine durata l\'azione si completa all\'ora di fine, con le stelle a chi l\'ha avviata, una sola volta', async () => {
    const { finalizeTimers, startRunning, isRunning } = await import('./timers')
    const db = base()
    const t0 = db.tasks[0]
    const t1 = { ...t0, durationMin: 45 }
    const started = startRunning(t1, 'm2', Date.now())
    expect(started.runningUntil! - Date.now()).toBeGreaterThan(44 * 60_000)
    expect(isRunning(started)).toBe(true)
    const running = { ...db, tasks: [started, ...db.tasks.slice(1)] }
    expect(finalizeTimers(running, started.runningUntil! - 1)).toBe(running) // non ancora
    const done = finalizeTimers(running, started.runningUntil! + 5_000)
    const log = done.logs[0]
    expect(log).toMatchObject({ taskId: t0.id, memberId: 'm2', at: started.runningUntil, timer: true })
    expect(done.tasks[0].runningUntil).toBeNull()
    expect(done.tasks[0].lastCompletedAt).toBe(started.runningUntil)
    expect(finalizeTimers(done, started.runningUntil! + 60_000)).toBe(done) // idempotente
    // due dispositivi che lo registrano insieme producono lo stesso log: il merge ne tiene uno
    const other = finalizeTimers(running, started.runningUntil! + 9_000)
    expect(mergeDb(done, other).logs.filter((l) => l.timer)).toHaveLength(1)
  })

  it('«finito» arriva a tutti, anche a chi l\'ha avviata; il push dal server (non dal client) evita i doppioni', async () => {
    const { finalizeTimers, startRunning } = await import('./timers')
    const prev = base()
    prev.tasks[0] = startRunning({ ...prev.tasks[0], durationMin: 30 }, 'm1', Date.now())
    const next = finalizeTimers(prev, prev.tasks[0].runningUntil! + 1)
    expect(diffNotifications(prev, next, 'm1').map((n) => n.title)).toEqual([expect.stringContaining('è finito')])
    expect(diffNotifications(prev, next, 'm2').map((n) => n.title)).toEqual([expect.stringContaining('è finito')])
    expect(pushTargets(prev, next, 'm1')).toEqual([])
  })
})

describe('dipendenze tra azioni', () => {
  const mk = (over: Record<string, unknown>) => ({ ...createDemoDb().tasks[0], ...over }) as AppDatabase['tasks'][number]

  it('completare la prima attiva la seconda, che torna in attesa quando viene completata', async () => {
    const { triggerDependents, isWaiting } = await import('./deps')
    const { nextDue } = await import('./clean')
    const a = mk({ id: 'a' }); const b = mk({ id: 'b', afterTaskId: 'a', triggeredAt: null })
    expect(isWaiting(b)).toBe(true)
    expect(nextDue(b)).toBeNull()
    const now = Date.now()
    const after = triggerDependents([a, b], 'a', now, now)
    expect(after[1].triggeredAt).toBe(now)
    expect(isWaiting(after[1])).toBe(false)
    expect(nextDue(after[1])).not.toBeNull()
    // già attiva: non si rimanda
    expect(triggerDependents(after, 'a', now + 5000, now + 5000)[1].triggeredAt).toBe(now)
  })

  it('con il flag, quando l\'azione passa da «in attesa» a «da fare» parte una notifica per gli altri', async () => {
    const { triggerDependents } = await import('./deps')
    const db = createDemoDb()
    const a = mk({ id: 'a' }); const b = mk({ id: 'b', afterTaskId: 'a', triggeredAt: null, notifyWhenTodo: true, name: 'Svuotare' })
    const prev = { ...db, tasks: [a, b] }
    const next = { ...db, tasks: triggerDependents([a, b], 'a', 1000, 1000) }
    const ev = changeEvents(prev, next).filter((e) => e.kind === 'todo')
    expect(ev).toHaveLength(1)
    expect(ev[0].title).toContain('Svuotare')
    expect(diffNotifications(prev, next, db.members[0].id).map((n) => n.kind)).toContain('todo')
    expect(pushTargets(prev, next, db.members[0].id).some((p) => p.event.kind === 'todo')).toBe(db.members.slice(1).some((m) => m.email))
    // senza flag, nessuna notifica; già attiva, nemmeno
    const noFlag = { ...next, tasks: next.tasks.map((x) => ({ ...x, notifyWhenTodo: false })) }
    expect(changeEvents(prev, noFlag).filter((e) => e.kind === 'todo')).toHaveLength(0)
    expect(changeEvents(next, next).filter((e) => e.kind === 'todo')).toHaveLength(0)
  })

  it('se la prima è a tempo, la seconda parte quando il tempo è finito (all\'ora di fine)', async () => {
    const { startRunning, finalizeTimers } = await import('./timers')
    const db = base()
    const a = { ...db.tasks[0], id: 'a', durationMin: 30 }
    const b = { ...db.tasks[1], id: 'b', afterTaskId: 'a', triggeredAt: null, recurrence: { type: 'daily' as const, every: 1 } }
    const started = startRunning(a, 'm1', Date.now())
    const running = { ...db, tasks: [started, b] }
    expect(finalizeTimers(running, started.runningUntil! - 1).tasks[1].triggeredAt).toBeNull() // il tempo non è ancora finito
    const done = finalizeTimers(running, started.runningUntil! + 1000)
    expect(done.tasks[1].triggeredAt).toBe(started.runningUntil)
  })

  it('niente cicli, e se la precedente sparisce il legame si toglie', async () => {
    const { canDependOn, unlinkMissing } = await import('./deps')
    const a = mk({ id: 'a' }); const b = mk({ id: 'b', afterTaskId: 'a' }); const c = mk({ id: 'c', afterTaskId: 'b' })
    expect(canDependOn([a, b, c], 'a', 'a')).toBe(false)
    expect(canDependOn([a, b, c], 'a', 'c')).toBe(false) // a -> c -> b -> a
    expect(canDependOn([a, b, c], 'c', 'a')).toBe(true)
    expect(unlinkMissing([b, c])[0].afterTaskId).toBeUndefined()
  })
})

describe('annullare un completamento dalla cronologia', () => {
  const completed = () => {
    const db = base()
    const at = Date.now()
    const task = { ...db.tasks[0], id: 'tt', lastCompletedAt: at, completions: 1 }
    const log = { id: 'L1', taskId: 'tt', taskName: task.name, roomId: task.roomId, memberId: 'm1', stars: 2, at }
    return { db: { ...db, tasks: [task, ...db.tasks.slice(1)], logs: [log, ...db.logs] }, at }
  }

  it('toglie le stelle e l\'azione torna da fare (mai fatta)', async () => {
    const { undoCompletion } = await import('./history')
    const { db } = completed()
    const out = undoCompletion(db, 'L1')
    expect(out.logs.some((l) => l.id === 'L1')).toBe(false)
    expect(out.tasks[0].lastCompletedAt).toBeNull()
    expect(out.tasks[0].completions).toBe(0)
    expect(out.tombstones.L1).toBeGreaterThan(0)
  })

  it('con un completamento precedente si torna a quello; un\'azione una tantum archiviata torna attiva', async () => {
    const { undoCompletion } = await import('./history')
    const { db, at } = completed()
    const prev = { id: 'L0', taskId: 'tt', taskName: 'x', roomId: 'r1', memberId: 'm1', stars: 2, at: at - 86_400_000 }
    const out = undoCompletion({ ...db, logs: [...db.logs, prev] }, 'L1')
    expect(out.tasks[0].lastCompletedAt).toBe(prev.at)
    const once = { ...db, tasks: [{ ...db.tasks[0], recurrence: { type: 'once' as const, every: 1 }, archived: true }, ...db.tasks.slice(1)] }
    expect(undoCompletion(once, 'L1').tasks[0].archived).toBe(false)
  })

  it('ripristina esattamente lo stato di prima, anche se lo storico non coincide', async () => {
    const { undoCompletion } = await import('./history')
    const { db, at } = completed()
    const before = at - 3 * 86_400_000
    const withPrev = { ...db, logs: [{ ...db.logs[0], prev: before }, ...db.logs.slice(1)], tasks: [{ ...db.tasks[0], lastCompletedAt: at }, ...db.tasks.slice(1)] }
    expect(undoCompletion(withPrev, 'L1').tasks[0].lastCompletedAt).toBe(before)
  })

  it('un\'azione che dipendeva da un\'altra torna «da fare» (riattivata) se annulli il suo completamento', async () => {
    const { undoCompletion } = await import('./history')
    const { db, at } = completed()
    const dep = { ...db.tasks[1], id: 'dep2', afterTaskId: 'zz', lastCompletedAt: at, triggeredAt: null }
    const log = { id: 'L2', taskId: 'dep2', taskName: 'd', roomId: 'r1', memberId: 'm1', stars: 1, at, prev: null, prevTrigger: at - 5000 }
    const out = undoCompletion({ ...db, tasks: [...db.tasks, dep], logs: [log, ...db.logs] }, 'L2')
    expect(out.tasks.find((x) => x.id === 'dep2')!.triggeredAt).toBe(at - 5000)
  })

  it('chi dipendeva da quell\'azione torna in attesa', async () => {
    const { undoCompletion } = await import('./history')
    const { db, at } = completed()
    const dep = { ...db.tasks[1], id: 'dep', afterTaskId: 'tt', triggeredAt: at }
    expect(undoCompletion({ ...db, tasks: [...db.tasks, dep] }, 'L1').tasks.find((x) => x.id === 'dep')!.triggeredAt).toBeNull()
  })

  it('un dispositivo con dati vecchi non fa tornare il completamento annullato, in nessun ordine di merge', async () => {
    const { undoCompletion } = await import('./history')
    const { db } = completed()
    const stale = clone(db)
    const fresh = undoCompletion(db, 'L1', Date.now() + 1000)
    for (const [a, b] of [[stale, fresh], [fresh, stale]]) {
      const m = mergeDb(a, b)
      expect(m.logs.some((l) => l.id === 'L1')).toBe(false)
      expect(m.tasks.find((x) => x.id === 'tt')!.lastCompletedAt).toBeNull()
    }
  })

  it('due completamenti offline si conservano entrambi nell\'azione', () => {
    const a = base(); const b = clone(a)
    const at = Date.now()
    a.logs.unshift({ id: 'x1', taskId: 't1', taskName: 'x', roomId: 'r1', memberId: 'm1', stars: 1, at })
    a.tasks[0] = { ...a.tasks[0], lastCompletedAt: at, updatedAt: at }
    b.logs.unshift({ id: 'y1', taskId: 't1', taskName: 'x', roomId: 'r1', memberId: 'm2', stars: 1, at: at + 600_000 })
    expect(mergeDb(a, b).tasks.find((x) => x.id === 't1')!.lastCompletedAt).toBe(at + 600_000)
  })
})

describe('«Completa ora» su un\'azione in corso', () => {
  const running = async () => {
    const { startRunning } = await import('./timers')
    const db = base()
    const started = startRunning({ ...db.tasks[0], id: 'tm', durationMin: 60 }, 'm1', Date.now())
    const dep = { ...db.tasks[1], id: 'next', afterTaskId: 'tm', triggeredAt: null, recurrence: { type: 'daily' as const, every: 1 } }
    return { db: { ...db, tasks: [started, dep] }, started }
  }

  it('completa subito: stelle a chi l\'ha avviata, non più in corso, dipendenti attivati adesso', async () => {
    const { finishEarly } = await import('./timers')
    const { db, started } = await running()
    const now = Date.now() + 5 * 60_000
    const out = finishEarly(db, 'tm', now)
    expect(out.tasks[0].runningUntil).toBeNull()
    expect(out.tasks[0].lastCompletedAt).toBe(now)
    expect(out.logs[0]).toMatchObject({ taskId: 'tm', memberId: 'm1', at: now, timer: true, early: true })
    expect(out.tasks[1].triggeredAt).toBe(now)
    expect(now).toBeLessThan(started.runningUntil!) // davvero prima della fine
    expect(finishEarly(out, 'tm', now + 1000)).toBe(out) // non si ripete
  })

  it('avvisa gli altri subito (il timer del server verrà annullato) e anche chi l\'ha avviata in app', async () => {
    const { finishEarly } = await import('./timers')
    const { db } = await running()
    const out = finishEarly(db, 'tm', Date.now() + 1000)
    expect(pushTargets(db, out, 'm1').map((t) => t.email)).toEqual(['m2@example.com'])
    expect(diffNotifications(db, out, 'm1')).toHaveLength(1)
  })

  it('l\'annullamento dalla cronologia riporta l\'azione com\'era e i dipendenti in attesa', async () => {
    const { finishEarly } = await import('./timers')
    const { undoCompletion } = await import('./history')
    const { db } = await running()
    const done = finishEarly(db, 'tm', Date.now() + 1000)
    const back = undoCompletion(done, done.logs[0].id)
    expect(back.tasks[1].triggeredAt).toBeNull()
    expect(back.logs.some((l) => l.id === done.logs[0].id)).toBe(false)
  })
})

describe('azioni in più stanze', () => {
  const multi = () => {
    const db = base()
    const task = { ...db.tasks[0], id: 'mr', roomId: 'r1', roomIds: ['r1', 'r2', 'r3'], recurrence: { type: 'weekly' as const, every: 1 }, lastCompletedAt: null, completions: 0, roomDone: undefined, createdAt: Date.now() - 20 * 86_400_000, stars: 3 as const }
    return { db: { ...db, tasks: [task, ...db.tasks.slice(1)], logs: [] as AppDatabase['logs'] }, task }
  }

  it('completamento rapido: tutte le stanze, stelle una sola volta', async () => {
    const { applyCompletion } = await import('./rooms')
    const { task } = multi()
    const at = Date.now()
    const out = applyCompletion(task, ['r1', 'r2', 'r3'], at)
    expect(out.roomDone).toEqual({ r1: at, r2: at, r3: at })
    expect(out.completions).toBe(1) // un solo completamento: le stelle (nel log) sono quelle dell'azione, non per stanza
  })

  it('dalla singola stanza: solo quella è fatta, le altre restano da fare', async () => {
    const { applyCompletion } = await import('./rooms')
    const { nextDue, urgencyOf, roomCleanliness } = await import('./clean')
    const { db, task } = multi()
    const at = Date.now()
    const out = applyCompletion(task, ['r2'], at)
    expect(out.roomDone).toEqual({ r2: at })
    expect(urgencyOf(out, at, 'r2')).not.toBe('overdue')
    expect(urgencyOf(out, at, 'r1')).toBe('overdue')
    expect(urgencyOf(out, at)).toBe('overdue') // vista Oggi: conta la più urgente
    expect(nextDue(out, 'r2')!).toBeGreaterThan(nextDue(out, 'r1')!)
    const room = (id: string) => ({ id, name: id, icon: 'sofa', color: '#000', updatedAt: 0 })
    const only = { ...db, tasks: [out] }
    expect(roomCleanliness(room('r2'), only.tasks, at)).toBeGreaterThan(roomCleanliness(room('r1'), only.tasks, at))
  })

  it('su richiesta: non si archivia mai, nemmeno con tutte le stanze fatte', async () => {
    const { applyCompletion } = await import('./rooms')
    const { task } = multi()
    const once = { ...task, recurrence: { type: 'once' as const, every: 1 } }
    const a = applyCompletion(once, ['r1'], Date.now())
    expect(a.archived).toBe(false)
    expect(applyCompletion(a, ['r2', 'r3'], Date.now() + 1000).archived).toBe(false)
  })

  it('annullare un completamento di una stanza ripristina lo stato per stanza', async () => {
    const { applyCompletion } = await import('./rooms')
    const { undoCompletion } = await import('./history')
    const { db, task } = multi()
    const at = Date.now()
    const done = applyCompletion(task, ['r1'], at)
    const log = { id: 'LR', taskId: 'mr', taskName: 'x', roomId: 'r1', roomIds: ['r1'], memberId: 'm1', stars: 3, at, prev: null, prevRoomDone: null }
    const back = undoCompletion({ ...db, tasks: [done], logs: [log] }, 'LR')
    expect(back.tasks[0].roomDone).toBeUndefined()
    expect(back.tasks[0].lastCompletedAt).toBeNull()
  })

  it('eliminando una stanza le azioni con più stanze restano, quelle con una sola si eliminano', async () => {
    const { removeRoom } = await import('./rooms')
    const { task } = multi()
    const single = { ...task, id: 'solo', roomId: 'r2', roomIds: undefined }
    const out = removeRoom([task, single], 'r2')
    expect(out.removed).toEqual(['solo'])
    expect(out.tasks[0].roomIds).toEqual(['r1', 'r3'])
    expect(removeRoom([task], 'r1').tasks[0].roomId).toBe('r2') // la principale passa alla successiva
  })

  it('una stanza aggiunta dopo parte «mai fatta» (da fare); togliendo stanze si torna allo stato semplice', async () => {
    const { applyCompletion, setRooms } = await import('./rooms')
    const { urgencyOf } = await import('./clean')
    const { task } = multi()
    const at = Date.now()
    const done = applyCompletion(task, ['r1', 'r2', 'r3'], at)
    const more = setRooms(done, ['r1', 'r2', 'r3', 'r4'])
    expect(urgencyOf(more, at, 'r4')).toBe('overdue')
    expect(urgencyOf(more, at, 'r1')).not.toBe('overdue')
    const one = setRooms(done, ['r2'])
    expect(one.roomIds).toBeUndefined()
    expect(one.roomDone).toBeUndefined()
    expect(one.lastCompletedAt).toBe(at)
  })

  it('due dispositivi che completano stanze diverse offline: nel merge restano entrambe fatte', async () => {
    const { applyCompletion } = await import('./rooms')
    const { db, task } = multi()
    const at = Date.now()
    const a = { ...db, tasks: [applyCompletion(task, ['r1'], at), ...db.tasks.slice(1)], logs: [{ id: 'a', taskId: 'mr', taskName: 'x', roomId: 'r1', roomIds: ['r1'], memberId: 'm1', stars: 3, at }] }
    const b = { ...db, tasks: [applyCompletion(task, ['r2'], at + 600_000), ...db.tasks.slice(1)], logs: [{ id: 'b', taskId: 'mr', taskName: 'x', roomId: 'r2', roomIds: ['r2'], memberId: 'm2', stars: 3, at: at + 600_000 }] }
    const m = mergeDb(a, b).tasks.find((x) => x.id === 'mr')!
    expect(Object.keys(m.roomDone ?? {}).sort()).toEqual(['r1', 'r2'])
  })

  it('la notifica «completata» indica le stanze', () => {
    const prev = base(); const next = clone(prev)
    next.logs.unshift({ id: 'z', taskId: 't1', taskName: 'Pulire i vetri', roomId: 'r1', roomIds: ['r1', 'r3'], memberId: 'm2', stars: 3, at: Date.now() })
    const n = diffNotifications(prev, next, 'm1')[0]
    expect(n.body).toContain(', ')
    expect(n.body).toContain('+3')
  })
})

describe('azioni con scadenza e flag «avvisa»', () => {
  it('programma una notifica alle 8 del giorno di scadenza, raggruppando le azioni dello stesso giorno', async () => {
    const { buildTodoNotices } = await import('./reminders')
    const db = createDemoDb()
    const now = new Date(2026, 10, 20, 9, 0).getTime()
    const day = new Date(2026, 10, 23).getTime()
    const mk = (id: string, over = {}) => ({ ...db.tasks[0], id, name: id, notifyWhenTodo: true, assignment: { mode: 'anyone' as const }, recurrence: { type: 'once' as const, every: 1 }, createdAt: day, lastCompletedAt: null, archived: false, ...over })
    const d = { ...db, tasks: [mk('uno'), mk('due'), mk('senza', { notifyWhenTodo: false })] }
    const out = buildTodoNotices(d, 'm1', now)
    expect(out).toHaveLength(1)
    expect(new Date(out[0].at).getHours()).toBe(8)
    expect(out[0].body).toContain('uno')
    expect(out[0].body).not.toContain('senza')
    expect(buildTodoNotices(d, 'm1', day + 86_400_000)).toEqual([]) // passato
  })
})

describe('azioni su richiesta', () => {
  it('restano visibili dopo il completamento e si possono rifare; quelle già archiviate tornano attive', async () => {
    const { applyCompletion } = await import('./rooms')
    const { parseDb } = await import('./merge')
    const db = createDemoDb()
    const once = { ...db.tasks[0], recurrence: { type: 'once' as const, every: 1 }, lastCompletedAt: null, completions: 0 }
    const a = applyCompletion(once, [], Date.now())
    expect(a.archived).toBe(false)
    expect(applyCompletion(a, [], Date.now() + 5000).completions).toBe(2)
    const old = parseDb({ ...db, tasks: [{ ...once, archived: true }, { ...db.tasks[1], archived: true }] })
    expect(old.tasks[0].archived).toBe(false)
    expect(old.tasks[1].archived).toBe(true) // le altre non si toccano
  })
})

describe('«su richiesta»: segna da fare', () => {
  it('torna da fare dopo il segno, finché non viene completata di nuovo', async () => {
    const { nextDue } = await import('./clean')
    const { applyCompletion } = await import('./rooms')
    const db = createDemoDb()
    const t0 = { ...db.tasks[0], recurrence: { type: 'once' as const, every: 1 }, lastCompletedAt: null, completions: 0, todoAt: null }
    const done = applyCompletion(t0, [], 1_000_000_000_000)
    expect(nextDue(done)).toBeNull()
    const marked = { ...done, todoAt: done.lastCompletedAt! + 60_000 }
    expect(nextDue(marked)).not.toBeNull()
    const again = applyCompletion(marked, [], marked.todoAt! + 60_000)
    expect(nextDue(again)).toBeNull()
  })
  it('con il flag, segnarla da fare avvisa gli altri', () => {
    const db = createDemoDb()
    const once = { ...db.tasks[0], recurrence: { type: 'once' as const, every: 1 }, notifyWhenTodo: true, lastCompletedAt: 5, todoAt: null }
    const prev = { ...db, tasks: [once, ...db.tasks.slice(1)] }
    const next = { ...db, tasks: [{ ...once, todoAt: 9999 }, ...db.tasks.slice(1)] }
    expect(changeEvents(prev, next).filter((e) => e.kind === 'todo')).toHaveLength(1)
    expect(changeEvents(next, next).filter((e) => e.kind === 'todo')).toHaveLength(0)
  })
})
