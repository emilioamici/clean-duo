import { BellRing, Zap, Check, Cloud, Copy, Database, ExternalLink, LogOut, Mail, Minus, Palette, Pencil, Plus, RefreshCw, RotateCcw, Share2, ShieldCheck, UserPlus, UserRound, Users } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import * as drive from '../services/googleDriveService'
import { brokerAvailable } from '../services/broker'
import { pushConfigured } from '../services/push'
import { inviteLink } from '../services/invite'
import { THEME_NAME } from '../lib/theme'
import { timeAgo } from '../lib/stats'
import { LANG_NAME, getLangPref, t, useLang } from '../i18n'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { NotificationBell, SyncPill } from './Chrome'
import { AppearanceCard } from './AppearanceCard'
import { MascotPeek } from './Mascots'
import { NotificationsCard } from './NotificationsCard'
import { AutomationsCard } from './AutomationsCard'
import { Accordion, Avatar, PageHeader } from './ui'

type SectionId = 'look' | 'house' | 'members' | 'drive' | 'notif' | 'auto' | 'data'
const OPEN_KEY = 'cleanduo:settingsOpen'
const loadOpen = (): Partial<Record<SectionId, boolean>> => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') } catch { return {} } }

function CommitInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input {...rest} className="field" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />
}

async function run(fn: () => Promise<unknown>, setBusy: (b: boolean) => void, notify: (m: string) => void) {
  setBusy(true)
  try { await fn() } catch (e) { notify(e instanceof Error ? e.message : t('Operazione non riuscita')) } finally { setBusy(false) }
}

const Box = ({ children }: { children: ReactNode }) => <div className="rounded-2xl border border-line bg-bg/60 p-3">{children}</div>

export function SettingsView() {
  useLang()
  const app = useApp()
  const { db, mode, user, me, status, prefs } = app
  const { openMemberSheet } = useUi()
  const [open, setOpen] = useState(loadOpen)
  const flip = (k: SectionId) => setOpen((o) => { const n = { ...o, [k]: !o[k] }; try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)) } catch { /* noop */ } return n })
  const notifOn = prefs.systemNotif || prefs.pushEnabled
  const syncLabel = { demo: t('Demo locale'), idle: t('Sincronizzato'), syncing: t('Sync…'), offline: t('Offline'), auth: t('Riconnetti'), error: t('Errore') }[status]

  return (
    <div>
      <PageHeader title={t('Impostazioni')} subtitle={t('Casa, membri e sincronizzazione')} right={<><SyncPill /><NotificationBell /></>} />

      <div className="space-y-3">
        <MascotPeek kind="pair">
          <Accordion title={t('Aspetto')} icon={<Palette size={20} />} open={!!open.look} onToggle={() => flip('look')} summary={`${t(THEME_NAME[app.theme])} · ${getLangPref() === 'auto' ? t('Automatico') : LANG_NAME[getLangPref()]}`}>
            <AppearanceCard />
          </Accordion>
        </MascotPeek>

        <Accordion title={t('Casa e obiettivi')} icon={<Users size={20} />} open={!!open.house} onToggle={() => flip('house')} summary={`${db.houseName} · ${t('{n} ⭐/sett.', { n: db.settings.weeklyGoal })}`}>
          <div className="space-y-3">
            <div>
              <label className="label !mt-0">{t('Nome della casa')}</label>
              <CommitInput value={db.houseName} onCommit={(v) => app.updateSettings({ houseName: v.trim() || db.houseName })} />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-line bg-bg/60 px-4 py-2">
              <span className="font-medium">{t('Obiettivo a testa: {n} ⭐/sett.', { n: db.settings.weeklyGoal })}</span>
              <span className="flex gap-2">
                <button className="glass-btn !p-2" aria-label="-" onClick={() => app.updateSettings({ weeklyGoal: Math.max(1, db.settings.weeklyGoal - 1) })}><Minus size={16} /></button>
                <button className="glass-btn !p-2" aria-label="+" onClick={() => app.updateSettings({ weeklyGoal: db.settings.weeklyGoal + 1 })}><Plus size={16} /></button>
              </span>
            </div>
            <div className="flex gap-2">
              <div className="w-16"><CommitInput value={db.settings.prizeEmoji} onCommit={(v) => app.updateSettings({ prizeEmoji: v })} aria-label={t('Emoji premio')} style={{ textAlign: 'center' }} /></div>
              <div className="flex-1"><CommitInput value={db.settings.prize} placeholder={t('Premio del mese per il vincitore')} onCommit={(v) => app.updateSettings({ prize: v })} /></div>
            </div>
          </div>
        </Accordion>

        <Accordion title={t('Membri della casa')} icon={<UserRound size={20} />} open={!!open.members} onToggle={() => flip('members')} summary={db.members.length === 1 ? t('1 membro') : t('{n} membri', { n: db.members.length })}>
          <div className="space-y-3">
            {db.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <Avatar member={m} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{m.name}</p>
                  <p className="truncate text-xs text-muted">{m.email || t('nessuna email')}</p>
                </div>
                <button className={`chip ${me?.id === m.id ? 'chip-active' : ''}`} onClick={() => app.setMeId(m.id)}>{me?.id === m.id ? <><Check size={14} /> {t('Io')}</> : t('Sono io')}</button>
                <button className="glass-btn !p-2" onClick={() => openMemberSheet({ id: m.id })} aria-label={t('Modifica {name}', { name: m.name })}><Pencil size={15} /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <button className="glass-btn flex-1" onClick={() => openMemberSheet({})}><Plus size={16} /> {t('Aggiungi membro')}</button>
              {mode === 'drive' && user && !db.members.some((m) => m.email?.toLowerCase() === user.email.toLowerCase()) && (
                <button className="glass-btn btn-primary flex-1" onClick={() => { const id = app.upsertMember({ name: user.name.split(' ')[0] || t('Io'), email: user.email, avatar: '🐙', color: '#c0506a' }); app.setMeId(id) }}>
                  <UserPlus size={16} /> {t('Aggiungi me')}
                </button>
              )}
            </div>
            {!me && <p className="text-xs text-muted">{t('Scegli «Sono io» per attribuirti le stelle.')}</p>}
          </div>
        </Accordion>

        <Accordion title={t('Sincronizzazione e account')} icon={<Cloud size={20} />} open={!!open.drive} onToggle={() => flip('drive')} summary={`${syncLabel}${user?.email ? ` · ${user.email}` : ''}`}>
          <DriveSection />
        </Accordion>

        <Accordion title={t('Notifiche')} icon={<BellRing size={20} />} open={!!open.notif} onToggle={() => flip('notif')} summary={notifOn ? t('Attive su questo dispositivo') : t('Disattivate (solo la campanella)')}>
          <NotificationsCard />
        </Accordion>

        <Accordion title={t('Automazioni')} icon={<Zap size={20} />} open={!!open.auto} onToggle={() => flip('auto')}
          summary={(db.automations?.length ?? 0) > 0 ? t('{n} dispositivi collegati', { n: db.automations!.length }) : t('Collega i dispositivi di casa')}>
          <AutomationsCard />
        </Accordion>

        <Accordion title={t('Dati')} icon={<Database size={20} />} open={!!open.data} onToggle={() => flip('data')} summary={t('{a} azioni · {b} stanze', { a: db.tasks.length, b: db.rooms.length })}>
          <button className="glass-btn w-full" onClick={() => { if (confirm(mode === 'drive' ? t('Ripristinare i dati demo scollega la casa da Drive (il file su Drive resta intatto). Continuare?') : t('Ripristinare i dati demo? Le modifiche locali andranno perse.'))) app.resetDemo() }}>
            <RotateCcw size={16} /> {t('Ripristina dati demo')}
          </button>
        </Accordion>

        <p className="flex gap-2 px-1 pb-4 text-xs text-muted"><ShieldCheck size={16} className="shrink-0" />{t('I dati restano nel tuo Google Drive e su questo dispositivo: nessun server di terze parti per i dati.')} · Clean Duo v1.1 · <a className="font-semibold text-brand" href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">{t('Privacy')}</a></p>
      </div>
    </div>
  )
}

function DriveSection() {
  const app = useApp()
  const { mode, fileId, user, config, status, statusMessage, lastSyncAt, persistent } = app
  const [cfg, setCfg] = useState(config)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [perms, setPerms] = useState<drive.DrivePermission[]>([])
  const [copied, setCopied] = useState(false)
  const [showCfg, setShowCfg] = useState(false)
  const [broker, setBroker] = useState(false)
  useEffect(() => { void brokerAvailable().then(setBroker) }, [])

  useEffect(() => {
    if (mode !== 'drive' || !fileId || status !== 'idle') return
    drive.listPermissions(fileId).then(setPerms).catch(() => setPerms([]))
  }, [mode, fileId, status, app.lastSyncAt])

  const dirtyCfg = cfg.clientId !== config.clientId || cfg.apiKey !== config.apiKey || cfg.appId !== config.appId

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${mode === 'drive' ? 'bg-inc/15 text-inc' : 'bg-line text-muted'}`}><Cloud size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{mode === 'drive' ? t('Collegato a Drive') : t('Modalità demo locale')}</p>
          <p className="truncate text-xs text-muted">
            {mode === 'drive' ? (user?.email || t('Account Google')) + (lastSyncAt ? ` · ${t('sync {when}', { when: timeAgo(lastSyncAt) })}` : '') : t('I dati sono solo su questo dispositivo')}
          </p>
        </div>
      </div>
      {statusMessage && <p className="rounded-2xl bg-brand/15 px-3 py-2 text-sm text-brand">{statusMessage}</p>}

      {persistent ? (
        <p className="flex items-start gap-2 rounded-xl bg-inc/10 p-3 text-sm text-inc"><ShieldCheck size={16} className="mt-0.5 shrink-0" />{t('Accesso persistente attivo: la sessione Google si rinnova da sola, anche in background.')}</p>
      ) : broker && mode === 'drive' ? (
        <button className="glass-btn w-full" disabled={busy} onClick={() => void run(() => app.reconnect(), setBusy, app.notify)}><ShieldCheck size={18} />{t('Attiva l\'accesso persistente')}</button>
      ) : null}

      <button className="text-sm font-semibold text-brand" onClick={() => setShowCfg((s) => !s)}>{showCfg ? t('Nascondi configurazione') : t('Configura credenziali Google')}</button>
      {showCfg && (
        <div>
          <label className="label !mt-0">{t('Google Client ID (OAuth)')}</label>
          <input className="field" placeholder="123456-abc.apps.googleusercontent.com" value={cfg.clientId} onChange={(e) => setCfg({ ...cfg, clientId: e.target.value })} autoCapitalize="none" autoCorrect="off" />
          <label className="label">{t('API Key (solo per Picker)')}</label>
          <input className="field" placeholder="AIza…" value={cfg.apiKey} onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} autoCapitalize="none" autoCorrect="off" />
          <label className="label">{t('Numero progetto / App ID (solo per Picker)')}</label>
          <input className="field" inputMode="numeric" placeholder="123456789012" value={cfg.appId} onChange={(e) => setCfg({ ...cfg, appId: e.target.value })} />
          <button className="glass-btn btn-primary mt-3 w-full" disabled={!dirtyCfg} onClick={() => { app.setConfig(cfg); app.notify(t('Credenziali salvate')) }}>{t('Salva credenziali')}</button>
          {pushConfigured() ? null : <p className="mt-2 text-xs text-muted">{t('Server delle notifiche e dell\'accesso persistente non configurato (vedi README).')}</p>}
        </div>
      )}

      {mode === 'demo' && (
        <button className="glass-btn btn-primary w-full !py-3.5" onClick={() => app.setDemoSkipped(false)}>
          <UserRound size={18} /> {t('Accedi con Google')}
        </button>
      )}

      {mode === 'drive' && fileId && (
        <>
          <Box>
            <label className="label !mt-0">{t('ID del file database (da dare al partner)')}</label>
            <div className="flex gap-2">
              <input readOnly className="field font-mono !text-xs" value={fileId} onFocus={(e) => e.currentTarget.select()} />
              <button className="glass-btn !px-3" aria-label={t('Copia ID')} onClick={() => { void navigator.clipboard?.writeText(fileId); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
            <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand" href={`https://drive.google.com/file/d/${fileId}/view`} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {t('Apri su Drive')}</a>
          </Box>

          <Box>
            <label className="label !mt-0"><Mail size={12} className="mr-1 inline" />{t('Invita via email (accesso in scrittura)')}</label>
            <div className="flex gap-2">
              <input className="field" type="email" inputMode="email" placeholder="partner@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
              <button className="glass-btn btn-primary !px-3" disabled={busy || !email.includes('@')} aria-label={t('Condividi')} onClick={() => void run(async () => { await app.shareWith(email); setEmail(''); setPerms(await drive.listPermissions(fileId)) }, setBusy, app.notify)}><Share2 size={16} /></button>
            </div>
            <p className="mt-1.5 px-1 text-xs text-muted">{t('Poi manda alla persona questo link: dopo l’accesso con Google le basta un tocco per entrare, senza ID da incollare.')}</p>
            <div className="mt-2 flex gap-2">
              <input readOnly className="field !text-xs" value={inviteLink(fileId)} onFocus={(e) => e.currentTarget.select()} aria-label={t('Link d\'invito')} />
              <button className="glass-btn !px-3" aria-label={t('Copia il link d\'invito')} onClick={() => {
                const url = inviteLink(fileId)
                if (navigator.share) void navigator.share({ title: 'Clean Duo', text: t('Ti invito in casa su Clean Duo'), url }).catch(() => undefined)
                else { void navigator.clipboard?.writeText(url); app.notify(t('Link copiato')) }
              }}><Share2 size={16} /></button>
            </div>
            {perms.length > 0 && (
              <ul className="mt-2 space-y-1 px-1 text-xs text-muted">
                {perms.map((p) => <li key={p.id}>• {p.emailAddress ?? p.displayName ?? t('Link')} — {p.role === 'owner' ? t('proprietario') : p.role === 'writer' ? t('può modificare') : p.role}</li>)}
              </ul>
            )}
          </Box>

          <div className="flex gap-2">
            <button className="glass-btn flex-1" disabled={status === 'syncing'} onClick={() => void (status === 'auth' ? app.reconnect() : app.syncNow())}><RefreshCw size={16} className={status === 'syncing' ? 'animate-spin' : ''} /> {status === 'auth' ? t('Riconnetti') : t('Sync')}</button>
            <button className="glass-btn btn-danger flex-1" onClick={() => app.disconnect()}><LogOut size={16} /> {persistent ? t('Esci') : t('Scollega')}</button>
          </div>
        </>
      )}
    </div>
  )
}
