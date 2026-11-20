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
