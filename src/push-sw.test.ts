import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { testPushMessage } from './services/push'

/** Esegue public/push-sw.js con un finto ambiente di service worker e restituisce i gestori registrati. */
function loadSw(wins: Array<{ visibilityState: string; postMessage: ReturnType<typeof vi.fn> }>) {
  const handlers: Record<string, (e: any) => void> = {}
  const showNotification = vi.fn(async () => undefined)
  const self = {
    addEventListener: (type: string, fn: (e: any) => void) => { handlers[type] = fn },
    clients: { matchAll: async () => wins, openWindow: vi.fn() },
    registration: { scope: 'https://utente.github.io/clean-duo/', showNotification },
  }
  new Function('self', readFileSync('public/push-sw.js', 'utf8'))(self)
  const push = async (data: unknown) => {
    let p: Promise<unknown> = Promise.resolve()
    handlers.push({ data: { json: () => data, text: () => '' }, waitUntil: (x: Promise<unknown>) => { p = x } })
    await p
  }
  return { push, showNotification }
}
const win = (visibilityState: string) => ({ visibilityState, postMessage: vi.fn() })

describe('service worker: notifiche push', () => {
  it('con l\'app in primo piano mostra comunque la notifica (Safari non ammette push silenziose) e avvisa la finestra', async () => {
    const w = win('visible')
    const { push, showNotification } = loadSw([w])
    await push({ title: 'Anna ha completato «Piatti»', body: 'Cucina · +2 ⭐', tag: 'done:l1' })
    expect(showNotification).toHaveBeenCalledTimes(1)
    expect(showNotification).toHaveBeenCalledWith('Anna ha completato «Piatti»', {
      body: 'Cucina · +2 ⭐', tag: 'done:l1', icon: 'https://utente.github.io/clean-duo/pwa-192.png', badge: 'https://utente.github.io/clean-duo/pwa-192.png',
    })
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'cleanduo-push' })
  })

  it('con l\'app in background o chiusa mostra la notifica e non manda messaggi', async () => {
    const hidden = win('hidden')
    const a = loadSw([hidden]); await a.push({ title: 'Ciao' })
    expect(a.showNotification).toHaveBeenCalledTimes(1)
    expect(hidden.postMessage).not.toHaveBeenCalled()
    const b = loadSw([]); await b.push({ title: 'Ciao', body: 'x' })
    expect(b.showNotification).toHaveBeenCalledTimes(1)
  })

  it('senza titolo usa CleanDuo', async () => {
    const { push, showNotification } = loadSw([])
    await push({})
    expect((showNotification.mock.calls as unknown as string[][])[0][0]).toBe('CleanDuo')
  })
})

describe('notifica di prova: dice la verità', () => {
  it('in base a quello che il server ha fatto', () => {
    expect(testPushMessage({ sent: 1, failed: 0, removed: 0, codes: [] })).toBe('Prova inviata dal server: dovrebbe arrivare tra pochi secondi.')
    expect(testPushMessage({ sent: 0, failed: 0, removed: 1, codes: [] })).toContain('era scaduta e il server l\'ha tolta')
    expect(testPushMessage({ sent: 0, failed: 1, removed: 0, codes: [403] })).toContain('(codice 403)')
    expect(testPushMessage({ sent: 0, failed: 1, removed: 0, codes: [] })).toContain('(codice ?)')
    expect(testPushMessage({ sent: 0, failed: 0, removed: 0, codes: [] })).toContain('nessun dispositivo iscritto')
    expect(testPushMessage({ sent: 1, failed: 1, removed: 0, codes: [500] })).not.toContain('codice') // almeno uno è arrivato
  })
})
