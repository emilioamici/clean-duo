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

/** Esito dell'invio secondo il server: quanti dispositivi raggiunti, rifiutati dal servizio di push, iscrizioni scadute tolte. */
export interface PushResult { sent: number; failed: number; removed: number; /** codici HTTP dei rifiuti (se il server li dà) */ codes: number[] }

/** Chiede al server di inviare una notifica ai destinatari e dice com'è andata (0 se il server non indica un campo). */
export async function sendPush(fileId: string, token: string, m: PushMessage): Promise<PushResult> {
  const j = (await post('/notify', token, { fileId, ...m })) as Partial<Record<keyof PushResult, unknown>>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return { sent: n(j.sent), failed: n(j.failed), removed: n(j.removed), codes: Array.isArray(j.codes) ? j.codes.filter((c): c is number => typeof c === 'number') : [] }
}

/** Cosa dire a chi ha premuto «Invia notifica di prova», in base a quello che il server ha davvero fatto. */
export function testPushMessage(r: PushResult): string {
  if (r.sent > 0) return t('Prova inviata dal server: dovrebbe arrivare tra pochi secondi.')
  if (r.removed > 0) return t('L\'iscrizione di questo dispositivo era scaduta e il server l\'ha tolta: disattiva e riattiva le notifiche, poi riprova.')
  if (r.failed > 0) return t('Il server ha provato a inviare ma il servizio di notifiche del telefono ha rifiutato (codice {code}). Disattiva e riattiva le notifiche; se continua, controlla le chiavi VAPID del server.', { code: r.codes.length ? [...new Set(r.codes)].join(', ') : '?' })
  return t('Il server non ha nessun dispositivo iscritto per la tua email: disattiva e riattiva le notifiche e riprova.')
}

export interface ScheduledReminder { at: number; title: string; body: string; tag?: string }

/** Sostituisce i promemoria programmati di questo utente sul server (lista vuota = li cancella). */
export async function scheduleReminders(fileId: string, token: string, items: ScheduledReminder[]): Promise<void> {
  await post('/schedule', token, { fileId, items })
}

export interface TimerPush { id: string; at: number; title: string; body: string; tag?: string; recipients: string[] }

/** Chiede al server di notificare tutti i destinatari (anche chi la programma) quando scade la durata di un'azione. */
export async function scheduleTimer(fileId: string, token: string, m: TimerPush): Promise<void> {
  await post('/timer', token, { fileId, ...m })
}

/** Annulla un timer programmato. */
export async function cancelTimer(fileId: string, token: string, id: string): Promise<void> {
  await post('/timer', token, { fileId, id, cancel: true })
}

/* ------------------------------------------------------------------ automazioni (Tuya) */

export interface TuyaCondition { code: string; op: 'eq' | 'ne' | 'lt' | 'gt' | 'bit' | 'contains'; value: string }
export interface TuyaDeviceInfo { name: string; online: boolean; category: string; status: Array<{ code: string; value: unknown }>; matched?: boolean }

/** Legge dal vivo i dati del dispositivo (e valuta la condizione, se data). */
export async function tuyaStatus(fileId: string, token: string, deviceId: string, condition?: TuyaCondition): Promise<TuyaDeviceInfo> {
  return (await post('/tuya/status', token, { fileId, deviceId, condition })) as TuyaDeviceInfo
}

export interface TuyaRulePayload extends TuyaCondition { ruleId: string; deviceId: string; recipients: string[]; title: string; body: string }

/** Il server controlla il dispositivo e segnala quando la condizione si verifica. */
export async function registerTuyaRule(fileId: string, token: string, rule: TuyaRulePayload): Promise<void> {
  await post('/tuya/rule', token, { fileId, ...rule })
}
export async function deleteTuyaRule(fileId: string, token: string, ruleId: string): Promise<void> {
  await post('/tuya/rule/delete', token, { fileId, ruleId })
}

export interface ServerEvent { id: string; ruleId: string; at: number; kind?: 'start' | 'finish' }
/** `v: 2` = questa app sa applicare anche inizio/fine di un ciclo (le versioni vecchie non li ricevono, così non li confermano senza usarli). */
export async function pullAutomationEvents(fileId: string, token: string): Promise<ServerEvent[]> {
  return ((await post('/automation/events', token, { fileId, v: 2 })) as { events?: ServerEvent[] }).events ?? []
}
export async function ackAutomationEvents(fileId: string, token: string, ids: string[]): Promise<void> {
  await post('/automation/ack', token, { fileId, ids })
}

/* ------------------------------------------------------------------ inizio e fine di un ciclo (es. Roomba via IFTTT) */

export interface CycleHookPayload { ruleId: string; recipients: string[]; title: string; body: string; regenerate?: boolean }

/** Crea (o aggiorna) il collegamento sul server e restituisce il codice segreto dell'indirizzo da chiamare. */
export async function registerCycleHook(fileId: string, token: string, p: CycleHookPayload): Promise<string> {
  const j = (await post('/hook/register', token, { fileId, ...p })) as { token?: string }
  if (!j.token) throw new Error(t('Il server non ha restituito il codice dell’indirizzo. Ridistribuisci il Worker dall’ultima versione.'))
  return j.token
}
export async function deleteCycleHook(fileId: string, token: string, ruleId: string): Promise<void> {
  await post('/hook/delete', token, { fileId, ruleId })
}
/** Indirizzo che il dispositivo (IFTTT, curl…) chiama per segnalare l'inizio o la fine del ciclo. */
export const cycleHookUrl = (hookToken: string, kind: 'start' | 'finish'): string => `${pushUrl()}/hook/${hookToken}/${kind}`
