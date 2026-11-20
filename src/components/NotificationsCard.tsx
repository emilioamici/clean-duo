import { useState } from 'react'
import { pushConfigured, pushSupported } from '../services/push'
import { DEFAULT_REMINDER_TIME, validTime } from '../lib/reminders'
import { notifyPrefs } from '../lib/notifications'
import { t } from '../i18n'
import { useApp } from '../store/AppContext'
import { Toggle } from './ui'

/**
 * Notifiche di questo dispositivo: un solo interruttore «Attiva notifiche» (avvisi del telefono e, se il server è
 * configurato, push anche con l'app chiusa). Cosa notificare si sceglie per membro; il promemoria per dispositivo.
 * La campanella dentro l'app c'è sempre.
 */
export function NotificationsCard() {
  const { prefs, setPrefs, me, upsertMember, mode, persistent, enableNotifications, disableNotifications, sendTestPush } = useApp()
  const supported = typeof Notification !== 'undefined'
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const on = (prefs.systemNotif || prefs.pushEnabled) && supported && Notification.permission === 'granted'
  const server = pushConfigured() && pushSupported() && mode === 'drive'
  const err = (e: unknown) => (e instanceof Error ? e.message : String(e))
  const mine = notifyPrefs(me)

  const turnOn = async () => {
    setMsg(null); setBusy(true)
    try {
      const e = await enableNotifications()
      setMsg(e ? { text: t('Notifiche attivate, ma il server delle notifiche non risponde ({e}). Le riceverai finché l\'app è aperta o in background; puoi riprovare dal pulsante qui sotto.', { e }), bad: true } : { text: t('Notifiche attivate su questo dispositivo.') })
    } catch (e) { setMsg({ text: err(e), bad: true }) } finally { setBusy(false) }
  }
  const turnOff = async () => { setMsg(null); setBusy(true); try { await disableNotifications() } finally { setBusy(false) } }
  const retry = async () => {
    setMsg(null); setBusy(true)
    try { const e = await enableNotifications(); setMsg(e ? { text: e, bad: true } : { text: t('Notifiche attive anche con l\'app chiusa.') }) } catch (e) { setMsg({ text: err(e), bad: true }) } finally { setBusy(false) }
  }
  const test = async () => { setMsg(null); setBusy(true); try { await sendTestPush() } catch (e) { setMsg({ text: err(e), bad: true }) } finally { setBusy(false) } }
  const setKind = (k: 'done' | 'task' | 'member', v: boolean) => { if (me) upsertMember({ ...me, notify: { ...mine, [k]: v } }) }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('Nell\'app trovi sempre la campanella. Attivando le notifiche le ricevi anche come avviso del telefono.')}</p>
      {!supported ? (
        <p className="rounded-xl bg-bg p-3 text-sm text-muted">{t('Questo browser non supporta le notifiche di sistema. Su iPhone servono iOS 16.4+ e l\'app aggiunta alla schermata Home.')}</p>
      ) : (
        <>
          <Toggle checked={on} onChange={(v) => void (v ? turnOn() : turnOff())} label={t('Attiva notifiche')} hint={server ? t('Anche con l\'app chiusa') : t('Quando l\'app è aperta o in background')} />
          {on && <button className="glass-btn w-full" disabled={busy} onClick={() => void test()}>{t('Invia una notifica di prova')}</button>}
          {on && server && !prefs.pushEnabled && <button className="glass-btn w-full" disabled={busy} onClick={() => void retry()}>{t('Riprova ad attivarle anche con l\'app chiusa')}</button>}
          {msg && <p className={`text-sm ${msg.bad ? 'text-exp' : 'text-muted'}`}>{msg.text}</p>}
        </>
      )}

      {me && (
        <div className="rounded-2xl border border-line p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('Avvisami quando')}</p>
          <Toggle checked={mine.done} onChange={(v) => setKind('done', v)} label={t('un altro completa un’azione')} />
          <Toggle checked={mine.task} onChange={(v) => setKind('task', v)} label={t('un altro crea una nuova azione')} />
          <Toggle checked={mine.member} onChange={(v) => setKind('member', v)} label={t('entra un nuovo membro in casa')} />
          {!me.email && <p className="mt-1 text-xs text-exp">{t('Aggiungi la tua email al profilo: serve per riceverle anche con l\'app chiusa.')}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-line p-3">
        <Toggle checked={prefs.reminders} onChange={(v) => setPrefs({ reminders: v, lastReminderDay: '' })} label={t('Promemoria delle azioni da fare')} hint={t('Ogni giorno, solo se c’è qualcosa da fare')} />
        {prefs.reminders && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <label htmlFor="reminder-time" className="text-sm font-medium">{t('Orario del promemoria')}</label>
            <input id="reminder-time" type="time" className="field !w-auto" value={prefs.reminderTime}
              onChange={(e) => setPrefs({ reminderTime: validTime(e.target.value) ? e.target.value : DEFAULT_REMINDER_TIME, lastReminderDay: '' })} />
          </div>
        )}
        {prefs.reminders && !server && <p className="mt-2 text-xs text-muted">{t('Senza il server delle notifiche il promemoria arriva solo se l\'app è aperta o in background.')}</p>}
      </div>

      <p className="text-xs text-muted">
        {server ? t('Con l\'app chiusa le notifiche arrivano dal server delle notifiche.') : t('Senza il server delle notifiche il sito non può svegliare il telefono: le notifiche arrivano mentre l\'app è aperta o in background e quelle perse le trovi alla riapertura.')}
        {' '}{persistent ? t('L\'accesso persistente tiene attiva la sessione Google anche in background.') : t('La sessione Google dura 1 ora: con l\'accesso persistente (scheda Sincronizzazione) non serve rinnovarla.')}
      </p>
    </div>
  )
}
