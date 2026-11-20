import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppDatabase, Member, Room, Settings, Task } from '../types'
import { applyTheme, getTheme, setTheme as setStoredTheme, type Theme } from '../lib/theme'
import { createDemoDb, createEmptyDb } from '../lib/demo'
import { uid } from '../lib/clean'
import { mergeDb, sameContent } from '../lib/merge'
import * as drive from '../services/googleDriveService'
import { hasSession } from '../services/broker'
import { PushHttpError, currentSubscription, disablePush, enablePush, pushConfigured, pushSupported, refreshPush, scheduleReminders, sendPush } from '../services/push'
import { enqueue, flushQueue, type QueuedPush, type SendResult } from '../services/pushQueue'
import { diffNotifications, mergeNotifications, pushTargets, type Notif } from '../lib/notifications'
import { DEFAULT_REMINDER_TIME, buildReminders, dueNow, reminderText, validTime } from '../lib/reminders'
import { t } from '../i18n'
import type { GoogleConfig, GoogleUser } from '../services/googleDriveService'

type SyncStatus = 'demo' | 'idle' | 'syncing' | 'offline' | 'auth' | 'error'

interface LocalMeta { mode: 'demo' | 'drive'; fileId: string | null; version: string | null; dirty: boolean; lastSyncAt: number | null }

const K = { db: 'cleanduo:db', meta: 'cleanduo:meta', cfg: 'cleanduo:config', me: 'cleanduo:me', email: 'cleanduo:email', demo: 'cleanduo:demo', prefs: 'cleanduo:prefs', notifs: 'cleanduo:notifs:' }

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota / private mode */ }
}

const envCfg: GoogleConfig = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? '',
  appId: import.meta.env.VITE_GOOGLE_APP_ID ?? '',
}

/** Preferenze di questo dispositivo (le notifiche per tipo stanno invece nel profilo del membro, così chi scrive sa a chi inviarle). */
export interface Prefs {
  /** notifiche di sistema attive su questo dispositivo */
  systemNotif: boolean
  /** notifiche push dal server attive su questo dispositivo */
  pushEnabled: boolean
  /** promemoria giornaliero delle azioni da fare */
  reminders: boolean
  reminderTime: string
  /** giorno (AAAA-MM-GG) dell'ultimo promemoria mostrato in app */
  lastReminderDay: string
}
const DEFAULT_PREFS: Prefs = { systemNotif: false, pushEnabled: false, reminders: false, reminderTime: DEFAULT_REMINDER_TIME, lastReminderDay: '' }

/** Notifica di sistema, mostrata solo se l'app non è in primo piano. */
async function systemNotify(n: { id: string; title: string; body: string }): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.visibilityState === 'visible') return
  const opts: NotificationOptions = { body: n.body, icon: `${import.meta.env.BASE_URL}pwa-192.png`, badge: `${import.meta.env.BASE_URL}pwa-192.png`, tag: n.id }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(n.title, opts)
    else new Notification(n.title, opts)
  } catch { /* notifiche non disponibili */ }
}

const loadNotifs = (key: string): Notif[] => { try { return JSON.parse(localStorage.getItem(key) || '[]') as Notif[] } catch { return [] } }

interface Ctx {
  db: AppDatabase
  mode: 'demo' | 'drive'
  fileId: string | null
  status: SyncStatus
  statusMessage: string
  lastSyncAt: number | null
  dirty: boolean
  user: GoogleUser | null
  config: GoogleConfig
  setConfig: (c: GoogleConfig) => void
  theme: Theme
  setTheme: (t: Theme) => void
  meId: string | null
  me: Member | null
  setMeId: (id: string) => void
  toast: string | null
  notify: (msg: string) => void
  // accesso e notifiche
  persistent: boolean
  prefs: Prefs
  setPrefs: (p: Partial<Prefs>) => void
  notifications: Notif[]
  unread: number
  markRead: (id: string) => void
  markAllRead: () => void
  clearNotifications: () => void
  toastNotif: Notif | null
  dismissToastNotif: () => void
  centerOpen: boolean
  setCenterOpen: (o: boolean) => void
  /** Attiva le notifiche su questo dispositivo (permesso + push dal server). Ritorna un messaggio d'errore se il push non parte. */
  enableNotifications: () => Promise<string | null>
  disableNotifications: () => Promise<void>
  sendTestPush: () => Promise<void>
  // dati
  upsertRoom: (r: Omit<Room, 'id' | 'updatedAt'> & { id?: string }) => void
  deleteRoom: (id: string) => void
  upsertTask: (t: Omit<Task, 'id' | 'updatedAt' | 'createdAt' | 'lastCompletedAt' | 'completions' | 'archived'> & { id?: string }) => void
  deleteTask: (id: string) => void
  completeTask: (taskId: string, memberId: string) => number
  upsertMember: (m: Omit<Member, 'id' | 'updatedAt'> & { id?: string }) => string
  deleteMember: (id: string) => void
  updateSettings: (s: Partial<Settings> & { houseName?: string }) => void
  // drive
  syncNow: () => Promise<void>
  /** Accede con Google e restituisce i database trovati su Drive (nessun collegamento automatico). */
  connect: () => Promise<drive.DriveMeta[]>
  reconnect: () => Promise<void>
  createHouse: (houseName: string, fromCurrent: boolean, memberName?: string) => Promise<void>
  joinHouse: (fileIdOrLink: string | null, usePicker: boolean) => Promise<void>
  shareWith: (email: string) => Promise<void>
  disconnect: () => void
  resetDemo: () => void
  /** L'utente ha scelto di provare l'app in demo senza accedere (pagina iniziale superata). */
  demoSkipped: boolean
  setDemoSkipped: (v: boolean) => void
  /** Sessione Google scaduta ma l'utente prosegue offline, senza sync. */
  offlineSkipped: boolean
  setOfflineSkipped: (v: boolean) => void
}

const AppCtx = createContext<Ctx | null>(null)
export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp fuori da AppProvider')
  return c
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDbState] = useState<AppDatabase>(() => load<AppDatabase | null>(K.db, null) ?? createDemoDb())
  const [meta, setMetaState] = useState<LocalMeta>(() => load<LocalMeta>(K.meta, { mode: 'demo', fileId: null, version: null, dirty: false, lastSyncAt: null }))
  const [status, setStatus] = useState<SyncStatus>(meta.mode === 'demo' ? 'demo' : 'idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [user, setUser] = useState<GoogleUser | null>(null)
  const [config, setConfigState] = useState<GoogleConfig>(() => ({ ...envCfg, ...load<Partial<GoogleConfig>>(K.cfg, {}) }))
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [meId, setMeIdState] = useState<string | null>(() => load<string | null>(K.me, null))
  const [toast, setToast] = useState<string | null>(null)
  const [demoSkipped, setDemoSkippedState] = useState<boolean>(() => load<boolean>(K.demo, false))
  const [offlineSkipped, setOfflineSkipped] = useState(false)
  const setDemoSkipped = (v: boolean) => { setDemoSkippedState(v); save(K.demo, v) }

  const [prefs, setPrefsState] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...load<Partial<Prefs>>(K.prefs, {}) }))
  const [persistent, setPersistent] = useState(hasSession())
  const [notifications, setNotifications] = useState<Notif[]>([])
  const [toastNotif, setToastNotif] = useState<Notif | null>(null)
  const [centerOpen, setCenterOpen] = useState(false)
  const me = useMemo(
    () => db.members.find((m) => m.id === meId) ?? (meta.mode === 'demo' ? db.members[0] ?? null : null),
    [db.members, meId, meta.mode],
  )
  const meRef = useRef(me); meRef.current = me
  const prefsRef = useRef(prefs); prefsRef.current = prefs
  const dbRef = useRef(db); dbRef.current = db
  const metaRef = useRef(meta); metaRef.current = meta
  const configRef = useRef(config); configRef.current = config
  const syncing = useRef(false)
  const again = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const toastTimer = useRef<number | undefined>(undefined)

  const setDb = useCallback((next: AppDatabase) => { dbRef.current = next; setDbState(next); save(K.db, next) }, [])
  const setMeta = useCallback((patch: Partial<LocalMeta>) => {
    const next = { ...metaRef.current, ...patch }
    metaRef.current = next; setMetaState(next); save(K.meta, next)
  }, [])

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  /* ---------- tema (Mochi / Zenitsu / automatico) ---------- */
  useEffect(() => { applyTheme(theme) }, [theme])
  const setTheme = (t: Theme) => { setThemeState(t); setStoredTheme(t) }

  const setConfig = (c: GoogleConfig) => {
    const clean = { clientId: c.clientId.trim(), apiKey: c.apiKey.trim(), appId: c.appId.trim() }
    setConfigState(clean); save(K.cfg, clean)
  }

  const setMeId = (id: string) => { setMeIdState(id); save(K.me, id) }
  const setPrefs = useCallback((p: Partial<Prefs>) => { const n = { ...prefsRef.current, ...p }; prefsRef.current = n; setPrefsState(n); save(K.prefs, n) }, [])

  /* ---------- notifiche in app (campanella) ---------- */
  const notifKey = meta.fileId && me ? `${K.notifs}${meta.fileId}:${me.id}` : null
  const notifKeyRef = useRef<string | null>(null)
  useEffect(() => { notifKeyRef.current = notifKey; setNotifications(notifKey ? loadNotifs(notifKey) : []) }, [notifKey])
  const persistNotifs = useCallback((list: Notif[]) => { const k = notifKeyRef.current; if (k) save(k, list) }, [])
  /** Dati arrivati da altri: confronto prima/dopo e crea le notifiche per me. */
  const onRemote = useCallback((prev: AppDatabase, next: AppDatabase) => {
    const who = meRef.current
    if (!who || !notifKeyRef.current) return
    const fresh = diffNotifications(prev, next, who.id)
    if (!fresh.length) return
    setNotifications((cur) => { const merged = mergeNotifications(cur, fresh); persistNotifs(merged); return merged })
    if (document.visibilityState === 'visible') setToastNotif(fresh[0])
    else if (prefsRef.current.systemNotif) for (const n of fresh.slice(0, 3)) void systemNotify(n)
  }, [persistNotifs])
  const onRemoteRef = useRef(onRemote); onRemoteRef.current = onRemote
  const markRead = useCallback((id: string) => setNotifications((cur) => { const n = cur.map((x) => (x.id === id ? { ...x, read: true } : x)); persistNotifs(n); return n }), [persistNotifs])
  const markAllRead = useCallback(() => setNotifications((cur) => { const n = cur.map((x) => ({ ...x, read: true })); persistNotifs(n); return n }), [persistNotifs])
  const clearNotifications = useCallback(() => { setNotifications([]); persistNotifs([]) }, [persistNotifs])
  const dismissToastNotif = useCallback(() => setToastNotif(null), [])
  useEffect(() => { if (!toastNotif) return; const id = window.setTimeout(() => setToastNotif(null), 6000); return () => window.clearTimeout(id) }, [toastNotif])
  const unread = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  /* ---------- sincronizzazione ---------- */
  const handleSyncError = useCallback((e: unknown) => {
    if (e instanceof drive.AuthError) { setStatus('auth'); setStatusMessage(t('Sessione scaduta: tocca «Riconnetti».')) }
    else if (e instanceof drive.NetworkError || (e instanceof TypeError)) { setStatus('offline'); setStatusMessage(t('Offline: le modifiche saranno sincronizzate appena possibile.')) }
    else { setStatus('error'); setStatusMessage(e instanceof Error ? e.message : t('Errore di sincronizzazione')) }
  }, [])

  /** Invia le notifiche push in coda (i dati sono già su Drive). Errori di rete o del server: si tiene e si riprova al prossimo ciclo. */
  const flushPushQueue = useCallback(async () => {
    const m = metaRef.current
    const token = drive.currentToken()
    if (!pushConfigured() || m.mode !== 'drive' || !m.fileId || !token) return
    await flushQueue({
      fileId: m.fileId,
      exists: (q) => (q.taskId ? dbRef.current.tasks.some((x) => x.id === q.taskId) : true),
      send: async (q: QueuedPush): Promise<SendResult> => {
        try { await sendPush(m.fileId!, token, { recipients: [q.email], title: q.title, body: q.body, tag: q.tag }); return 'ok' } catch (e) {
          if (e instanceof PushHttpError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) return 'drop'
          return 'retry'
        }
      },
    }).catch(() => undefined)
  }, [])

  const runSync = useCallback(async () => {
    const m = metaRef.current
    if (m.mode !== 'drive' || !m.fileId) return
    if (syncing.current) { again.current = true; return }
    syncing.current = true
    setStatus('syncing'); setStatusMessage('')
    try {
      if (!drive.hasValidToken()) await drive.signIn(configRef.current.clientId, false)
      let done = false
      for (let attempt = 0; attempt < 5 && !done; attempt++) {
        const { meta: rm, db: remote } = await drive.readDb(m.fileId)
        const local = dbRef.current
        const merged = mergeDb(local, remote)
        onRemoteRef.current(local, merged)
        let version = rm.version
        if (!sameContent(merged, remote)) {
          merged.lastUpdated = Date.now()
          try {
            const written = await drive.writeDb(m.fileId, merged, rm.version)
            version = written.version
          } catch (e) {
            if (e instanceof drive.ConflictError) continue // qualcuno ha scritto: rileggi, unisci, riprova
            throw e
          }
        }
        // Se nel frattempo l'utente ha modificato localmente, non perdere nulla
        const cur = dbRef.current
        if (cur !== local) { setDb(mergeDb(cur, merged)); again.current = true }
        else setDb(merged)
        setMeta({ version, dirty: cur !== local, lastSyncAt: Date.now() })
        done = true
      }
      if (!done) throw new Error(t('Troppi conflitti: riprova tra poco.'))
      setStatus('idle'); setStatusMessage('')
      void flushPushQueue()
    } catch (e) {
      handleSyncError(e)
    } finally {
      syncing.current = false
      if (again.current) { again.current = false; window.setTimeout(() => void runSync(), 300) }
    }
  }, [handleSyncError, setDb, setMeta])

  const scheduleSync = useCallback(() => {
    if (metaRef.current.mode !== 'drive') return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void runSync(), 800)
  }, [runSync])

  const syncNow = useCallback(async () => { await runSync() }, [runSync])

  // sync all'apertura, al ritorno in primo piano, quando torna la rete, e a intervalli
  useEffect(() => {
    if (meta.mode !== 'drive') return
    void runSync()
    const onVis = () => { if (document.visibilityState === 'visible') void runSync() }
    const onOnline = () => void runSync()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    const iv = window.setInterval(() => { if (document.visibilityState === 'visible') void runSync() }, 60_000)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline); window.clearInterval(iv) }
  }, [meta.mode, meta.fileId, runSync])

  // profilo Google (best effort) quando il token è disponibile
  useEffect(() => {
    if (status !== 'idle' || user || meta.mode !== 'drive') return
    drive.getUser().then((u) => {
      setUser(u); save(K.email, u.email)
      const match = dbRef.current.members.find((x) => x.email && x.email.toLowerCase() === u.email.toLowerCase())
      if (match) setMeId(match.id)
    }).catch(() => {})
  }, [status, user, meta.mode])

  // accesso persistente: il token Google si rinnova da solo (anche in background, senza popup)
  useEffect(() => {
    const renew = () => { if (hasSession() && drive.tokenRemainingMs() < 10 * 60_000) void drive.renewWithSession().then((ok) => { if (ok) setPersistent(true) }).catch(() => setPersistent(hasSession())) }
    const iv = window.setInterval(renew, 60_000)
    return () => window.clearInterval(iv)
  }, [])

  // notifiche push: a ogni apertura si rinnova l'iscrizione del dispositivo sul server
  const pushReady = prefs.pushEnabled && meta.mode === 'drive' && !!meta.fileId && status === 'idle'
  useEffect(() => {
    const tk = drive.currentToken()
    if (pushReady && meta.fileId && tk && pushConfigured()) void refreshPush(meta.fileId, tk).catch(() => undefined)
  }, [pushReady, meta.fileId])

  // un push arrivato mentre l'app è in primo piano: sincronizza subito
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'cleanduo-push') void runSync() }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [runSync])

  // promemoria: il server li invia all'ora scelta anche con l'app chiusa; qui si ricalcolano a ogni sincronizzazione
  const remindersKey = `${prefs.reminders}|${prefs.reminderTime}|${prefs.pushEnabled}|${meta.lastSyncAt}|${db.lastUpdated}`
  useEffect(() => {
    if (meta.mode !== 'drive' || !meta.fileId || !pushConfigured() || !prefs.pushEnabled) return
    const tk = drive.currentToken()
    if (!tk) return
    const items = prefs.reminders && validTime(prefs.reminderTime) ? buildReminders(dbRef.current, meRef.current?.id ?? null, prefs.reminderTime) : []
    void scheduleReminders(meta.fileId, tk, items).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remindersKey])

  // promemoria locale (app aperta o in background): all'ora scelta, se ci sono azioni da fare, una volta al giorno
  useEffect(() => {
    const check = () => {
      const pr = prefsRef.current
      if (!pr.reminders || !validTime(pr.reminderTime)) return
      const now = new Date()
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      if (pr.lastReminderDay === day) return
      const [hh, mm] = pr.reminderTime.split(':').map(Number)
      if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return
      const n = dueNow(dbRef.current, meRef.current?.id ?? null)
      setPrefs({ lastReminderDay: day })
      if (n === 0) return
      const text = reminderText(n)
      const notif: Notif = { id: `reminder:${day}`, kind: 'reminder', at: Date.now(), read: false, ...text }
      setNotifications((cur) => { const merged = mergeNotifications(cur, [notif]); persistNotifs(merged); return merged })
      if (document.visibilityState === 'visible') setToastNotif(notif)
      else if (prefsRef.current.systemNotif && !(prefsRef.current.pushEnabled && pushConfigured())) void systemNotify(notif)
    }
    check()
    const iv = window.setInterval(check, 60_000)
    return () => window.clearInterval(iv)
  }, [persistNotifs, setPrefs])

  /* ---------- mutazioni dati ---------- */
  const mutate = useCallback((fn: (d: AppDatabase) => AppDatabase) => {
    const prev = dbRef.current
    const next = fn(prev)
    next.lastUpdated = Date.now()
    setDb(next)
    if (metaRef.current.mode === 'drive') {
      setMeta({ dirty: true })
      const who = meRef.current
      const fileId = metaRef.current.fileId
      if (who && fileId && pushConfigured()) {
        // la notifica parte solo dopo che i dati sono arrivati su Drive (vedi flushPushQueue)
        enqueue(pushTargets(prev, next, who.id).map(({ event, email }): QueuedPush => ({
          key: `${event.key}:${email}`, fileId, email, title: event.title, body: event.body, tag: event.key, at: Date.now(),
          taskId: event.kind === 'done' ? undefined : event.taskId, logId: event.kind === 'done' ? event.key : undefined,
        })))
      }
      scheduleSync()
    }
  }, [setDb, setMeta, scheduleSync])

  const tomb = (d: AppDatabase, ids: string[]) => ({ ...d.tombstones, ...Object.fromEntries(ids.map((i) => [i, Date.now()])) })

  const upsertRoom: Ctx['upsertRoom'] = (r) => mutate((d) => {
    const now = Date.now()
    if (r.id && d.rooms.some((x) => x.id === r.id)) return { ...d, rooms: d.rooms.map((x) => (x.id === r.id ? { ...x, ...r, id: x.id, updatedAt: now } : x)) }
    return { ...d, rooms: [...d.rooms, { ...r, id: r.id ?? uid('r'), updatedAt: now }] }
  })

  const deleteRoom: Ctx['deleteRoom'] = (id) => mutate((d) => {
    const taskIds = d.tasks.filter((t) => t.roomId === id).map((t) => t.id)
    return { ...d, rooms: d.rooms.filter((r) => r.id !== id), tasks: d.tasks.filter((t) => t.roomId !== id), tombstones: tomb(d, [id, ...taskIds]) }
  })

  const upsertTask: Ctx['upsertTask'] = (t) => mutate((d) => {
    const now = Date.now()
    if (t.id && d.tasks.some((x) => x.id === t.id)) return { ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, ...t, id: x.id, updatedAt: now } : x)) }
    const task: Task = { ...t, id: t.id ?? uid('t'), createdAt: now, createdBy: meRef.current?.id, lastCompletedAt: null, completions: 0, archived: false, updatedAt: now }
    return { ...d, tasks: [...d.tasks, task] }
  })

  const deleteTask: Ctx['deleteTask'] = (id) => mutate((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id), tombstones: tomb(d, [id]) }))

  const completeTask: Ctx['completeTask'] = (taskId, memberId) => {
    const task = dbRef.current.tasks.find((t) => t.id === taskId)
    if (!task) return 0
    const now = Date.now()
    mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) => t.id === taskId
        ? { ...t, lastCompletedAt: now, completions: t.completions + 1, archived: t.recurrence.type === 'once', updatedAt: now }
        : t),
      logs: [{ id: uid('l'), taskId, taskName: task.name, roomId: task.roomId, memberId, stars: task.stars, at: now }, ...d.logs].slice(0, 2000),
    }))
    return task.stars
  }

  const upsertMember: Ctx['upsertMember'] = (m) => {
    const id = m.id ?? uid('m')
    mutate((d) => {
      const now = Date.now()
      if (d.members.some((x) => x.id === id)) return { ...d, members: d.members.map((x) => (x.id === id ? { ...x, ...m, id, updatedAt: now } : x)) }
      return { ...d, members: [...d.members, { ...m, id, updatedAt: now }] }
    })
    return id
  }

  const deleteMember: Ctx['deleteMember'] = (id) => mutate((d) => ({
    ...d,
    members: d.members.filter((m) => m.id !== id),
    tasks: d.tasks.map((t) => {
      const a = t.assignment
      if (a.mode === 'member' && a.memberId === id) return { ...t, assignment: { mode: 'anyone' } as Task['assignment'], updatedAt: Date.now() }
      if (a.mode === 'rotation' && a.memberIds.includes(id)) {
        const rest = a.memberIds.filter((x) => x !== id)
        return { ...t, assignment: (rest.length ? { mode: 'rotation', memberIds: rest } : { mode: 'anyone' }) as Task['assignment'], updatedAt: Date.now() }
      }
      return t
    }),
    tombstones: tomb(d, [id]),
  }))

  const updateSettings: Ctx['updateSettings'] = (s) => mutate((d) => {
    const { houseName, ...rest } = s
    return { ...d, houseName: houseName ?? d.houseName, settings: { ...d.settings, ...rest }, settingsUpdatedAt: Date.now() }
  })

  /* ---------- Drive: connessione / casa ---------- */
  const reconnect = useCallback(async () => {
    try {
      await drive.signIn(configRef.current.clientId, true)
      setStatus('idle')
      await runSync()
    } catch (e) { handleSyncError(e) }
  }, [handleSyncError, runSync])

  const connect = useCallback(async () => {
    await drive.signIn(configRef.current.clientId, true)
    const u = await drive.getUser()
    setUser(u); save(K.email, u.email)
    return drive.findDbFiles()
  }, [])

  const createHouse: Ctx['createHouse'] = async (houseName, fromCurrent, memberName) => {
    if (!drive.hasValidToken()) await drive.signIn(configRef.current.clientId, true)
    const u = user ?? (await drive.getUser())
    setUser(u)
    let base: AppDatabase
    if (fromCurrent) base = { ...dbRef.current, houseName }
    else {
      base = createEmptyDb(houseName)
      const id = uid('m')
      base.members.push({ id, name: memberName?.trim() || u.name.split(' ')[0] || 'Io', color: '#c9692a', avatar: '🦊', email: u.email, updatedAt: Date.now() })
      setMeId(id)
    }
    base.lastUpdated = Date.now()
    const created = await drive.createDb(base)
    setDb(base)
    setMeta({ mode: 'drive', fileId: created.id, version: created.version, dirty: false, lastSyncAt: Date.now() })
    setStatus('idle')
    notify(t('Casa creata su Google Drive ✨'))
  }

  const joinHouse: Ctx['joinHouse'] = async (fileIdOrLink, usePicker) => {
    if (!drive.hasValidToken()) await drive.signIn(configRef.current.clientId, true)
    let id: string | null
    if (usePicker) id = await drive.pickDbFile(configRef.current)
    else id = fileIdOrLink ? drive.parseFileId(fileIdOrLink) : null
    if (!id) return
    const { meta: rm, db: remote } = await drive.readDb(id)
    const u = user ?? (await drive.getUser().catch(() => null))
    if (u) setUser(u)
    setDb(remote)
    setMeta({ mode: 'drive', fileId: id, version: rm.version, dirty: false, lastSyncAt: Date.now() })
    const match = u && remote.members.find((x) => x.email?.toLowerCase() === u.email.toLowerCase())
    if (match) setMeId(match.id)
    setStatus('idle')
    notify(t('Sei entrato in «{name}» 🏠', { name: remote.houseName }))
  }

  const shareWith: Ctx['shareWith'] = async (email) => {
    const id = metaRef.current.fileId
    if (!id) throw new Error(t('Crea prima la casa su Drive.'))
    if (!drive.hasValidToken()) await drive.signIn(configRef.current.clientId, true)
    await drive.shareFile(id, email.trim())
    notify(t('Invito inviato a {email}', { email: email.trim() }))
  }

  /* ---------- notifiche di questo dispositivo ---------- */
  const enableNotifications: Ctx['enableNotifications'] = async () => {
    if (typeof Notification === 'undefined') throw new Error(t('Questo browser non supporta le notifiche di sistema. Su iPhone servono iOS 16.4+ e l\'app aggiunta alla schermata Home.'))
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    if (perm !== 'granted') throw new Error(t('Il permesso per le notifiche è stato negato: abilitalo dalle impostazioni del browser o del telefono per questo sito.'))
    setPrefs({ systemNotif: true })
    if (!pushConfigured() || !pushSupported()) return null
    try {
      const tk = drive.currentToken()
      const fid = metaRef.current.fileId
      if (!tk || !fid) throw new Error(t('Per le notifiche con l\'app chiusa serve una casa collegata a Drive e la sessione Google attiva.'))
      await enablePush(fid, tk)
      setPrefs({ pushEnabled: true })
      return null
    } catch (e) { return e instanceof Error ? e.message : String(e) }
  }

  const disableNotifications: Ctx['disableNotifications'] = async () => {
    const fid = metaRef.current.fileId
    if (fid && prefsRef.current.pushEnabled && pushConfigured()) {
      const tk = drive.currentToken()
      if (tk) await scheduleReminders(fid, tk, []).catch(() => undefined)
      await disablePush(fid, tk).catch(() => undefined)
    }
    setPrefs({ systemNotif: false, pushEnabled: false })
  }

  const sendTestPush: Ctx['sendTestPush'] = async () => {
    const tk = drive.currentToken()
    const fid = metaRef.current.fileId
    const email = meRef.current?.email
    if (prefsRef.current.pushEnabled && pushConfigured() && fid && tk && email && (await currentSubscription())) {
      await sendPush(fid, tk, { recipients: [email], title: t('Notifica di prova'), body: t('Le notifiche di CleanDuo funzionano.'), tag: 'cleanduo-test', test: true })
      notify(t('Prova inviata dal server: dovrebbe arrivare tra pochi secondi (con l\'app in background).'))
      return
    }
    const opts: NotificationOptions = { body: t('Le notifiche di CleanDuo funzionano su questo dispositivo.'), icon: `${import.meta.env.BASE_URL}pwa-192.png`, tag: 'cleanduo-test' }
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(t('Notifica di prova'), opts)
    else new Notification(t('Notifica di prova'), opts)
  }

  const disconnect = () => {
    drive.signOut()
    setMeta({ mode: 'demo', fileId: null, version: null, dirty: false, lastSyncAt: null })
    setUser(null); setStatus('demo'); setStatusMessage(''); setDemoSkipped(false); setPersistent(false)
    notify(t('Scollegato da Drive: i dati restano salvati su questo dispositivo'))
  }

  const resetDemo = () => {
    const d = createDemoDb()
    setDb(d); setMeIdState(null)
    try { localStorage.removeItem(K.me) } catch { /* noop */ }
    setMeta({ mode: 'demo', fileId: null, version: null, dirty: false, lastSyncAt: null })
    setStatus('demo')
    notify(t('Dati demo ripristinati'))
  }

  const value: Ctx = {
    db, mode: meta.mode, fileId: meta.fileId, status, statusMessage, lastSyncAt: meta.lastSyncAt, dirty: meta.dirty,
    user, config, setConfig, theme, setTheme, meId, me, setMeId, toast, notify,
    persistent, prefs, setPrefs, notifications, unread, markRead, markAllRead, clearNotifications, toastNotif, dismissToastNotif, centerOpen, setCenterOpen,
    enableNotifications, disableNotifications, sendTestPush,
    upsertRoom, deleteRoom, upsertTask, deleteTask, completeTask, upsertMember, deleteMember, updateSettings,
    demoSkipped, setDemoSkipped, offlineSkipped, setOfflineSkipped,
    syncNow, connect, reconnect, createHouse, joinHouse, shareWith, disconnect, resetDemo,
  }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
