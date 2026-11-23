import { BellRing, Zap, Cloud, CloudOff, Database, LogOut, Palette, RefreshCw, RotateCcw, ShieldCheck, UserRound, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { brokerAvailable } from '../services/broker'
import { pushConfigured } from '../services/push'
import { THEME_NAME } from '../lib/theme'
import { timeAgo } from '../lib/stats'
import { LANG_NAME, getLangPref, t, useLang } from '../i18n'
import { useApp } from '../store/AppContext'
import { NotificationBell, SyncPill } from './Chrome'
import { AppearanceCard } from './AppearanceCard'
import { MascotPeek } from './Mascots'
import { FamilyCard } from './FamilyCard'
import { NotificationsCard } from './NotificationsCard'
import { AutomationsCard } from './AutomationsCard'
import { Accordion, PageHeader } from './ui'

type SectionId = 'look' | 'house' | 'drive' | 'notif' | 'auto' | 'data'
const OPEN_KEY = 'cleanduo:settingsOpen'
const loadOpen = (): Partial<Record<SectionId, boolean>> => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') } catch { return {} } }

async function run(fn: () => Promise<unknown>, setBusy: (b: boolean) => void, notify: (m: string) => void) {
  setBusy(true)
  try { await fn() } catch (e) { notify(e instanceof Error ? e.message : t('Operazione non riuscita')) } finally { setBusy(false) }
}

export function SettingsView() {
  useLang()
  const app = useApp()
  const { db, mode, user, status, prefs } = app
  const [open, setOpen] = useState(loadOpen)
  const flip = (k: SectionId) => setOpen((o) => { const n = { ...o, [k]: !o[k] }; try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)) } catch { /* noop */ } return n })
  const notifOn = prefs.systemNotif || prefs.pushEnabled
  const syncLabel = { demo: t('Demo locale'), idle: t('Sincronizzato'), syncing: t('Sync…'), offline: t('Offline'), auth: t('Riconnetti'), error: t('Errore') }[status]

  return (
    <div>
      <PageHeader
        title={t('Impostazioni')}
        subtitle={t('Casa, membri e sincronizzazione')}
        right={
          <div className="flex md:hidden items-center gap-2">
            <SyncPill /><NotificationBell />
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <MascotPeek kind="pair">
            <Accordion title={t('Aspetto')} icon={<Palette size={20} />} open={!!open.look} onToggle={() => flip('look')} summary={`${t(THEME_NAME[app.theme])} · ${getLangPref() === 'auto' ? t('Automatico') : LANG_NAME[getLangPref()]}`}>
              <AppearanceCard />
            </Accordion>
          </MascotPeek>

          <Accordion title={t('Casa e membri')} icon={<Users size={20} />} open={!!open.house} onToggle={() => flip('house')} summary={`${db.houseName} · ${db.members.length === 1 ? t('1 membro') : t('{n} membri', { n: db.members.length })}`}>
            <FamilyCard />
          </Accordion>

          <Accordion title={t('Notifiche')} icon={<BellRing size={20} />} open={!!open.notif} onToggle={() => flip('notif')} summary={notifOn ? t('Attive su questo dispositivo') : t('Disattivate (solo la campanella)')}>
            <NotificationsCard />
          </Accordion>
        </div>

        <div className="space-y-4">
          <Accordion title={t('Sincronizzazione e account')} icon={<Cloud size={20} />} open={!!open.drive} onToggle={() => flip('drive')} summary={`${syncLabel}${user?.email ? ` · ${user.email}` : ''}`}>
            <DriveSection />
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
        </div>
      </div>

      <p className="mt-6 flex gap-2 px-1 pb-4 text-xs text-muted"><ShieldCheck size={16} className="shrink-0" />{t('I dati restano nel tuo Google Drive e su questo dispositivo. Il server della casa (il tuo Cloudflare Worker) li fa solo transitare per gli invitati e non li conserva.')} · Clean Duo v1.1 · <a className="font-semibold text-brand" href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">{t('Privacy')}</a></p>
    </div>
  )
}

function DriveSection() {
  const app = useApp()
  const { mode, fileId, user, config, status, statusMessage, lastSyncAt, persistent } = app
  const [cfg, setCfg] = useState(config)
  const [busy, setBusy] = useState(false)
  const [showCfg, setShowCfg] = useState(!config.clientId)
  const [broker, setBroker] = useState(false)
  useEffect(() => { void brokerAvailable().then(setBroker) }, [])
  const dirtyCfg = cfg.clientId !== config.clientId || cfg.apiKey !== config.apiKey || cfg.appId !== config.appId
  const label = { demo: t('Demo locale'), idle: t('Sincronizzato'), syncing: t('Sincronizzazione…'), offline: t('Offline'), auth: t('Riconnessione necessaria'), error: t('Errore') }[status]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${status === 'idle' ? 'bg-inc/15 text-inc' : 'bg-line text-muted'}`}>{status === 'offline' ? <CloudOff size={22} /> : <Cloud size={22} />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t('Sincronizzazione Google Drive')}</p>
          <p className="truncate text-xs text-muted">{label}{lastSyncAt && status === 'idle' ? ` · ${timeAgo(lastSyncAt)}` : ''}</p>
        </div>
      </div>
      {mode === 'drive' && user?.email && <p className="flex items-center gap-2 text-sm text-muted"><UserRound size={15} />{user.email}</p>}
      {mode === 'demo' && <p className="text-sm text-muted">{t('I dati sono solo su questo dispositivo')}</p>}
      {statusMessage && <p className="rounded-2xl bg-brand/15 px-3 py-2 text-sm text-brand">{statusMessage}</p>}

      {persistent ? (
        <p className="flex items-start gap-2 rounded-xl bg-inc/10 p-3 text-sm text-inc"><ShieldCheck size={16} className="mt-0.5 shrink-0" />{t('Accesso persistente attivo: la sessione Google si rinnova da sola, anche in background.')}</p>
      ) : broker && mode === 'drive' ? (
        <button className="glass-btn w-full" disabled={busy} onClick={() => void run(() => app.reconnect(), setBusy, app.notify)}><ShieldCheck size={18} />{t('Attiva l\'accesso persistente')}</button>
      ) : null}

      {mode === 'demo' ? (
        <button className="glass-btn btn-primary w-full !py-3.5" onClick={() => app.setDemoSkipped(false)}>
          <UserRound size={18} /> {t('Accedi con Google')}
        </button>
      ) : status === 'auth' ? (
        <button className="glass-btn btn-primary w-full" disabled={busy} onClick={() => void run(() => app.reconnect(), setBusy, app.notify)}>{t('Riconnetti Google Drive')}</button>
      ) : (
        <button className="glass-btn w-full" disabled={status === 'syncing' || !fileId} onClick={() => void app.syncNow()}><RefreshCw size={16} className={status === 'syncing' ? 'animate-spin' : ''} /> {t('Sincronizza ora')}</button>
      )}

      {mode === 'drive' && (
        <div className="flex gap-2 border-t border-line/70 pt-3">
          <button className="glass-btn flex-1 !text-xs" disabled={busy} onClick={() => void run(() => app.reconnect(), setBusy, app.notify)}><UserRound size={16} />{t('Cambia account')}</button>
          <button className="glass-btn btn-danger flex-1 !text-xs" onClick={() => app.disconnect()}><LogOut size={16} />{persistent ? t('Esci') : t('Scollega')}</button>
        </div>
      )}

      <button className="text-xs font-semibold text-brand" onClick={() => setShowCfg((v) => !v)}>{showCfg ? t('Nascondi configurazione') : t('Configura credenziali Google')}</button>
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
    </div>
  )
}
