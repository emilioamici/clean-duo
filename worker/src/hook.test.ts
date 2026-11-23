import { describe, expect, it } from 'vitest'
import worker, { type Env } from './index'

const FILE = 'FILEID12345'
async function setup() {
  const kv = new Map<string, string>()
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url')
  const pushed: string[] = []
  const env = {
    SUBS: {
      get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k),
      list: async ({ prefix }: { prefix: string }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
    },
    VAPID_PUBLIC_KEY: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', privateKey)).d!,
    ALLOWED_ORIGINS: 'https://utente.github.io',
  } as unknown as Env
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input)
    if (u.startsWith('https://push.test/')) { pushed.push(u); return new Response(null, { status: 201 }) }
    if (u.includes('/about')) return new Response(JSON.stringify({ user: { emailAddress: 'a@example.com' } }))
    return new Response('{"id":"x"}')
  }) as typeof fetch
  const ecdh = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  kv.set(`s:${FILE}:b@example.com`, JSON.stringify([{ endpoint: 'https://push.test/b', keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', ecdh.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) }, added: 1 }]))
  const post = async (path: string, body: unknown) => {
    const r = await worker.fetch(new Request(`https://w.example${path}`, { method: 'POST', headers: { Origin: 'https://utente.github.io', Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env)
    return { status: r.status, json: (await r.json()) as any }
  }
  /** come IFTTT: nessun header Origin */
  const hook = async (token: string, kind: string, method = 'GET') => {
    const r = await worker.fetch(new Request(`https://w.example/hook/${token}/${kind}`, { method }), env)
    return { status: r.status, json: (await r.json()) as any }
  }
  const register = async (extra: object = {}) => (await post('/hook/register', { fileId: FILE, ruleId: 'rule-roomba', recipients: ['b@example.com'], title: 'Roomba ha finito', body: 'Passare l’aspirapolvere', ...extra })).json.token as string
  return { env, kv, post, hook, register, pushed }
}

describe('hook: inizio e fine ciclo', () => {
  it('la registrazione richiede accesso al file e dà un codice stabile; «regenerate» lo cambia', async () => {
    const t = await setup()
    const a = await t.register()
    expect(a).toMatch(/^[\w-]{20,64}$/)
    expect(await t.register()).toBe(a)
    const b = await t.register({ regenerate: true })
    expect(b).not.toBe(a)
    expect((await t.hook(a, 'start')).status).toBe(404) // il vecchio non vale più
    const res = await worker.fetch(new Request('https://w.example/hook/register', { method: 'POST', headers: { Origin: 'https://utente.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: FILE, ruleId: 'rule-roomba' }) }), t.env)
    expect(res.status).toBe(401)
  })

  it('si chiama in GET e in POST, senza Origin (come IFTTT); codice sbagliato = 404', async () => {
    const t = await setup(); const token = await t.register()
    expect((await t.hook(token, 'start', 'GET')).status).toBe(200)
    expect((await t.hook(token, 'finish', 'POST')).status).toBe(200)
    expect((await t.hook('x'.repeat(30), 'start')).status).toBe(404)
    expect((await t.hook(token, 'pausa')).status).toBe(404)
  })

  it('mette in coda inizio e fine, ignora le ripetizioni e avvisa tutti solo alla fine', async () => {
    const t = await setup(); const token = await t.register()
    expect((await t.hook(token, 'start')).json.event).toBe('start')
    expect((await t.hook(token, 'start')).json.ignored).toBeTruthy() // ripetuto
    expect(t.pushed).toHaveLength(0) // all'inizio nessuna notifica
    expect((await t.hook(token, 'finish')).json.event).toBe('finish')
    expect((await t.hook(token, 'finish')).json.ignored).toBeTruthy() // ripetuto entro 10 minuti
    expect(t.pushed).toHaveLength(1)
    const queue = JSON.parse(t.kv.get(`ev:${FILE}`)!) as Array<{ kind: string; ruleId: string }>
    expect(queue.map((e) => e.kind)).toEqual(['start', 'finish'])
    expect(queue[0].ruleId).toBe('rule-roomba')
  })

  it('le app vecchie (senza v: 2) non vedono gli eventi di ciclo; quelle nuove sì', async () => {
    const t = await setup(); const token = await t.register()
    await t.hook(token, 'start')
    t.kv.set(`ev:${FILE}`, JSON.stringify([...JSON.parse(t.kv.get(`ev:${FILE}`)!), { id: 'tuya-1', ruleId: 'r2', at: 5 }]))
    expect((await t.post('/automation/events', { fileId: FILE })).json.events.map((e: any) => e.id)).toEqual(['tuya-1'])
    expect((await t.post('/automation/events', { fileId: FILE, v: 2 })).json.events).toHaveLength(2)
  })

  it('l\'eliminazione chiude il codice', async () => {
    const t = await setup(); const token = await t.register()
    await t.post('/hook/delete', { fileId: FILE, ruleId: 'rule-roomba' })
    expect((await t.hook(token, 'start')).status).toBe(404)
  })
})

describe('comandi da Shortcuts (/do)', () => {
  const doCall = async (t: Awaited<ReturnType<typeof setup>>, token: string, qs: string, method = 'GET') => {
    const r = await worker.fetch(new Request(`https://w.example/do/${token}?${qs}`, { method }), t.env)
    return { status: r.status, json: (await r.json()) as any }
  }

  it('GET e POST senza Origin; mette in coda il comando con azione, cosa fare e membro', async () => {
    const t = await setup(); const token = await t.register({ type: 'shortcut' })
    expect((await doCall(t, token, 'task=Lettiera&do=todo&who=m1')).json.queued).toBe(true)
    expect((await doCall(t, token, 'task=Piatti', 'POST')).status).toBe(200)
    const q = JSON.parse(t.kv.get(`ev:${FILE}`)!) as any[]
    expect(q[0]).toMatchObject({ kind: 'act', task: 'Lettiera', do: 'todo', who: 'm1', ruleId: 'rule-roomba' })
    expect(q[1]).toMatchObject({ kind: 'act', task: 'Piatti' }); expect(q[1].do).toBeUndefined()
  })

  it('parametri non validi → 400; codice sbagliato → 404; i due tipi di codice non si scambiano', async () => {
    const t = await setup(); const sc = await t.register({ type: 'shortcut', ruleId: 'rule-sc' }); const cy = await t.register({ ruleId: 'rule-cy' })
    expect((await doCall(t, sc, 'do=todo')).status).toBe(400)
    expect((await doCall(t, sc, 'task=x&do=salta')).status).toBe(400)
    expect((await doCall(t, 'x'.repeat(30), 'task=x')).status).toBe(404)
    expect((await doCall(t, cy, 'task=x')).status).toBe(404) // il codice di un ciclo non vale sui comandi
    expect((await t.hook(sc, 'start')).status).toBe(404) // e viceversa
  })

  it('un comando uguale entro un minuto è un doppione: non va in coda due volte', async () => {
    const t = await setup(); const token = await t.register({ type: 'shortcut' })
    await doCall(t, token, 'task=Lettiera&do=todo&who=m1')
    expect((await doCall(t, token, 'task=Lettiera&do=todo&who=m1')).json.ignored).toBeTruthy()
    await doCall(t, token, 'task=Lettiera&do=complete&who=m1') // altro comando: passa
    expect(JSON.parse(t.kv.get(`ev:${FILE}`)!)).toHaveLength(2)
  })

  it('i comandi li vedono solo le app con v: 3', async () => {
    const t = await setup(); const token = await t.register({ type: 'shortcut' })
    await doCall(t, token, 'task=Lettiera')
    const ids = async (v?: number) => (await t.post('/automation/events', { fileId: FILE, ...(v ? { v } : {}) })).json.events.length
    expect(await ids()).toBe(0); expect(await ids(2)).toBe(0); expect(await ids(3)).toBe(1)
  })
})
