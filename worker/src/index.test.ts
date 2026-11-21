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

  it('/schedule richiede un token Google valido con accesso al file e salva al massimo 20 voci future', async () => {
    const { env, kv } = makeEnv((u) => u.includes('/about') ? new Response(JSON.stringify({ user: { emailAddress: 'Anna@Example.com' } })) : new Response('{"id":"x"}'))
    const now = Date.now()
    const items = Array.from({ length: 25 }, (_, i) => ({ at: now + (i + 1) * 3600_000, title: `p${i}`, body: '' }))
    const req = new Request('https://w.example/schedule', { method: 'POST', headers: { Origin: 'https://utente.github.io', Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: 'FILEID12345', items }) })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    expect(JSON.parse(kv.get('r:FILEID12345:anna@example.com')!)).toHaveLength(20)
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

describe('Tuya', () => {
  const GOOGLE = (u: string) => (u.includes('/about') ? new Response(JSON.stringify({ user: { emailAddress: 'a@example.com' } })) : new Response('{"id":"x"}'))
  let faultValue: unknown = 0
  let tuyaCalls: Array<{ url: string; headers: Record<string, string> }> = []

  function setup() {
    faultValue = 0; tuyaCalls = []
    const { env, kv } = makeEnv()
    const e = env as Env & Record<string, unknown>
    e.TUYA_ACCESS_ID = 'ACCESSID123'; e.TUYA_ACCESS_SECRET = 'SECRET456'; e.VAPID_PUBLIC_KEY = 'x'; e.VAPID_PRIVATE_KEY = 'y'
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input)
      if (u.includes('openapi.tuyaeu.com')) {
        tuyaCalls.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string> })
        if (u.includes('/v1.0/token')) return new Response(JSON.stringify({ success: true, result: { access_token: 'TK', expire_time: 7200 } }))
        if (u.includes('/v1.0/devices/BADDEVICE1')) return new Response(JSON.stringify({ success: false, code: 1106, msg: 'permission deny' }))
        if (u.includes('/v1.0/devices/FEEDER0001')) return new Response(JSON.stringify({ success: true, result: { name: 'Distributore', online: true, category: 'cwwsq', status: [{ code: 'fault', value: faultValue }, { code: 'battery_percentage', value: 80 }] } }))
        return new Response(JSON.stringify({ success: false, code: 404, msg: 'not found' }))
      }
      return GOOGLE(u)
    }) as typeof fetch
    return { env: e as Env, kv }
  }
  const call = (env: Env, path: string, body: unknown) => worker.fetch(new Request(`https://w.example${path}`, { method: 'POST', headers: { Origin: 'https://utente.github.io', Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env)
  const rule = { fileId: 'FILEID12345', ruleId: 'auto-1', deviceId: 'FEEDER0001', code: 'fault', op: 'bit', value: '1', recipients: ['a@example.com'], title: 'Distributore', body: 'Riempire' }

  it('la firma è HMAC-SHA256 maiuscola di client_id + t + stringToSign (richiesta del token)', async () => {
    const { env } = setup()
    const { createHash, createHmac } = await import('node:crypto')
    await call(env, '/tuya/status', { fileId: 'FILEID12345', deviceId: 'FEEDER0001' })
    const h = tuyaCalls[0].headers
    const stringToSign = ['GET', createHash('sha256').update('').digest('hex'), '', '/v1.0/token?grant_type=1'].join('\n')
    const expected = createHmac('sha256', 'SECRET456').update('ACCESSID123' + h.t + stringToSign).digest('hex').toUpperCase()
    expect(h.sign).toBe(expected)
    expect(h.client_id).toBe('ACCESSID123')
    // richiesta di servizio: firma con il token nel mezzo
    const h2 = tuyaCalls[1].headers
    const s2 = ['GET', createHash('sha256').update('').digest('hex'), '', '/v1.0/devices/FEEDER0001'].join('\n')
    expect(h2.sign).toBe(createHmac('sha256', 'SECRET456').update('ACCESSID123' + 'TK' + h2.t + s2).digest('hex').toUpperCase())
    expect(h2.access_token).toBe('TK')
  })

  it('condizioni: uguale, minore, bit, contiene; dato mancante = non soddisfatta', async () => {
    const { evalCondition } = await import('./tuya')
    const st = [{ code: 'fault', value: 6 }, { code: 'level', value: 'low' }, { code: 'weight', value: 12 }, { code: 'flag', value: true }]
    expect(evalCondition(st, { code: 'fault', op: 'bit', value: '1' })).toBe(true)
    expect(evalCondition(st, { code: 'fault', op: 'bit', value: '0' })).toBe(false)
    expect(evalCondition(st, { code: 'level', op: 'eq', value: 'low' })).toBe(true)
    expect(evalCondition(st, { code: 'level', op: 'ne', value: 'low' })).toBe(false)
    expect(evalCondition(st, { code: 'weight', op: 'lt', value: '20' })).toBe(true)
    expect(evalCondition(st, { code: 'weight', op: 'gt', value: '20' })).toBe(false)
    expect(evalCondition(st, { code: 'flag', op: 'eq', value: 'true' })).toBe(true)
    expect(evalCondition(st, { code: 'level', op: 'contains', value: 'ow' })).toBe(true)
    expect(evalCondition(st, { code: 'assente', op: 'eq', value: '1' })).toBe(false)
  })

  it('/tuya/status legge i dati veri e valuta la condizione', async () => {
    const { env } = setup()
    faultValue = 2
    const res = await call(env, '/tuya/status', { fileId: 'FILEID12345', deviceId: 'FEEDER0001', condition: { code: 'fault', op: 'bit', value: '1' } })
    const j = await res.json() as { name: string; status: Array<{ code: string }>; matched: boolean }
    expect(res.status).toBe(200)
    expect(j.name).toBe('Distributore')
    expect(j.status.map((s) => s.code)).toContain('fault')
    expect(j.matched).toBe(true)
  })

  it('errori di Tuya e Tuya non configurato sono chiari', async () => {
    const { env } = setup()
    const bad = await call(env, '/tuya/status', { fileId: 'FILEID12345', deviceId: 'BADDEVICE1' })
    expect(bad.status).toBe(502)
    expect(((await bad.json()) as { error: string }).error).toContain('1106')
    delete (env as unknown as Record<string, unknown>).TUYA_ACCESS_ID
    expect((await call(env, '/tuya/status', { fileId: 'FILEID12345', deviceId: 'FEEDER0001' })).status).toBe(503)
  })

  it('il segnale parte solo al passaggio «non soddisfatta → soddisfatta», senza doppioni, e si riarma', async () => {
    const { runTuya } = await import('./index')
    const { env, kv } = setup()
    expect((await call(env, '/tuya/rule', rule)).status).toBe(200)
    const queue = async () => (await (await call(env, '/automation/events', { fileId: 'FILEID12345' })).json() as { events: Array<{ id: string; ruleId: string }> }).events

    faultValue = 0
    expect((await runTuya(env, 1_000_000, true)).fired).toBe(0)
    faultValue = 2 // bit 1 attivo: crocchette in esaurimento
    expect((await runTuya(env, 2_000_000, true)).fired).toBe(1)
    expect((await queue())).toHaveLength(1)
    expect((await runTuya(env, 3_000_000, true)).fired).toBe(0) // ancora soddisfatta: nessun doppione
    faultValue = 0
    await runTuya(env, 4_000_000, true) // riarmo
    faultValue = 2
    expect((await runTuya(env, 5_000_000, true)).fired).toBe(1)
    const events = await queue()
    expect(events).toHaveLength(2)
    // conferma: l'app li ha applicati
    await call(env, '/automation/ack', { fileId: 'FILEID12345', ids: events.map((e) => e.id) })
    expect(await queue()).toHaveLength(0)
    expect(kv.has('ev:FILEID12345')).toBe(false)
  })

  it('se la condizione è già soddisfatta quando si crea la regola, segnala subito al primo controllo', async () => {
    const { runTuya } = await import('./index')
    const { env } = setup()
    faultValue = 2
    await call(env, '/tuya/rule', rule)
    expect((await runTuya(env, 1_000_000, true)).fired).toBe(1)
  })

  it('una chiamata a Tuya per dispositivo anche con più regole; eliminare la regola la ferma', async () => {
    const { runTuya } = await import('./index')
    const { env } = setup()
    await call(env, '/tuya/rule', rule)
    await call(env, '/tuya/rule', { ...rule, ruleId: 'auto-2', code: 'battery_percentage', op: 'lt', value: '20' })
    tuyaCalls.length = 0
    await runTuya(env, 1_000_000, true)
    expect(tuyaCalls.filter((c) => c.url.includes('/v1.0/devices/FEEDER0001'))).toHaveLength(1)
    await call(env, '/tuya/rule/delete', { fileId: 'FILEID12345', ruleId: 'auto-1' })
    await call(env, '/tuya/rule/delete', { fileId: 'FILEID12345', ruleId: 'auto-2' })
    tuyaCalls.length = 0
    await runTuya(env, 2_000_000, true)
    expect(tuyaCalls).toHaveLength(0)
  })

  it('il cron controlla una volta ogni ora (predefinito) o ogni TUYA_POLL_MINUTES', async () => {
    const { runTuya } = await import('./index')
    const { env } = setup()
    faultValue = 2
    await call(env, '/tuya/rule', rule)
    const at = (min: number) => min * 60_000
    expect((await runTuya(env, at(35))).fired).toBe(0) // minuto 35: salta
    expect((await runTuya(env, at(40))).fired).toBe(0) // anche il minuto 40: l'intervallo predefinito è un'ora
    expect((await runTuya(env, at(120))).fired).toBe(1) // allo scoccare dell'ora controlla
    ;(env as unknown as Record<string, string>).TUYA_POLL_MINUTES = '10'
    await call(env, '/tuya/rule', { ...rule, ruleId: 'auto-9' })
    expect((await runTuya(env, at(130))).fired).toBe(1) // con intervallo 10 controlla al minuto 130
  })
})

describe('/notify: esito dell\'invio', () => {
  async function setup(endpoints: Record<string, number>) {
    const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const vapidPub = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))
    const jwk = await crypto.subtle.exportKey('jwk', privateKey)
    const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url')
    const sub = async (endpoint: string) => {
      const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
      return { endpoint, keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) }, added: 1 }
    }
    const { env, kv } = makeEnv((u) => {
      if (u.includes('/about')) return new Response(JSON.stringify({ user: { emailAddress: 'a@example.com' } }))
      if (u.startsWith('https://push.test/')) return new Response(null, { status: endpoints[u.replace('https://push.test/', '')] })
      return new Response('{"id":"x"}')
    })
    ;(env as unknown as Record<string, string>).VAPID_PUBLIC_KEY = b64u(vapidPub)
    ;(env as unknown as Record<string, string>).VAPID_PRIVATE_KEY = jwk.d!
    kv.set('s:FILEID12345:b@example.com', JSON.stringify(await Promise.all(Object.keys(endpoints).map((k) => sub('https://push.test/' + k)))))
    const call = async () => (await worker.fetch(new Request('https://w.example/notify', { method: 'POST', headers: { Origin: 'https://utente.github.io', Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: 'FILEID12345', recipients: ['b@example.com'], title: 'Ciao' }) }), env)).json() as Promise<Record<string, unknown>>
    return { call, kv }
  }

  it('sent: 1 quando il servizio di push accetta; nessun campo codes', async () => {
    const { call } = await setup({ ok: 201 })
    expect(await call()).toEqual({ ok: true, sent: 1, failed: 0, removed: 0 })
  })

  it('failed con i codici dei rifiuti (non 2xx e non «gone»); gone conta come removed', async () => {
    const { call, kv } = await setup({ rifiuta: 403, errore: 500, scaduta: 410 })
    expect(await call()).toEqual({ ok: true, sent: 0, failed: 2, removed: 1, codes: [403, 500] })
    expect(JSON.parse(kv.get('s:FILEID12345:b@example.com')!)).toHaveLength(2) // la scaduta è stata tolta
  })

  it('sent: 0 senza dispositivi iscritti', async () => {
    const { call, kv } = await setup({ ok: 201 })
    kv.delete('s:FILEID12345:b@example.com')
    expect(await call()).toEqual({ ok: true, sent: 0, failed: 0, removed: 0 })
  })
})
