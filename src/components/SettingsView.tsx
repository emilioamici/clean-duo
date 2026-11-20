import { Check, Cloud, Copy, ExternalLink, LogOut, Mail, Minus, Pencil, Plus, RefreshCw, RotateCcw, Share2, UserPlus, UserRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import * as drive from '../services/googleDriveService'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { SyncPill } from './Chrome'
import { Avatar, PageHeader } from './ui'
import { AppearanceCard } from './AppearanceCard'
import { timeAgo } from '../lib/stats'

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="glass space-y-3 p-4">{children}</div>
      {hint && <p className="mt-2 px-2 text-xs text-muted">{hint}</p>}
    </section>
  )
}

function CommitInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input {...rest} className="field" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />
}

async function run(fn: () => Promise<unknown>, setBusy: (b: boolean) => void, notify: (m: string) => void) {
  setBusy(true)
  try { await fn() } catch (e) { notify(e instanceof Error ? e.message : 'Operazione non riuscita') } finally { setBusy(false) }
}

export function SettingsView() {
  const app = useApp()
  const { db, mode, user, me } = app
  const { openMemberSheet } = useUi()

  return (
    <div>
      <PageHeader title="Impostazioni" subtitle="Casa, membri e sincronizzazione" right={<SyncPill />} />

      <Section title="Aspetto">
        <AppearanceCard />
      </Section>

      <Section title="Casa e obiettivi">
        <div>
          <label className="label !mt-0">Nome della casa</label>
          <CommitInput value={db.houseName} onCommit={(v) => app.updateSettings({ houseName: v.trim() || db.houseName })} />
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-line bg-bg/60 px-4 py-2">
          <span className="font-medium">Obiettivo a testa: {db.settings.weeklyGoal} ⭐/sett.</span>
          <span className="flex gap-2">
            <button className="glass-btn !p-2" onClick={() => app.updateSettings({ weeklyGoal: Math.max(1, db.settings.weeklyGoal - 1) })}><Minus size={16} /></button>
            <button className="glass-btn !p-2" onClick={() => app.updateSettings({ weeklyGoal: db.settings.weeklyGoal + 1 })}><Plus size={16} /></button>
          </span>
        </div>
        <div className="flex gap-2">
          <div className="w-16"><CommitInput value={db.settings.prizeEmoji} onCommit={(v) => app.updateSettings({ prizeEmoji: v })} aria-label="Emoji premio" style={{ textAlign: 'center' }} /></div>
          <div className="flex-1"><CommitInput value={db.settings.prize} placeholder="Premio del mese per il vincitore" onCommit={(v) => app.updateSettings({ prize: v })} /></div>
        </div>
      </Section>

      <Section title="Membri della casa" hint={me ? undefined : 'Scegli “Sono io” per attribuirti le stelle.'}>
        {db.members.map((m) => (
          <div key={m.id} className="flex items-center gap-3">
            <Avatar member={m} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{m.name}</p>
              <p className="truncate text-xs text-muted">{m.email || 'nessuna email'}</p>
            </div>
            <button className={`chip ${me?.id === m.id ? 'chip-active' : ''}`} onClick={() => app.setMeId(m.id)}>{me?.id === m.id ? <><Check size={14} /> Io</> : 'Sono io'}</button>
            <button className="glass-btn !p-2" onClick={() => openMemberSheet({ id: m.id })} aria-label={`Modifica ${m.name}`}><Pencil size={15} /></button>
          </div>
        ))}
        <div className="flex gap-2">
          <button className="glass-btn flex-1" onClick={() => openMemberSheet({})}><Plus size={16} /> Aggiungi membro</button>
          {mode === 'drive' && user && !db.members.some((m) => m.email?.toLowerCase() === user.email.toLowerCase()) && (
            <button className="glass-btn btn-primary flex-1" onClick={() => { const id = app.upsertMember({ name: user.name.split(' ')[0] || 'Io', email: user.email, avatar: '🐙', color: '#c0506a' }); app.setMeId(id) }}>
              <UserPlus size={16} /> Aggiungi me
            </button>
          )}
        </div>
      </Section>

      <DriveSection />

      <Section title="Dati">
        <button className="glass-btn w-full" onClick={() => { if (confirm(mode === 'drive' ? 'Ripristinare i dati demo scollega la casa da Drive (il file su Drive resta intatto). Continuare?' : 'Ripristinare i dati demo? Le modifiche locali andranno perse.')) app.resetDemo() }}>
          <RotateCcw size={16} /> Ripristina dati demo
        </button>
      </Section>
      <p className="pb-4 text-center text-xs text-muted">Clean Duo · v1.0</p>
    </div>
  )
}

function DriveSection() {
  const app = useApp()
  const { mode, fileId, user, config, status, statusMessage, lastSyncAt } = app
  const [cfg, setCfg] = useState(config)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [perms, setPerms] = useState<drive.DrivePermission[]>([])
  const [copied, setCopied] = useState(false)
  const [showCfg, setShowCfg] = useState(!config.clientId)

  useEffect(() => {
    if (mode !== 'drive' || !fileId || status !== 'idle') return
    drive.listPermissions(fileId).then(setPerms).catch(() => setPerms([]))
  }, [mode, fileId, status, app.lastSyncAt])

  const dirtyCfg = cfg.clientId !== config.clientId || cfg.apiKey !== config.apiKey || cfg.appId !== config.appId

  return (
    <Section title="Google Drive & condivisione" hint="Il database è un unico file JSON su Google Drive, letto e scritto da tutti i membri. I dati restano anche in cache locale per l’uso offline.">
      {/* stato */}
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white ${mode === 'drive' ? 'bg-inc' : 'bg-muted'}`}><Cloud size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{mode === 'drive' ? 'Collegato a Drive' : 'Modalità demo locale'}</p>
          <p className="truncate text-xs text-muted">
            {mode === 'drive' ? (user?.email || 'Account Google') + (lastSyncAt ? ` · sync ${timeAgo(lastSyncAt)}` : '') : 'I dati sono solo su questo dispositivo'}
          </p>
        </div>
      </div>
      {statusMessage && <p className="rounded-2xl bg-brand/15 px-3 py-2 text-sm text-brand">{statusMessage}</p>}

      {/* configurazione */}
      <button className="text-sm font-semibold text-brand" onClick={() => setShowCfg((s) => !s)}>{showCfg ? 'Nascondi configurazione' : 'Configura credenziali Google'}</button>
      {showCfg && (
        <div>
          <label className="label !mt-0">Google Client ID (OAuth)</label>
          <input className="field" placeholder="123456-abc.apps.googleusercontent.com" value={cfg.clientId} onChange={(e) => setCfg({ ...cfg, clientId: e.target.value })} autoCapitalize="none" autoCorrect="off" />
          <label className="label">API Key (solo per Picker)</label>
          <input className="field" placeholder="AIza…" value={cfg.apiKey} onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} autoCapitalize="none" autoCorrect="off" />
          <label className="label">Numero progetto / App ID (solo per Picker)</label>
          <input className="field" inputMode="numeric" placeholder="123456789012" value={cfg.appId} onChange={(e) => setCfg({ ...cfg, appId: e.target.value })} />
          <button className="glass-btn btn-primary mt-3 w-full" disabled={!dirtyCfg} onClick={() => { app.setConfig(cfg); app.notify('Credenziali salvate') }}>Salva credenziali</button>
        </div>
      )}

      {/* non connesso: si torna alla pagina di accesso */}
      {mode === 'demo' && (
        <button className="glass-btn btn-primary w-full !py-3.5" onClick={() => app.setDemoSkipped(false)}>
          <UserRound size={18} /> Accedi con Google
        </button>
      )}

      {/* connesso */}
      {mode === 'drive' && fileId && (
        <>
          <div>
            <label className="label !mt-0">ID del file database (da dare al partner)</label>
            <div className="flex gap-2">
              <input readOnly className="field font-mono !text-xs" value={fileId} onFocus={(e) => e.currentTarget.select()} />
              <button className="glass-btn !px-3" aria-label="Copia ID" onClick={() => { void navigator.clipboard?.writeText(fileId); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
            <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand" href={`https://drive.google.com/file/d/${fileId}/view`} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Apri su Drive</a>
          </div>

          <div>
            <label className="label"><Mail size={12} className="mr-1 inline" />Invita via email (accesso in scrittura)</label>
            <div className="flex gap-2">
              <input className="field" type="email" inputMode="email" placeholder="partner@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
              <button className="glass-btn btn-primary !px-3" disabled={busy || !email.includes('@')} aria-label="Condividi" onClick={() => void run(async () => { await app.shareWith(email); setEmail(''); setPerms(await drive.listPermissions(fileId)) }, setBusy, app.notify)}><Share2 size={16} /></button>
            </div>
            <p className="mt-1.5 px-1 text-xs text-muted">Il partner dovrà poi aprire l’app, accedere con Google e scegliere “Unisciti a una casa”.</p>
            {perms.length > 0 && (
              <ul className="mt-2 space-y-1 px-1 text-xs text-muted">
                {perms.map((p) => <li key={p.id}>• {p.emailAddress ?? p.displayName ?? 'Link'} — {p.role === 'owner' ? 'proprietario' : p.role === 'writer' ? 'può modificare' : p.role}</li>)}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <button className="glass-btn flex-1" disabled={status === 'syncing'} onClick={() => void (status === 'auth' ? app.reconnect() : app.syncNow())}><RefreshCw size={16} className={status === 'syncing' ? 'animate-spin' : ''} /> {status === 'auth' ? 'Riconnetti' : 'Sync'}</button>
            <button className="glass-btn btn-danger flex-1" onClick={() => app.disconnect()}><LogOut size={16} /> Scollega</button>
          </div>
        </>
      )}
    </Section>
  )
}
