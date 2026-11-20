import { Folder, Loader2, RefreshCw, UserRound, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as drive from '../services/googleDriveService'
import { timeAgo } from '../lib/stats'
import { hasSession } from '../services/broker'
import { clearInvite, pendingInvite } from '../services/invite'
import { t, useLang } from '../i18n'
import { tb } from '../i18n/rich'
import { useApp } from '../store/AppContext'

type Phase = 'login' | 'choose' | 'none' | 'invite'
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Pagina iniziale: «Accedi con Google». Dopo l'accesso la casa viene ritrovata su Drive e collegata
 * in automatico; se non c'è se ne crea una o ci si unisce a quella di un altro con il Picker.
 */
export function Gate({ reconnect = false }: { reconnect?: boolean }) {
  useLang()
  const app = useApp()
  const { config, user, db } = app
  const [phase, setPhase] = useState<Phase>('login')
  const [files, setFiles] = useState<drive.DriveMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [houseName, setHouseName] = useState('La nostra casa')
  const [myName, setMyName] = useState('')
  const [joinId, setJoinId] = useState('')
  const pickerOk = drive.pickerAvailable(config)

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr(msg(e)) } finally { setBusy(false) }
  }

  const started = useRef(false)
  const invite = pendingInvite()
  /** Dopo l'accesso: con un invito si prova ad aprire quel file; se l'app non ha ancora il permesso si chiede un tocco sul Picker. */
  const afterConnect = async (found: drive.DriveMeta[]) => {
    const inv = pendingInvite()
    if (inv) {
      try { await app.joinHouse(inv, false); return } catch (e) {
        if (!(e instanceof drive.NotFoundError)) throw e
        setPhase('invite'); return // serve il permesso sul file: un tocco sul Picker
      }
    }
    if (found.length === 1) await app.joinHouse(found[0].id, false) // una sola casa: collegamento automatico
    else { setFiles(found); setPhase(found.length > 1 ? 'choose' : 'none') }
  }
  const afterLogin = async () => { await afterConnect(await app.connect()) }
  // ritorno dal login di Google (pagina intera): la sessione c'è già, si prosegue da soli
  useEffect(() => {
    if (!reconnect && !started.current && (drive.hasValidToken() || hasSession())) { started.current = true; void guard(afterLogin) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = () => guard(async () => {
    if (reconnect) { await app.reconnect(); return }
    await afterConnect(await app.connect())
  })

  const search = () => guard(async () => { await afterConnect(await drive.findDbFiles()) })

  return (
    <div className="flex min-h-full flex-col justify-center px-1 py-10">
      <div className="mb-8 text-center">
        <img src={import.meta.env.BASE_URL + 'app-icon.png'} alt="" draggable={false} className="mx-auto mb-4 h-32 w-32 rounded-[28%] shadow-[0_12px_30px_-10px_rgb(var(--glass-shade))]" />
        <h1 className="text-3xl font-extrabold tracking-tight">Clean<span className="text-brand">Duo</span></h1>
        <p className="mt-2 text-sm text-muted">{t('Le faccende di casa, a punti. Sincronizzate nel tuo Google Drive.')}</p>
      </div>

      <div className="glass-strong space-y-4 p-5">
        {err && <p className="rounded-xl bg-exp/10 p-3 text-sm text-exp">{err}</p>}

        {phase === 'login' && reconnect && (
          <>
            <h2 className="text-lg font-bold">{t('Sessione Google scaduta')}</h2>
            <p className="text-sm text-muted">{user?.email ? tb('Per continuare a sincronizzare accedi di nuovo come <b>{email}</b>. I dati della casa sono al sicuro su Drive.', { email: user.email }) : t('Per continuare a sincronizzare accedi di nuovo. I dati della casa sono al sicuro su Drive.')}</p>
          </>
        )}
        {phase === 'login' && !reconnect && invite && (
          <p className="rounded-xl bg-brand/10 p-3 text-sm font-semibold text-brand">{t('Hai un invito per una casa: accedi con Google per entrare.')}</p>
        )}
        {phase === 'login' && !reconnect && (
          <p className="text-sm text-muted">{tb('Accedi con il <b>tuo account Google</b>. Se la tua casa è già su Drive la ritrovo io; altrimenti puoi crearne una nuova.')}</p>
        )}

        {phase === 'login' && (
          <>
            {!config.clientId && (
              <div className="rounded-xl bg-brand/10 p-3 text-sm">
                <p className="mb-2">{t('Manca il Client ID OAuth di Google Cloud (vedi README).')}</p>
                <input className="field" placeholder="xxxx.apps.googleusercontent.com" autoCapitalize="none" autoCorrect="off"
                  onBlur={(e) => app.setConfig({ ...config, clientId: e.target.value })} />
              </div>
            )}
            <button className="glass-btn btn-primary w-full !py-3" disabled={busy || !config.clientId} onClick={() => void login()}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <UserRound size={18} />}{t('Accedi con Google')}
            </button>
            {reconnect ? (
              <>
                <button className="glass-btn w-full !text-xs" disabled={busy} onClick={() => app.setOfflineSkipped(true)}>{t('Continua senza sincronizzare')}</button>
                <button className="glass-btn w-full !text-xs" disabled={busy} onClick={() => app.disconnect()}>{t('Scollega questa casa')}</button>
              </>
            ) : (
              <button className="glass-btn w-full !text-xs" disabled={busy} onClick={() => app.setDemoSkipped(true)}>{t('Prova senza accedere (demo)')}</button>
            )}
          </>
        )}

        {phase === 'invite' && invite && (
          <>
            <h2 className="text-lg font-bold">{t('Ti hanno invitato in una casa')}</h2>
            <p className="text-sm text-muted">{t('Per entrare tocca il pulsante e scegli il file della casa: serve a dare a Clean Duo il permesso di aprirlo. Si fa una volta sola.')}</p>
            <button className="glass-btn btn-primary w-full !py-3" disabled={busy} onClick={() => void guard(() => app.joinHouse(invite, true))}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Folder size={18} />}{t('Scegli il file e unisciti')}
            </button>
            <p className="text-xs text-muted">{t('Se compare «Can’t access your Google Account», in Safari consenti i cookie per questo sito oppure accedi con l’accesso persistente e riprova.')}</p>
            <button className="glass-btn w-full !text-xs" disabled={busy} onClick={() => { clearInvite(); setPhase('none') }}>{t('Non è il mio invito: crea o cerca un’altra casa')}</button>
          </>
        )}

        {phase === 'choose' && (
          <>
            <p className="text-sm text-muted">{t('Hai accesso a più case. Quale vuoi aprire?')}</p>
            <div className="space-y-2">
              {files.map((f) => (
                <button key={f.id} disabled={busy} onClick={() => void guard(() => app.joinHouse(f.id, false))} className="w-full rounded-xl border border-line p-3 text-left text-sm hover:bg-line/40">
                  <p className="font-semibold">{f.name}</p>
                  <p className="text-xs text-muted">{t('aggiornato {when}', { when: timeAgo(new Date(f.modifiedTime).getTime()) })}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === 'none' && (
          <>
            <p className="text-sm">{tb('Nessuna casa trovata per <b>{email}</b>.', { email: user?.email ?? t('questo account') })}</p>

            <div className="space-y-3 rounded-2xl border border-line p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><Users size={16} className="text-brand" />{t('Crea la tua casa')}</p>
              <p className="text-xs text-muted">{t('Il database sarà un file nel tuo Drive. Poi inviti gli altri dalle Impostazioni.')}</p>
              <input className="field" placeholder={t('Nome della casa')} value={houseName} onChange={(e) => setHouseName(e.target.value)} />
              <input className="field" placeholder={t('Il tuo nome ({name})', { name: user?.name.split(' ')[0] || t('Io') })} value={myName} onChange={(e) => setMyName(e.target.value)} />
              <button className="glass-btn btn-primary w-full" disabled={busy || !houseName.trim()} onClick={() => void guard(() => app.createHouse(houseName.trim(), false, myName))}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}{t('Crea casa')}
              </button>
              {db.tasks.length > 0 && (
                <button className="glass-btn w-full !text-xs" disabled={busy || !houseName.trim()} onClick={() => void guard(() => app.createHouse(houseName.trim(), true, myName))}>{t('Crea partendo dai dati demo')}</button>
              )}
            </div>

            <div className="space-y-2 rounded-2xl border border-line p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><Folder size={16} className="text-brand" />{t('Hai ricevuto un invito?')}</p>
              {pickerOk ? (
                <>
                  <p className="text-xs text-muted">{t('Chi ha creato la casa ha condiviso il database con te: scegli quel file su Drive (in «Condivisi con me»). Si fa una volta sola.')}</p>
                  <button className="glass-btn btn-primary w-full" disabled={busy} onClick={() => void guard(() => app.joinHouse(null, true))}>
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <Folder size={18} />}{t('Scegli il database della casa')}
                  </button>
                </>
              ) : (
                <p className="text-xs text-muted">{t('Per aprire il file di un altro serve il Google Picker: imposta API Key e App ID (README). In alternativa incolla l’ID qui sotto.')}</p>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">{t('Ho il link o l’ID del file')}</summary>
                <div className="mt-2 flex gap-2">
                  <input className="field" placeholder={t('Link o ID del file Drive')} value={joinId} onChange={(e) => setJoinId(e.target.value)} autoCapitalize="none" autoCorrect="off" />
                  <button className="glass-btn btn-primary" disabled={busy || !joinId.trim()} onClick={() => void guard(() => app.joinHouse(joinId, false))}>{t('Collega')}</button>
                </div>
              </details>
            </div>

            <p className="rounded-xl bg-brand/10 p-3 text-sm text-muted">
              {tb('Aspetti un invito? Chiedi di aggiungere <b>{email}</b>, poi', { email: user?.email ?? t('la tua email') })}
              <button className="ml-1 inline-flex items-center gap-1 font-semibold text-brand" disabled={busy} onClick={() => void search()}><RefreshCw size={14} />{t('cerca di nuovo')}</button>.
            </p>
          </>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-muted">{t('I dati restano nel tuo Google Drive e su questo dispositivo: nessun server di terze parti per i dati.')}</p>
    </div>
  )
}
