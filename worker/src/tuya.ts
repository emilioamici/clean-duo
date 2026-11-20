import type { Env } from './index'

/**
 * Client minimo per le API cloud di Tuya (OpenAPI) e valutazione delle condizioni dei dispositivi.
 * Firma delle richieste: HMAC-SHA256 (vedi la documentazione «Signature» di Tuya Developer).
 *   - token:    sign = HMAC(client_id + t + stringToSign)
 *   - servizio: sign = HMAC(client_id + access_token + t + stringToSign)
 *   - stringToSign = METODO \n SHA256(corpo) \n (header firmati, vuoti) \n percorso?query
 */
const enc = new TextEncoder()
const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)))
}
export async function hmacHexUpper(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg))).toUpperCase()
}

export const tuyaConfigured = (env: Env): boolean => !!(env.TUYA_ACCESS_ID && env.TUYA_ACCESS_SECRET)
const base = (env: Env): string => (env.TUYA_ENDPOINT || 'https://openapi.tuyaeu.com').replace(/\/+$/, '')

export class TuyaError extends Error {
  constructor(public code: number | string, message: string) { super(message) }
}

interface TuyaReply<T> { success?: boolean; result?: T; code?: number; msg?: string }

/** Richiesta firmata. `token` assente = richiesta del token. */
export async function signedRequest<T>(env: Env, method: 'GET' | 'POST', pathAndQuery: string, token: string | null, body?: unknown): Promise<TuyaReply<T>> {
  const t = String(Date.now())
  const bodyStr = body === undefined ? '' : JSON.stringify(body)
  const stringToSign = [method, await sha256Hex(bodyStr), '', pathAndQuery].join('\n')
  const id = env.TUYA_ACCESS_ID!
  const sign = await hmacHexUpper(env.TUYA_ACCESS_SECRET!, token ? id + token + t + stringToSign : id + t + stringToSign)
  const headers: Record<string, string> = { client_id: id, sign, t, sign_method: 'HMAC-SHA256', 'Content-Type': 'application/json' }
  if (token) headers.access_token = token
  const res = await fetch(base(env) + pathAndQuery, { method, headers, body: bodyStr || undefined })
  return (await res.json().catch(() => ({}))) as TuyaReply<T>
}

const TOKEN_KEY = 'tuya:token'

async function getToken(env: Env, force = false): Promise<string> {
  if (!force) {
    try {
      const c = JSON.parse((await env.SUBS.get(TOKEN_KEY)) ?? 'null') as { token: string; exp: number } | null
      if (c && c.exp - Date.now() > 120_000) return c.token
    } catch { /* si richiede un nuovo token */ }
  }
  const r = await signedRequest<{ access_token: string; expire_time: number }>(env, 'GET', '/v1.0/token?grant_type=1', null)
  if (!r.success || !r.result?.access_token) throw new TuyaError(r.code ?? 'token', r.msg ?? 'Token Tuya non ottenuto')
  const ttl = Math.max(120, r.result.expire_time ?? 7200)
  await env.SUBS.put(TOKEN_KEY, JSON.stringify({ token: r.result.access_token, exp: Date.now() + ttl * 1000 }), { expirationTtl: ttl })
  return r.result.access_token
}

/** GET firmata con token; se il token non è più valido (1010) lo rinnova una volta. */
export async function tuyaGet<T>(env: Env, pathAndQuery: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(env, attempt > 0)
    const r = await signedRequest<T>(env, 'GET', pathAndQuery, token)
    if (r.success) return r.result as T
    if (r.code === 1010 && attempt === 0) continue // token scaduto o non valido
    throw new TuyaError(r.code ?? 'errore', r.msg ?? 'Errore Tuya')
  }
  throw new TuyaError('errore', 'Errore Tuya')
}

export interface DeviceStatusItem { code: string; value: unknown }
export interface DeviceInfo { name: string; online: boolean; category: string; status: DeviceStatusItem[] }

/** Nome, stato online e tutti i dati correnti di un dispositivo. */
export async function deviceInfo(env: Env, deviceId: string): Promise<DeviceInfo> {
  const d = await tuyaGet<{ name?: string; online?: boolean; category?: string; status?: DeviceStatusItem[] }>(env, `/v1.0/devices/${encodeURIComponent(deviceId)}`)
  let status = d.status
  if (!Array.isArray(status)) status = await tuyaGet<DeviceStatusItem[]>(env, `/v1.0/devices/${encodeURIComponent(deviceId)}/status`)
  return { name: d.name ?? deviceId, online: d.online !== false, category: d.category ?? '', status }
}

export type Op = 'eq' | 'ne' | 'lt' | 'gt' | 'bit' | 'contains'
export const OPS: Op[] = ['eq', 'ne', 'lt', 'gt', 'bit', 'contains']
export interface Condition { code: string; op: Op; value: string }

const norm = (v: unknown): string => (Array.isArray(v) ? v.join(',') : String(v))

/** La condizione è soddisfatta dai dati attuali del dispositivo? Un dato mancante = no. */
export function evalCondition(status: DeviceStatusItem[], c: Condition): boolean {
  const dp = status.find((s) => s.code === c.code)
  if (!dp) return false
  const v = dp.value
  switch (c.op) {
    case 'eq': return norm(v) === c.value || (typeof v === 'number' && Number(c.value) === v)
    case 'ne': return !(norm(v) === c.value || (typeof v === 'number' && Number(c.value) === v))
    case 'lt': return Number(v) < Number(c.value)
    case 'gt': return Number(v) > Number(c.value)
    case 'bit': { const n = Number(v); const b = Number(c.value); return Number.isInteger(n) && Number.isInteger(b) && b >= 0 && b < 31 && ((n >> b) & 1) === 1 }
    case 'contains': return norm(v).includes(c.value)
  }
}
