import { sendWebPush, b64u, type VapidKeys } from './webpush'
import { HttpError, authenticate, evKey, loadSubs, readJson, validEmail, validFileId, type AutomationEventItem, type Env } from './index'

/**
 * Inizio e fine del ciclo di un dispositivo (es. un Roomba) tramite indirizzi segreti.
 * Chi può chiamare un indirizzo (IFTTT, Home Assistant, curl…) segnala `start` o `finish`: il Worker ricorda lo stato,
 * mette l'evento in coda per l'app e, alla fine, avvisa tutti. L'indirizzo contiene un codice casuale per dispositivo.
 */

const DEDUPE_MS = 10 * 60_000 // un «finito» ripetuto entro 10 minuti è lo stesso ciclo
const RUN_MAX_MS = 4 * 3600_000 // dopo 4 ore senza «finito» un nuovo «partito» vale come un nuovo ciclo
const TOKEN = /^[\w-]{20,64}$/
const hk = (token: string) => `hk:${token}`
const hkr = (fileId: string, ruleId: string) => `hkr:${fileId}:${ruleId}`
const validRuleId = (s: unknown): s is string => typeof s === 'string' && /^[\w-]{3,80}$/.test(s)

interface HookRecord {
  /** `cycle` (inizio/fine di un dispositivo) o `shortcut` (comandi da Shortcuts): i due codici non valgono sull'altra rotta */
  type?: 'cycle' | 'shortcut'
  fileId: string; ruleId: string; recipients: string[]; title: string; body: string
  state: 'idle' | 'running'
  /** quando è partito l'ultimo ciclo */
  since: number
  /** quando è finito l'ultimo ciclo */
  lastFinish: number
}

async function load(env: Env, token: string): Promise<HookRecord | null> {
  try { return JSON.parse((await env.SUBS.get(hk(token))) ?? 'null') as HookRecord | null } catch { return null }
}

/** POST /hook/register {fileId, ruleId, recipients, title, body, regenerate?} → {token}: crea (o aggiorna) il collegamento. */
export async function hookRegister(env: Env, req: Request): Promise<unknown> {
  const body = await readJson(req)
  if (!validFileId(body.fileId)) throw new HttpError(400, 'File non valido')
  if (!validRuleId(body.ruleId)) throw new HttpError(400, 'Regola non valida')
  await authenticate(env, req, body.fileId)
  const recipients = Array.isArray(body.recipients) ? [...new Set(body.recipients.filter(validEmail).map((e) => e.toLowerCase()))].slice(0, 20) : []
  let token = (await env.SUBS.get(hkr(body.fileId, body.ruleId))) ?? ''
  if (token && body.regenerate === true) { await env.SUBS.delete(hk(token)); token = '' }
  const old = token ? await load(env, token) : null
  if (!token || !TOKEN.test(token)) {
    token = b64u.enc(crypto.getRandomValues(new Uint8Array(24)))
    await env.SUBS.put(hkr(body.fileId, body.ruleId), token)
  }
  const rec: HookRecord = {
    type: body.type === 'shortcut' ? 'shortcut' : 'cycle',
    fileId: body.fileId, ruleId: body.ruleId, recipients,
    title: typeof body.title === 'string' ? body.title.slice(0, 120) : 'Clean Duo',
    body: typeof body.body === 'string' ? body.body.slice(0, 300) : '',
    state: old?.state ?? 'idle', since: old?.since ?? 0, lastFinish: old?.lastFinish ?? 0,
  }
  await env.SUBS.put(hk(token), JSON.stringify(rec))
  return { ok: true, token }
}

export async function hookDelete(env: Env, req: Request): Promise<unknown> {
  const body = await readJson(req)
  if (!validFileId(body.fileId) || !validRuleId(body.ruleId)) throw new HttpError(400, 'Richiesta non valida')
  await authenticate(env, req, body.fileId)
  const token = await env.SUBS.get(hkr(body.fileId, body.ruleId))
  if (token) { await env.SUBS.delete(hk(token)); await env.SUBS.delete(hkr(body.fileId, body.ruleId)) }
  return { ok: true }
}

/**
 * GET o POST /hook/<codice>/<start|finish>: segnale del dispositivo. Pubblico (l'accesso è il codice segreto) e senza `Origin`:
 * lo chiamano servizi esterni, non il browser. Ripetizioni dello stesso segnale vengono ignorate.
 */
export async function hookTrigger(env: Env, token: string, kind: 'start' | 'finish', now = Date.now()): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!TOKEN.test(token)) return { status: 404, body: { error: 'Non trovato' } }
  const rec = await load(env, token)
  if (!rec || rec.type === 'shortcut') return { status: 404, body: { error: 'Non trovato' } }

  if (kind === 'start' && rec.state === 'running' && now - rec.since < RUN_MAX_MS) return { status: 200, body: { ok: true, ignored: 'già in corso' } }
  if (kind === 'finish' && rec.state === 'idle' && now - rec.lastFinish < DEDUPE_MS) return { status: 200, body: { ok: true, ignored: 'già finito' } }

  const next: HookRecord = kind === 'start' ? { ...rec, state: 'running', since: now } : { ...rec, state: 'idle', lastFinish: now }
  await env.SUBS.put(hk(token), JSON.stringify(next))

  const ev: AutomationEventItem = { id: `${rec.ruleId}-${kind}-${now}`, ruleId: rec.ruleId, at: now, kind }
  let queue: AutomationEventItem[] = []
  try { queue = JSON.parse((await env.SUBS.get(evKey(rec.fileId))) ?? '[]') as AutomationEventItem[] } catch { queue = [] }
  await env.SUBS.put(evKey(rec.fileId), JSON.stringify([...queue, ev].slice(-20)), { expirationTtl: 14 * 24 * 3600 })

  if (kind === 'finish') {
    // ogni push è visibile (Safari non ammette quelle silenziose): si avvisa solo alla fine del ciclo
    const vapid: VapidKeys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || 'https://example.invalid/' }
    for (const email of rec.recipients) {
      for (const s of await loadSubs(env, rec.fileId, email)) await sendWebPush(s, { title: rec.title, body: rec.body, tag: `auto:${ev.id}` }, vapid).catch(() => undefined)
    }
  }
  return { status: 200, body: { ok: true, event: kind } }
}

const ACTIONS = ['todo', 'complete', 'start', 'finish'] as const
const sha = async (s: string) => b64u.enc(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).slice(0, 16)

/**
 * GET o POST /do/<codice>?task=<id o nome>&do=<todo|complete|start|finish>&who=<id del membro>: comando da Shortcuts (iPhone).
 * Il Worker non conosce le azioni: mette il comando in coda e lo applica l'app alla prossima apertura (`do` assente = decide l'app
 * dallo stato dell'azione: in corso → finisce, con durata → avvia, altrimenti completa). Un comando uguale entro un minuto è un doppione e si ignora.
 */
export async function shortcutAct(env: Env, token: string, params: URLSearchParams, now = Date.now()): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!TOKEN.test(token)) return { status: 404, body: { error: 'Non trovato' } }
  const rec = await load(env, token)
  if (!rec || rec.type !== 'shortcut') return { status: 404, body: { error: 'Non trovato' } }
  const task = (params.get('task') ?? '').trim().slice(0, 100)
  if (!task) return { status: 400, body: { error: 'Manca il parametro task (id o nome dell’azione)' } }
  const act = params.get('do')
  if (act && !(ACTIONS as readonly string[]).includes(act)) return { status: 400, body: { error: 'Il parametro do deve essere todo, complete, start o finish' } }
  const who = (params.get('who') ?? '').trim().slice(0, 80)

  const dk = `scd:${token}:${await sha(`${task}|${act ?? ''}|${who}`)}`
  if (await env.SUBS.get(dk)) return { status: 200, body: { ok: true, ignored: 'doppione' } }
  await env.SUBS.put(dk, '1', { expirationTtl: 60 })

  const ev: AutomationEventItem = { id: `${rec.ruleId}-act-${now}-${await sha(`${task}|${act ?? ''}`)}`.slice(0, 120), ruleId: rec.ruleId, at: now, kind: 'act', task, ...(act ? { do: act as AutomationEventItem['do'] } : {}), ...(who ? { who } : {}) }
  let queue: AutomationEventItem[] = []
  try { queue = JSON.parse((await env.SUBS.get(evKey(rec.fileId))) ?? '[]') as AutomationEventItem[] } catch { queue = [] }
  await env.SUBS.put(evKey(rec.fileId), JSON.stringify([...queue, ev].slice(-20)), { expirationTtl: 14 * 24 * 3600 })
  return { status: 200, body: { ok: true, queued: true } }
}
