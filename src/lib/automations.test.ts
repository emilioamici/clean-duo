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
