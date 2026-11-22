import { describe, expect, it } from 'vitest'
import { createDemoDb } from './demo'
import { applyAutomationEvents, unlinkMissingAutomations } from './automations'
import { isWaiting } from './deps'
import { applyCompletion } from './rooms'
import { nextDue, urgencyOf } from './clean'
import { mergeDb } from './merge'
import type { AppDatabase, Automation } from '../types'

const auto = (over: Partial<Automation> = {}): Automation => ({ id: 'a1', kind: 'tuya', name: 'Distributore', deviceId: 'DEVICE12345', code: 'fault', op: 'bit', value: '1', taskId: 'feed', enabled: true, updatedAt: 1, ...over })
const withAuto = (): AppDatabase => {
  const db = createDemoDb()
  const feed = { ...db.tasks[0], id: 'feed', name: 'Riempire il distributore', onEvent: 'a1', triggeredAt: null, lastCompletedAt: null, recurrence: { type: 'daily' as const, every: 1 } }
  return { ...db, tasks: [feed, ...db.tasks.slice(1)], automations: [auto()] }
}

describe('automazioni con i dispositivi', () => {
  it('l\'azione collegata è in attesa finché il dispositivo non segnala', () => {
    const feed = withAuto().tasks[0]
    expect(isWaiting(feed)).toBe(true)
    expect(nextDue(feed)).toBeNull()
    expect(urgencyOf(feed)).toBe('later')
  })

  it('al segnale va tra le cose da fare; il segnale si applica una volta sola e non si rimanda', () => {
    const db = withAuto()
    const at = Date.now()
    const out = applyAutomationEvents(db, [{ id: 'a1-1', ruleId: 'a1', at }])
    const feed = out.tasks[0]
    expect(feed.triggeredAt).toBe(at)
    expect(isWaiting(feed)).toBe(false)
    expect(urgencyOf(feed, at + 1000)).toBe('today')
    expect(out.automations![0].lastFiredAt).toBe(at)
    // un secondo segnale mentre è ancora da fare: resta la data più vecchia
    expect(applyAutomationEvents(out, [{ id: 'a1-2', ruleId: 'a1', at: at + 600_000 }]).tasks[0].triggeredAt).toBe(at)
  })

  it('un segnale per un\'automazione sconosciuta non fa nulla', () => {
    const db = withAuto()
    expect(applyAutomationEvents(db, [{ id: 'x', ruleId: 'nope', at: Date.now() }])).toBe(db)
    expect(applyAutomationEvents(db, [])).toBe(db)
  })

  it('completandola torna in attesa del prossimo segnale (non si archivia nemmeno se una tantum)', () => {
    const db = withAuto()
    const at = Date.now()
    const triggered = applyAutomationEvents(db, [{ id: 'e', ruleId: 'a1', at }]).tasks[0]
    const done = applyCompletion({ ...triggered, recurrence: { type: 'once', every: 1 } }, [], at + 5000)
    expect(done.triggeredAt).toBeNull()
    expect(done.archived).toBe(false)
    expect(isWaiting(done)).toBe(true)
  })

  it('se l\'automazione viene eliminata l\'azione torna normale', () => {
    const db = withAuto()
    const tasks = unlinkMissingAutomations(db.tasks, [])
    expect(tasks[0].onEvent).toBeUndefined()
    expect(isWaiting(tasks[0])).toBe(false)
  })

  it('merge tra dispositivi: le automazioni si uniscono e una eliminata non riappare', () => {
    const a = withAuto()
    const b = JSON.parse(JSON.stringify(a)) as AppDatabase
    b.automations = [{ ...auto({ id: 'a2', name: 'Fontana', taskId: 't2' }), updatedAt: 5 }]
    expect(mergeDb(a, b).automations!.map((x) => x.id).sort()).toEqual(['a1', 'a2'])
    // eliminata su un dispositivo (lapide): sull'altro non torna, e l'azione collegata si scollega
    const gone = { ...a, automations: [], tombstones: { ...a.tombstones, a1: Date.now() + 10_000 } }
    const m = mergeDb(a, gone)
    expect(m.automations).toEqual([])
    expect(m.tasks.find((x) => x.id === 'feed')!.onEvent).toBeUndefined()
  })
})

describe('ciclo di un dispositivo (Roomba)', () => {
  const setup = () => {
    const db = createDemoDb()
    const task = { ...db.tasks[0], id: 'asp', name: 'Passare l’aspirapolvere', recurrence: { type: 'weekly' as const, every: 1 }, lastCompletedAt: null, completions: 0, durationMin: undefined }
    const auto = { id: 'a-roomba', kind: 'cycle' as const, name: 'Roomba', deviceId: '', code: '', op: 'eq' as const, value: '', taskId: 'asp', enabled: true, hookToken: 'tok', updatedAt: 1 }
    return { ...db, tasks: [task, ...db.tasks.slice(1)], automations: [auto] }
  }
  const now = Date.now()

  it('«start» mette l’azione in corso senza ora di fine, senza cambiare la sua ricorrenza', async () => {
    const { isRunning, isAutoRunning } = await import('./timers')
    const db = applyAutomationEvents(setup(), [{ id: 'e1', ruleId: 'a-roomba', at: now - 60_000, kind: 'start' }], now)
    const t0 = db.tasks[0]
    expect(isRunning(t0)).toBe(true); expect(isAutoRunning(t0)).toBe(true)
    expect(t0.runningUntil).toBeFalsy()
    expect(t0.onEvent).toBeUndefined(); expect(t0.recurrence.type).toBe('weekly')
    expect(db.automations![0].lastFiredAt).toBe(now - 60_000)
  })

  it('«finish» la completa senza membro e senza stelle, e lo stato «in corso» si chiude; è idempotente', () => {
    const started = applyAutomationEvents(setup(), [{ id: 'e1', ruleId: 'a-roomba', at: now - 3_600_000, kind: 'start' }], now)
    const ev = { id: 'e2', ruleId: 'a-roomba', at: now - 60_000, kind: 'finish' as const }
    const done = applyAutomationEvents(started, [ev], now)
    expect(done.tasks[0].autoRunSince).toBeNull()
    expect(done.tasks[0].lastCompletedAt).toBe(ev.at)
    expect(done.tasks[0].completions).toBe(1)
    const log = done.logs[0]
    expect(log).toMatchObject({ taskId: 'asp', memberId: '', stars: 0, auto: true, timer: true })
    // lo stesso segnale applicato di nuovo (altro dispositivo) non cambia nulla
    const again = applyAutomationEvents(done, [ev], now + 1000)
    expect(again.logs.filter((l) => l.taskId === 'asp' && l.auto)).toHaveLength(1)
    expect(again.tasks[0].completions).toBe(1)
  })

  it('segnali fuori ordine o troppo vecchi non lasciano l’azione «in corso» per sempre', () => {
    const old = applyAutomationEvents(setup(), [{ id: 'e1', ruleId: 'a-roomba', at: now - 6 * 3_600_000, kind: 'start' }], now)
    expect(old.tasks[0].autoRunSince).toBeFalsy()
    // «finish» arrivato prima dello «start» nello stesso invio: si ordinano per ora, quindi finisce completata e non in corso
    const both = applyAutomationEvents(setup(), [
      { id: 'e2', ruleId: 'a-roomba', at: now - 10_000, kind: 'finish' }, { id: 'e1', ruleId: 'a-roomba', at: now - 600_000, kind: 'start' },
    ], now)
    expect(both.tasks[0].autoRunSince).toBeNull(); expect(both.tasks[0].completions).toBe(1)
    // automazione disattivata: nessun effetto
    const off = { ...setup(), automations: [{ ...setup().automations[0], enabled: false }] }
    expect(applyAutomationEvents(off, [{ id: 'e', ruleId: 'a-roomba', at: now, kind: 'start' }], now).tasks[0].autoRunSince).toBeFalsy()
  })

  it('se il «finito» non arriva, dopo 4 ore lo stato «in corso» si toglie senza completare; un completamento a mano lo chiude subito', async () => {
    const { finalizeTimers, AUTO_RUN_MAX_MS } = await import('./timers')
    const { applyCompletion } = await import('./rooms')
    const started = applyAutomationEvents(setup(), [{ id: 'e1', ruleId: 'a-roomba', at: now, kind: 'start' }], now)
    expect(finalizeTimers(started, now + AUTO_RUN_MAX_MS - 1000)).toBe(started)
    const stale = finalizeTimers(started, now + AUTO_RUN_MAX_MS + 1000)
    expect(stale.tasks[0].autoRunSince).toBeNull(); expect(stale.tasks[0].completions).toBe(0); expect(stale.logs).toHaveLength(started.logs.length)
    expect(applyCompletion(started.tasks[0], [], now + 5000).autoRunSince).toBeNull()
  })
})
