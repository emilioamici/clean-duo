import { describe, expect, it } from 'vitest'
import worker, { type Env } from './index'
import { seal } from './auth'

const SID = 'S'.repeat(40)
const FILE = 'FILEID12345'
const EMAILS: Record<string, string> = { 'tok-owner': 'owner@example.com', 'tok-house': 'owner@example.com', 'tok-sara': 'sara@example.com', 'tok-eve': 'eve@example.com', 'tok-alien': 'sara@example.com' }

function setup(opts: { shared?: string[] } = {}) {
  const kv = new Map<string, string>()
  const state = { version: '5', db: { members: [{ id: 'm1' }], rooms: [], tasks: [], logs: [], houseName: 'Casa' } as Record<string, unknown>, revoked: false, patches: 0 }
  const shared = opts.shared ?? ['owner@example.com', 'sara@example.com']
  const env = {
    SUBS: {
      get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k),
      list: async ({ prefix }: { prefix: string }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
    },
    VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y', ALLOWED_ORIGINS: 'https://utente.github.io',
    GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', SESSION_KEY: Buffer.from(new Uint8Array(32).fill(7)).toString('base64url'),
  } as unknown as Env
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input))
    const bearer = /^Bearer (.+)$/.exec(new Headers(init?.headers).get('Authorization') ?? '')?.[1] ?? ''
    const ok = (o: unknown) => new Response(JSON.stringify(o))
    if (u.hostname === 'oauth2.googleapis.com' && u.pathname === '/token') return state.revoked ? new Response('{"error":"invalid_grant"}', { status: 400 }) : ok({ access_token: 'tok-house' })
    if (u.pathname === '/tokeninfo') return bearerless(u.searchParams.get('access_token')!)
    if (u.pathname.endsWith('/about')) return EMAILS[bearer] ? ok({ user: { emailAddress: EMAILS[bearer] } }) : new Response('{}', { status: 401 })
    const direct = bearer === 'tok-owner' || bearer === 'tok-house'
    if (u.pathname.endsWith('/permissions')) return direct ? ok({ permissions: shared.map((e, i) => ({ emailAddress: e, role: i === 0 ? 'owner' : 'writer' })) }) : new Response('{}', { status: 404 })
    if (u.pathname.startsWith('/upload/')) { if (!direct) return new Response('{}', { status: 404 }); state.patches++; state.version = String(Number(state.version) + 1); state.db = JSON.parse(String(init?.body)); return ok({ id: FILE, name: 'cleanduo-db.json', version: state.version, modifiedTime: 'now' }) }
    if (u.pathname.includes('/files/')) {
      if (!direct) return new Response('{}', { status: 404 })
      if (u.searchParams.get('alt') === 'media') return ok(state.db)
      return ok({ id: FILE, name: 'cleanduo-db.json', version: state.version, modifiedTime: 'now' })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const bearerless = (t: string) => (t === 'tok-alien' ? new Response(JSON.stringify({ aud: 'altra-app' })) : new Response(JSON.stringify({ aud: 'cid' })))
  const call = async (path: string, token: string, body: unknown) => {
    const res = await worker.fetch(new Request(`https://w.example${path}`, { method: 'POST', headers: { Origin: 'https://utente.github.io', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env)
    return { status: res.status, json: (await res.json()) as any }
  }
  const seed = async () => void kv.set(`sess:${SID}`, await seal(env, { rt: 'rt1', email: 'owner@example.com', touched: Date.now() }))
  return { env, kv, state, call, seed }
}

describe('ponte verso il database', () => {
  it('/health dichiara il ponte solo se l’accesso persistente è configurato', async () => {
    const { env } = setup()
    const res = await worker.fetch(new Request('https://w.example/health'), env)
    expect((await res.json() as any).bridge).toBe(true)
    delete (env as any).SESSION_KEY
    expect((await (await worker.fetch(new Request('https://w.example/health'), env)).json() as any).bridge).toBe(false)
  })

  it('la registrazione richiede accesso diretto al file e la sessione dello stesso account', async () => {
    const t = setup(); await t.seed()
    expect((await t.call('/house/register', 'tok-sara', { fileId: FILE, session: SID })).status).toBe(403) // niente accesso diretto
    const other = setup(); await other.kv.set(`sess:${SID}`, await seal(other.env, { rt: 'rt1', email: 'qualcun.altro@example.com', touched: 1 }))
    expect((await other.call('/house/register', 'tok-owner', { fileId: FILE, session: SID })).status).toBe(403) // sessione di un altro
    const ok = await t.call('/house/register', 'tok-owner', { fileId: FILE, session: SID })
    expect(ok.status).toBe(200)
    expect(t.kv.has(`house:${FILE}`)).toBe(true)
    expect(t.kv.get(`house:${FILE}`)).not.toContain('rt1') // il token è cifrato
    expect(JSON.parse(t.kv.get('inv:sara@example.com')!)).toEqual([FILE])
  })

  it('un account con la casa condivisa legge e scrive; uno non condiviso o con token di un’altra app no', async () => {
    const t = setup(); await t.seed(); await t.call('/house/register', 'tok-owner', { fileId: FILE, session: SID })
    const mine = await t.call('/house/mine', 'tok-sara', {})
    expect(mine.json.houses.map((h: any) => h.id)).toEqual([FILE])
    const read = await t.call('/db/read', 'tok-sara', { fileId: FILE })
    expect(read.status).toBe(200); expect(read.json.meta.version).toBe('5'); expect(read.json.db.houseName).toBe('Casa')
    const db = { ...read.json.db, houseName: 'Nuova' }
    const w = await t.call('/db/write', 'tok-sara', { fileId: FILE, db, expectedVersion: '5' })
    expect(w.status).toBe(200); expect(w.json.meta.version).toBe('6'); expect(t.state.db.houseName).toBe('Nuova')
    expect((await t.call('/db/write', 'tok-sara', { fileId: FILE, db, expectedVersion: '5' })).status).toBe(409) // versione cambiata
    expect(t.state.patches).toBe(1)
    expect((await t.call('/db/read', 'tok-eve', { fileId: FILE })).status).toBe(403) // non condiviso
    expect((await t.call('/db/read', 'tok-alien', { fileId: FILE })).status).toBe(403) // token emesso per un'altra app
    expect((await t.call('/house/mine', 'tok-eve', {})).json.houses).toEqual([])
  })

  it('tolta la condivisione su Drive l’accesso si chiude; revocato l’accesso del proprietario la casa si scollega', async () => {
    const shared = ['owner@example.com', 'sara@example.com']
    const t = setup({ shared }); await t.seed(); await t.call('/house/register', 'tok-owner', { fileId: FILE, session: SID })
    shared.pop()
    expect((await t.call('/db/read', 'tok-sara', { fileId: FILE })).status).toBe(403)
    shared.push('sara@example.com')
    expect((await t.call('/db/read', 'tok-sara', { fileId: FILE })).status).toBe(200)
    t.state.revoked = true
    expect((await t.call('/db/read', 'tok-sara', { fileId: FILE })).status).toBe(410)
    expect(t.kv.has(`house:${FILE}`)).toBe(false)
  })

  it('senza casa registrata non c’è accesso via ponte', async () => {
    const t = setup()
    expect((await t.call('/db/read', 'tok-sara', { fileId: FILE })).status).toBe(403)
  })
})
