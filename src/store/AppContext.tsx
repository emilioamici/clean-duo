import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppDatabase, Member, Room, Settings, Task } from '../types'
import { applyTheme, getTheme, setTheme as setStoredTheme, type Theme } from '../lib/theme'
import { createDemoDb, createEmptyDb } from '../lib/demo'
import { uid } from '../lib/clean'
import { mergeDb, sameContent } from '../lib/merge'
import * as drive from '../services/googleDriveService'
import type { GoogleConfig, GoogleUser } from '../services/googleDriveService'

type SyncStatus = 'demo' | 'idle' | 'syncing' | 'offline' | 'auth' | 'error'

interface LocalMeta { mode: 'demo' | 'drive'; fileId: string | null; version: string | null; dirty: boolean; lastSyncAt: number | null }

const K = { db: 'cleanduo:db', meta: 'cleanduo:meta', cfg: 'cleanduo:config', me: 'cleanduo:me', email: 'cleanduo:email', demo: 'cleanduo:demo' }

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

  /* ---------- sincronizzazione ---------- */
  const handleSyncError = useCallback((e: unknown) => {
    if (e instanceof drive.AuthError) { setStatus('auth'); setStatusMessage('Sessione scaduta: tocca “Riconnetti”.') }
    else if (e instanceof drive.NetworkError || (e instanceof TypeError)) { setStatus('offline'); setStatusMessage('Offline: le modifiche saranno sincronizzate appena possibile.') }
    else { setStatus('error'); setStatusMessage(e instanceof Error ? e.message : 'Errore di sincronizzazione') }
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
      if (!done) throw new Error('Troppi conflitti: riprova tra poco.')
      setStatus('idle'); setStatusMessage('')
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

  /* ---------- mutazioni dati ---------- */
  const mutate = useCallback((fn: (d: AppDatabase) => AppDatabase) => {
    const next = fn(dbRef.current)
    next.lastUpdated = Date.now()
    setDb(next)
    if (metaRef.current.mode === 'drive') { setMeta({ dirty: true }); scheduleSync() }
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
    const task: Task = { ...t, id: t.id ?? uid('t'), createdAt: now, lastCompletedAt: null, completions: 0, archived: false, updatedAt: now }
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
    notify('Casa creata su Google Drive ✨')
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
    notify(`Sei entrato in “${remote.houseName}” 🏠`)
  }

  const shareWith: Ctx['shareWith'] = async (email) => {
    const id = metaRef.current.fileId
    if (!id) throw new Error('Crea prima la casa su Drive.')
    if (!drive.hasValidToken()) await drive.signIn(configRef.current.clientId, true)
    await drive.shareFile(id, email.trim())
    notify(`Invito inviato a ${email.trim()}`)
  }

  const disconnect = () => {
    drive.signOut()
    setMeta({ mode: 'demo', fileId: null, version: null, dirty: false, lastSyncAt: null })
    setUser(null); setStatus('demo'); setStatusMessage(''); setDemoSkipped(false)
    notify('Scollegato da Drive: i dati restano salvati su questo dispositivo')
  }

  const resetDemo = () => {
    const d = createDemoDb()
    setDb(d); setMeIdState(null)
    try { localStorage.removeItem(K.me) } catch { /* noop */ }
    setMeta({ mode: 'demo', fileId: null, version: null, dirty: false, lastSyncAt: null })
    setStatus('demo')
    notify('Dati demo ripristinati')
  }

  // membro corrente: valido solo se esiste ancora
  const me = useMemo(
    () => db.members.find((m) => m.id === meId) ?? (meta.mode === 'demo' ? db.members[0] ?? null : null),
    [db.members, meId, meta.mode],
  )

  const value: Ctx = {
    db, mode: meta.mode, fileId: meta.fileId, status, statusMessage, lastSyncAt: meta.lastSyncAt, dirty: meta.dirty,
    user, config, setConfig, theme, setTheme, meId, me, setMeId, toast, notify,
    upsertRoom, deleteRoom, upsertTask, deleteTask, completeTask, upsertMember, deleteMember, updateSettings,
    demoSkipped, setDemoSkipped, offlineSkipped, setOfflineSkipped,
    syncNow, connect, reconnect, createHouse, joinHouse, shareWith, disconnect, resetDemo,
  }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
