import { t } from '../i18n'
/**
 * Notifiche push dal server (Cloudflare Worker, vedi worker/README.md).
 * Il server conosce solo i dispositivi iscritti: chi fa una modifica gli dice a chi inviare la notifica.
 * Indirizzo e chiave pubblica vengono dalla build (variabili VITE_PUSH_URL e VITE_VAPID_PUBLIC_KEY).
 */

const strip = (s: string) => s.trim().replace(/\/+$/, '')

export const pushUrl = (): string => strip((import.meta.env.VITE_PUSH_URL as string | undefined) || '')
export const vapidPublicKey = (): string => (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || ''
export const pushConfigured = (): boolean => !!pushUrl() && !!vapidPublicKey()

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'

const describe = (e: unknown): string => (e instanceof Error ? (e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : e.message) : String(e))

const keyBytes = (b64u: string): Uint8Array => {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4)
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

/** Errore restituito dal server delle notifiche (con il codice HTTP, per capire se ritentare). */
export class PushHttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function post(path: string, token: string, body: unknown): Promise<unknown> {
  const r = await fetch(pushUrl() + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as { error?: string }
  if (!r.ok) throw new PushHttpError(r.status, j.error || t('Server notifiche: errore {status}', { status: r.status }))
  return j
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready
}

/** Dispositivo attualmente iscritto al push (null se no). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  try { return await (await registration()).pushManager.getSubscription() } catch { return null }
}

/** Chiede il permesso (da chiamare in risposta a un tocco), iscrive il dispositivo e lo registra sul server. */
export async function enablePush(fileId: string, token: string): Promise<void> {
  if (!pushConfigured()) throw new Error(t('Server delle notifiche non configurato.'))
  if (!pushSupported()) throw new Error(t('Questo browser non supporta le notifiche push. Su iPhone servono iOS 16.4+ e l\'app aggiunta alla schermata Home (non da una scheda di Safari).'))
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (perm !== 'granted') throw new Error(t('Permesso negato: abilitalo dalle impostazioni del browser o del telefono per questo sito.'))
  let reg: ServiceWorkerRegistration
  try { reg = await registration() } catch (e) { throw new Error(t('Passaggio 1 di 3, service worker non disponibile: {e}', { e: describe(e) })) }
  let sub: PushSubscription
  try {
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey()) as BufferSource }))
  } catch (e) {
    throw new Error(t('Passaggio 2 di 3, il browser non riesce a iscriversi al servizio push ({e}). Controlla la chiave pubblica VAPID e, su iPhone, che l\'app sia aperta dall\'icona sulla Home con iOS 16.4 o successivo.', { e: describe(e) }))
  }
  try { await post('/subscribe', token, { fileId, subscription: sub.toJSON() }) } catch (e) {
    if (e instanceof TypeError) throw new Error(t('Passaggio 3 di 3, non riesco a contattare il server {url} ({e}). Controlla l\'indirizzo e la connessione.', { url: pushUrl(), e: describe(e) }))
    throw e
  }
}

/** Rinnova la registrazione sul server (si fa a ogni apertura: tiene viva la sottoscrizione). */
export async function refreshPush(fileId: string, token: string): Promise<void> {
  const sub = await currentSubscription()
  if (sub) await post('/subscribe', token, { fileId, subscription: sub.toJSON() })
}

export async function disablePush(fileId: string, token: string | null): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => false)
  if (token) await post('/unsubscribe', token, { fileId, endpoint }).catch(() => undefined)
}

export interface PushMessage { recipients: string[]; title: string; body: string; tag?: string; test?: boolean }

/** Chiede al server di inviare una notifica ai destinatari. */
export async function sendPush(fileId: string, token: string, m: PushMessage): Promise<void> {
  await post('/notify', token, { fileId, ...m })
}

export interface ScheduledReminder { at: number; title: string; body: string; tag?: string }

/** Sostituisce i promemoria programmati di questo utente sul server (lista vuota = li cancella). */
export async function scheduleReminders(fileId: string, token: string, items: ScheduledReminder[]): Promise<void> {
  await post('/schedule', token, { fileId, items })
}
