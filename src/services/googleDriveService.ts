/**
 * Servizio Google Drive (API v3) + Google Identity Services (OAuth 2.0 client-side).
 * Scope: drive.file -> l'app vede solo i file che ha creato o che l'utente ha aperto con il Picker.
 */
import type { AppDatabase } from '../types'
import { parseDb } from '../lib/merge'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { google?: any; gapi?: any }
}

export const SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const DB_FILE_NAME = 'cleanduo-db.json'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export interface GoogleConfig {
  clientId: string
  /** Facoltativi: servono solo per il Google Picker (selezione file condiviso) */
  apiKey: string
  appId: string
}

export interface DriveMeta { id: string; name: string; version: string; modifiedTime: string }
export interface DrivePermission { id: string; emailAddress?: string; displayName?: string; role: string }
export interface GoogleUser { email: string; name: string }

export class AuthError extends Error { constructor(m = 'Sessione Google scaduta. Riconnettiti.') { super(m); this.name = 'AuthError' } }
export class NotFoundError extends Error { constructor(m = 'File non trovato o non accessibile.') { super(m); this.name = 'NotFoundError' } }
export class ConflictError extends Error { constructor() { super('Conflitto di versione'); this.name = 'ConflictError' } }
export class NetworkError extends Error { constructor() { super('Nessuna connessione'); this.name = 'NetworkError' } }

/* ---------- caricamento script ---------- */
const scripts = new Map<string, Promise<void>>()
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src; s.async = true
      s.onload = () => resolve()
      s.onerror = () => { scripts.delete(src); reject(new NetworkError()) }
      document.head.appendChild(s)
    })
    scripts.set(src, p)
  }
  return p
}

/* ---------- autenticazione (GIS token model) ---------- */
let accessToken: string | null = null
let tokenExpiry = 0
let tokenClient: any = null
let tokenClientId = ''
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null

export function hasValidToken(): boolean {
  return !!accessToken && Date.now() < tokenExpiry - 30_000
}

async function getTokenClient(clientId: string) {
  await loadScript('https://accounts.google.com/gsi/client')
  if (!tokenClient || tokenClientId !== clientId) {
    tokenClientId = clientId
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp: any) => {
        if (resp.error) { pending?.reject(new AuthError(resp.error_description || resp.error)); pending = null; return }
        accessToken = resp.access_token
        tokenExpiry = Date.now() + (Number(resp.expires_in) || 3600) * 1000
        pending?.resolve(resp.access_token); pending = null
      },
      error_callback: (err: any) => {
        pending?.reject(new AuthError(err?.type === 'popup_closed' ? 'Accesso annullato.' : err?.message || 'Accesso non riuscito.'))
        pending = null
      },
    })
  }
  return tokenClient
}

/** interactive=true mostra il popup di consenso; false tenta il rinnovo silenzioso. */
export async function signIn(clientId: string, interactive: boolean): Promise<string> {
  if (!clientId) throw new AuthError('Inserisci prima il Google Client ID nelle impostazioni.')
  if (hasValidToken() && tokenClientId === clientId) return accessToken!
  const client = await getTokenClient(clientId)
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject }
    client.requestAccessToken({ prompt: interactive ? 'select_account' : '' })
  })
}

export function signOut() {
  if (accessToken && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(accessToken, () => {})
  accessToken = null; tokenExpiry = 0
}

/* ---------- fetch con gestione errori ---------- */
async function api(path: string, init: RequestInit = {}, base = API): Promise<Response> {
  if (!hasValidToken()) throw new AuthError()
  let res: Response
  try {
    res = await fetch(base + path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` } })
  } catch {
    throw new NetworkError()
  }
  if (res.status === 401) { accessToken = null; throw new AuthError() }
  if (res.status === 404) throw new NotFoundError()
  if (res.status === 403) {
    const body = await res.json().catch(() => null)
    const reason = body?.error?.errors?.[0]?.reason
    if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') throw new NetworkError()
    throw new NotFoundError('Accesso negato: apri il file con "Unisciti a una casa" (Picker) per autorizzare l’app.')
  }
  if (!res.ok) throw new Error(`Errore Google Drive (${res.status})`)
  return res
}

const META_FIELDS = 'id,name,version,modifiedTime'

export async function getUser(): Promise<GoogleUser> {
  const res = await api('/about?fields=user(emailAddress,displayName)')
  const j = await res.json()
  return { email: j.user?.emailAddress ?? '', name: j.user?.displayName ?? '' }
}

/* ---------- file DB ---------- */
export async function findDbFiles(): Promise<DriveMeta[]> {
  const q = encodeURIComponent(`name='${DB_FILE_NAME}' and trashed=false`)
  const res = await api(`/files?q=${q}&orderBy=modifiedTime desc&pageSize=10&fields=files(${META_FIELDS})`)
  return (await res.json()).files ?? []
}

export async function getMeta(fileId: string): Promise<DriveMeta> {
  const res = await api(`/files/${encodeURIComponent(fileId)}?fields=${META_FIELDS}`)
  return res.json()
}

export async function readDb(fileId: string): Promise<{ meta: DriveMeta; db: AppDatabase }> {
  // Prima i metadati: se qualcuno scrive nel frattempo, la versione "vecchia" farà scattare il conflitto in scrittura.
  const meta = await getMeta(fileId)
  const res = await api(`/files/${encodeURIComponent(fileId)}?alt=media`)
  const db = parseDb(await res.json())
  return { meta, db }
}

function multipartBody(metadata: object, content: string, boundary: string): string {
  return [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata),
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', content, `--${boundary}--`,
  ].join('\r\n')
}

export async function createDb(db: AppDatabase): Promise<DriveMeta> {
  const boundary = 'cleanduo' + Math.random().toString(36).slice(2)
  const body = multipartBody({ name: DB_FILE_NAME, mimeType: 'application/json' }, JSON.stringify(db), boundary)
  const res = await api(`/files?uploadType=multipart&fields=${META_FIELDS}`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  }, UPLOAD)
  return res.json()
}

/**
 * Scrive il DB solo se la versione remota coincide con quella letta (controllo ottimistico).
 * Altrimenti lancia ConflictError e il chiamante rilegge, fa il merge e riprova.
 */
export async function writeDb(fileId: string, db: AppDatabase, expectedVersion: string): Promise<DriveMeta> {
  const current = await getMeta(fileId)
  if (current.version !== expectedVersion) throw new ConflictError()
  const res = await api(`/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${META_FIELDS}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db),
  }, UPLOAD)
  return res.json()
}

/* ---------- condivisione ---------- */
export async function shareFile(fileId: string, email: string): Promise<void> {
  await api(`/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true&fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
  })
}

export async function listPermissions(fileId: string): Promise<DrivePermission[]> {
  const res = await api(`/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,emailAddress,displayName,role)`)
  return (await res.json()).permissions ?? []
}

/* ---------- Google Picker ---------- */
export function pickerAvailable(cfg: GoogleConfig): boolean {
  return !!cfg.apiKey && !!cfg.appId
}

/** Apre il Picker e restituisce l'ID del file scelto (concede all'app l'accesso drive.file a quel file). */
export async function pickDbFile(cfg: GoogleConfig): Promise<string | null> {
  if (!hasValidToken()) throw new AuthError()
  await loadScript('https://apis.google.com/js/api.js')
  await new Promise<void>((resolve) => window.gapi.load('picker', () => resolve()))
  const g = window.google.picker
  const shared = new g.DocsView(g.ViewId.DOCS).setMimeTypes('application/json').setOwnedByMe(false).setIncludeFolders(false)
  const mine = new g.DocsView(g.ViewId.DOCS).setMimeTypes('application/json').setIncludeFolders(false)
  return new Promise<string | null>((resolve) => {
    const picker = new g.PickerBuilder()
      .addView(shared)
      .addView(mine)
      .setOAuthToken(accessToken)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setTitle(`Scegli ${DB_FILE_NAME}`)
      .setCallback((data: any) => {
        if (data.action === g.Action.PICKED) resolve(data.docs?.[0]?.id ?? null)
        else if (data.action === g.Action.CANCEL) resolve(null)
      })
      .build()
    picker.setVisible(true)
  })
}

/** Estrae un ID file da un link Drive oppure dall'ID stesso. */
export function parseFileId(input: string): string {
  const s = input.trim()
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  return m ? m[1] : s
}
