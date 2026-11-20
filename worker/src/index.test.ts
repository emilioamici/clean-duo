import { describe, expect, it } from 'vitest'
import worker, { runScheduled, type Env } from './index'

function makeEnv(fetchGoogle?: (url: string) => Response): { env: Env; kv: Map<string, string> } {
  const kv = new Map<string, string>()
  const env = {
    SUBS: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
      list: async ({ prefix }: { prefix: string }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
    },
    VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y', ALLOWED_ORIGINS: 'https://utente.github.io',
  } as unknown as Env
  if (fetchGoogle) globalThis.fetch = (async (u: RequestInfo | URL) => fetchGoogle(String(u))) as typeof fetch
  return { env, kv }
}

describe('promemoria programmati', () => {
  it('il cron invia solo quelli scaduti e conserva i futuri', async () => {
    const { env, kv } = makeEnv()
    kv.set('r:FILEID12345:a@b.it', JSON.stringify([{ at: 1000, title: 't', body: 'b' }, { at: 9e15, title: 'dopo', body: '' }]))
    await runScheduled(env, 5000)
    expect(JSON.parse(kv.get('r:FILEID12345:a@b.it')!)).toEqual([{ at: 9e15, title: 'dopo', body: '' }])
    await runScheduled(env, 9e15 + 1)
    expect(kv.has('r:FILEID12345:a@b.it')).toBe(false)
  })

  it('/schedule richiede un token Google valido con accesso al file e salva al massimo 8 voci future', async () => {
    const { env, kv } = makeEnv((u) => u.includes('/about') ? new Response(JSON.stringify({ user: { emailAddress: 'Anna@Example.com' } })) : new Response('{"id":"x"}'))
    const now = Date.now()
    const items = Array.from({ length: 12 }, (_, i) => ({ at: now + (i + 1) * 3600_000, title: `p${i}`, body: '' }))
    const req = new Request('https://w.example/schedule', { method: 'POST', headers: { Origin: 'https://utente.github.io', Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: 'FILEID12345', items }) })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    expect(JSON.parse(kv.get('r:FILEID12345:anna@example.com')!)).toHaveLength(8)
    const none = new Request('https://w.example/schedule', { method: 'POST', headers: { Origin: 'https://utente.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: 'FILEID12345', items }) })
    expect((await worker.fetch(none, env)).status).toBe(401)
  })
})

describe('timer di fine durata', () => {
  const google = (u: string) => (u.includes('/about') ? new Response(JSON.stringify({ user: { emailAddress: 'a@example.com' } })) : new Response('{"id":"x"}'))
  const call = (env: Env, body: unknown) => worker.fetch(new Request('https://w.example/timer', { method: 'POST', headers: { Origin: 'https://utente.github.io', Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env)

  it('si programma, si annulla e il cron lo consuma una volta sola', async () => {
    const { env, kv } = makeEnv(google)
    const at = Date.now() + 3600_000
    const ok = await call(env, { fileId: 'FILEID12345', id: 'task1-123', at, title: 'Asciugatrice finita', recipients: ['a@example.com', 'b@example.com'] })
    expect(ok.status).toBe(200)
    expect(kv.has('m:FILEID12345:task1-123')).toBe(true)
    await runScheduled(env, at - 1)
    expect(kv.has('m:FILEID12345:task1-123')).toBe(true) // non ancora
    await call(env, { fileId: 'FILEID12345', id: 'task1-123', cancel: true })
    expect(kv.has('m:FILEID12345:task1-123')).toBe(false)
    await call(env, { fileId: 'FILEID12345', id: 'task2-456', at, title: 'x', recipients: ['a@example.com'] })
    await runScheduled(env, at + 1)
    expect(kv.has('m:FILEID12345:task2-456')).toBe(false)
  })

  it('rifiuta orari oltre le 24 ore e destinatari vuoti', async () => {
    const { env } = makeEnv(google)
    expect((await call(env, { fileId: 'FILEID12345', id: 'task1-1', at: Date.now() + 48 * 3600_000, title: 'x', recipients: ['a@example.com'] })).status).toBe(400)
    expect((await call(env, { fileId: 'FILEID12345', id: 'task1-1', at: Date.now() + 1000, title: 'x', recipients: [] })).status).toBe(400)
  })
})
