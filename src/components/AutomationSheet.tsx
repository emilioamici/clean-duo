import { Check, CheckCircle2, CircleAlert, Copy, Loader2, Plug, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { describeCondition, OP_LABEL } from '../lib/automations'
import { uid } from '../lib/clean'
import { timeAgo } from '../lib/stats'
import { t } from '../i18n'
import { cycleHookUrl, pushConfigured, shortcutUrl, tuyaStatus, type TuyaCondition, type TuyaDeviceInfo } from '../services/push'
import * as drive from '../services/googleDriveService'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import type { Automation } from '../types'
import { RoomIcon } from './icons'
import { Sheet, Toggle } from './ui'

const OPS: Automation['op'][] = ['eq', 'ne', 'lt', 'gt', 'bit', 'contains']
const show = (v: unknown): string => (Array.isArray(v) ? v.join(',') : String(v))

function AutomationForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const app = useApp()
  const { db } = app
  const existing = (db.automations ?? []).find((a) => a.id === id)
  const existingTask = existing ? db.tasks.find((x) => x.id === existing.taskId) : undefined

  const [name, setName] = useState(existing?.name ?? t('Distributore crocchette'))
  const [deviceId, setDeviceId] = useState(existing?.deviceId ?? '')
  const [code, setCode] = useState(existing?.code ?? '')
  const [op, setOp] = useState<Automation['op']>(existing?.op ?? 'eq')
  const [value, setValue] = useState(existing?.value ?? '')
  const [enabled, setEnabled] = useState(existing?.enabled ?? true)
  const [useExisting, setUseExisting] = useState(!!existing)
  const [taskId, setTaskId] = useState(existing?.taskId ?? db.tasks.find((x) => !x.onEvent && !x.afterTaskId)?.id ?? '')
  const [newName, setNewName] = useState(t('Riempire il distributore'))
  const [roomId, setRoomId] = useState(db.rooms[0]?.id ?? '')
  const [info, setInfo] = useState<TuyaDeviceInfo | null>(null)
  const [check, setCheck] = useState<{ matched: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const server = pushConfigured() && app.mode === 'drive'
  const cond = (): TuyaCondition => ({ code: code.trim(), op, value: value.trim() })
  const token = () => drive.currentToken()

  const read = async (withCondition: boolean) => {
    setErr(''); setBusy(true)
    try {
      const tk = token(); const fid = app.fileId
      if (!tk || !fid) throw new Error(t('Accedi con Google per leggere il dispositivo.'))
      const r = await tuyaStatus(fid, tk, deviceId.trim(), withCondition && code.trim() && value.trim() ? cond() : undefined)
      setInfo(r)
      setCheck(r.matched === undefined ? null : { matched: r.matched })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setInfo(null); setCheck(null) } finally { setBusy(false) }
  }

  const pick = (c: string, v: unknown) => {
    setCode(c); setCheck(null)
    setOp(typeof v === 'number' ? 'lt' : 'eq')
    setValue(show(v))
  }

  const valid = name.trim() && deviceId.trim().length >= 8 && code.trim() && value.trim() && (useExisting ? !!taskId : !!newName.trim() && !!roomId)

  const save = async () => {
    setErr(''); setBusy(true)
    try {
      let target = taskId
      if (!useExisting) {
        target = uid('t')
        // l'azione nasce «in attesa»: va tra le cose da fare solo quando il dispositivo lo segnala
        app.upsertTask({ id: target, roomId, name: newName.trim(), stars: 2, assignment: { mode: 'anyone' }, recurrence: { type: 'daily', every: 1 }, icon: 'utensils' })
      }
      const e = await app.saveAutomation({ id: existing?.id ?? uid('a'), kind: 'tuya', name: name.trim(), deviceId: deviceId.trim(), code: code.trim(), op, value: value.trim(), taskId: target, enabled })
      if (e) { setErr(e); return }
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <div>
      {!server && <p className="mb-2 rounded-xl bg-brand/15 p-3 text-sm text-brand">{t('Per collegare un dispositivo serve una casa su Drive e il server delle notifiche (vedi README).')}</p>}

      <label className="label !mt-0">{t('Nome')}</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="label">{t('ID del dispositivo Tuya')}</label>
      <div className="flex gap-2">
        <input className="field font-mono !text-xs" placeholder="bf1234567890abcdef" value={deviceId} onChange={(e) => { setDeviceId(e.target.value); setInfo(null) }} autoCapitalize="none" autoCorrect="off" />
        <button type="button" className="glass-btn" disabled={busy || !server || deviceId.trim().length < 8} onClick={() => void read(false)}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}{t('Leggi')}
        </button>
      </div>
      <p className="mt-1 px-1 text-xs text-muted">{t('Lo trovi su Tuya IoT Platform → il tuo progetto → Devices. «Leggi» mostra i dati veri del dispositivo.')}</p>
      {err && <p className="mt-2 rounded-xl bg-exp/10 p-3 text-sm text-exp">{err}</p>}

      {info && (
        <div className="mt-3 rounded-2xl border border-line bg-bg/60 p-3">
          <p className="flex items-center gap-2 text-sm font-bold">
            {info.online ? <CheckCircle2 size={16} className="text-inc" /> : <CircleAlert size={16} className="text-exp" />}
            {info.name} <span className="text-xs font-normal text-muted">· {info.online ? t('online') : t('non raggiungibile')}</span>
          </p>
          <p className="mb-2 mt-2 text-xs text-muted">{t('Tocca il dato che segnala «crocchette in esaurimento» (cambia mentre il serbatoio si svuota).')}</p>
          <ul className="max-h-48 divide-y divide-line/60 overflow-y-auto">
            {info.status.map((s) => (
              <li key={s.code}>
                <button type="button" className={`flex w-full items-center justify-between gap-3 py-2 text-left text-sm ${code === s.code ? 'font-bold text-brand' : ''}`} onClick={() => pick(s.code, s.value)}>
                  <span className="truncate font-mono text-xs">{s.code}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">{show(s.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="label">{t('Quando')}</label>
      <div className="rounded-2xl border border-line bg-bg/60 p-3">
        <input className="field font-mono !text-xs" placeholder={t('codice del dato (es. fault)')} value={code} onChange={(e) => { setCode(e.target.value); setCheck(null) }} autoCapitalize="none" autoCorrect="off" />
        <div className="mt-2 flex gap-2">
          <select className="field !w-auto" value={op} onChange={(e) => { setOp(e.target.value as Automation['op']); setCheck(null) }} aria-label={t('Condizione')}>
            {OPS.map((o) => <option key={o} value={o}>{OP_LABEL[o]()}</option>)}
          </select>
          <input className="field" placeholder={op === 'bit' ? t('numero del bit (0, 1, 2…)') : t('valore')} value={value} onChange={(e) => { setValue(e.target.value); setCheck(null) }} autoCapitalize="none" autoCorrect="off" />
        </div>
        {op === 'bit' && <p className="mt-1.5 text-xs text-muted">{t('Per i dati a bit (es. «fault»): il numero del bit che indica «cibo in esaurimento» dipende dal modello.')}</p>}
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className="glass-btn !text-xs" disabled={busy || !server || !deviceId.trim() || !code.trim() || !value.trim()} onClick={() => void read(true)}>{t('Verifica ora')}</button>
          {check && <span className={`text-sm font-semibold ${check.matched ? 'text-brand' : 'text-muted'}`}>{check.matched ? t('Soddisfatta adesso') : t('Non soddisfatta adesso')}</span>}
        </div>
      </div>

      <label className="label">{t('Allora metti tra le cose da fare')}</label>
      <div className="rounded-2xl border border-line bg-bg/60 p-3">
        <div className="flex gap-2">
          <button type="button" className={`chip ${!useExisting ? 'chip-active' : ''}`} onClick={() => setUseExisting(false)}>{t('Nuova azione')}</button>
          <button type="button" className={`chip ${useExisting ? 'chip-active' : ''}`} onClick={() => setUseExisting(true)}>{t('Azione esistente')}</button>
        </div>
        {useExisting ? (
          <select className="field mt-2" value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label={t('Azione')}>
            {existingTask && !db.tasks.some((x) => x.id === existingTask.id) && <option value={existingTask.id}>{existingTask.name}</option>}
            {db.tasks.filter((x) => !x.archived && !x.afterTaskId && (!x.onEvent || x.onEvent === existing?.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        ) : (
          <>
            <input className="field mt-2" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              {db.rooms.map((r) => (
                <button key={r.id} type="button" className={`chip ${roomId === r.id ? 'chip-active' : ''}`} onClick={() => setRoomId(r.id)}><RoomIcon name={r.icon} size={14} />{r.name}</button>
              ))}
            </div>
          </>
        )}
        <p className="mt-2 text-xs text-muted">{t('L’azione resta in attesa finché il dispositivo non segnala; quando la completi torna in attesa del prossimo segnale.')}</p>
      </div>

      <div className="mt-3"><Toggle checked={enabled} onChange={setEnabled} label={t('Automazione attiva')} hint={t('Il server controlla il dispositivo a intervalli regolari (di norma ogni ora), anche con l’app chiusa.')} /></div>

      <button type="button" className="glass-btn btn-primary mt-4 w-full !py-3.5" disabled={busy || !valid || !server} onClick={() => void save()}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : null}{existing ? t('Salva modifiche') : t('Collega dispositivo')}
      </button>
      {existing && (
        <button type="button" className="glass-btn btn-danger mt-3 w-full" onClick={() => { void app.deleteAutomation(existing.id); onClose() }}><Trash2 size={16} /> {t('Elimina automazione')}</button>
      )}
      {existing && <p className="mt-3 text-center text-xs text-muted">{describeCondition(existing)}</p>}
    </div>
  )
}

/** Inizio e fine del ciclo di un dispositivo (es. Roomba): l'azione va «in corso» alla partenza e si completa alla fine. */
function CycleForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const app = useApp()
  const { openAutomationSheet } = useUi()
  const { db } = app
  const existing = (db.automations ?? []).find((a) => a.id === id)
  const [name, setName] = useState(existing?.name ?? 'Roomba')
  const [enabled, setEnabled] = useState(existing?.enabled ?? true)
  const [assignTo, setAssignTo] = useState(existing?.assignTo ?? '')
  const [useExisting, setUseExisting] = useState(!!existing)
  const [taskId, setTaskId] = useState(existing?.taskId ?? db.tasks.find((x) => !x.onEvent && !x.afterTaskId && !x.archived)?.id ?? '')
  const [newName, setNewName] = useState(t('Passare l’aspirapolvere'))
  const [roomId, setRoomId] = useState(db.rooms[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  const server = pushConfigured() && app.mode === 'drive'
  const valid = name.trim() && (useExisting ? !!taskId : !!newName.trim() && !!roomId)
  const startUrl = existing?.hookToken ? cycleHookUrl(existing.hookToken, 'start') : ''
  const finishUrl = existing?.hookToken ? cycleHookUrl(existing.hookToken, 'finish') : ''

  const copy = (key: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(key); window.setTimeout(() => setCopied(''), 1500) }
  const save = async () => {
    setErr(''); setBusy(true)
    try {
      let target = taskId
      if (!useExisting) {
        target = uid('t')
        app.upsertTask({ id: target, roomId, name: newName.trim(), stars: 2, assignment: { mode: 'anyone' }, recurrence: { type: 'weekly', every: 1 } })
      }
      const aid = existing?.id ?? uid('a')
      const e = await app.saveAutomation({ id: aid, kind: 'cycle', name: name.trim(), deviceId: '', code: '', op: 'eq', value: '', taskId: target, enabled, hookToken: existing?.hookToken, assignTo: assignTo || undefined })
      if (e) { setErr(e); return }
      if (!existing) openAutomationSheet({ id: aid }) // si riapre in modifica: ora ci sono gli indirizzi da copiare
      else onClose()
    } finally { setBusy(false) }
  }

  const Row = ({ k, label, value }: { k: string; label: string; value: string }) => (
    <div className="mt-2">
      <p className="px-1 text-xs font-semibold text-muted">{label}</p>
      <div className="mt-1 flex gap-2">
        <input readOnly className="field font-mono !text-[11px]" value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button type="button" className="glass-btn !px-3" aria-label={t('Copia')} onClick={() => copy(k, value)}>{copied === k ? <Check size={16} /> : <Copy size={16} />}</button>
      </div>
    </div>
  )

  return (
    <div>
      {!server && <p className="mb-2 rounded-xl bg-brand/15 p-3 text-sm text-brand">{t('Per collegare un dispositivo serve una casa su Drive e il server delle notifiche (vedi README).')}</p>}
      <p className="rounded-xl bg-brand/10 p-3 text-sm text-muted">{t('Quando il dispositivo segnala l’inizio del ciclo l’azione va «in corso»; quando segnala la fine si completa da sola (senza stelle) e tutti vengono avvisati.')}</p>

      <label className="label">{t('Nome')}</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="label">{t('Azione collegata')}</label>
      <div className="rounded-2xl border border-line bg-bg/60 p-3">
        <div className="flex gap-2">
          <button type="button" className={`chip ${!useExisting ? 'chip-active' : ''}`} onClick={() => setUseExisting(false)}>{t('Nuova azione')}</button>
          <button type="button" className={`chip ${useExisting ? 'chip-active' : ''}`} onClick={() => setUseExisting(true)}>{t('Azione esistente')}</button>
        </div>
        {useExisting ? (
          <select className="field mt-2" value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label={t('Azione')}>
            {db.tasks.filter((x) => !x.archived && !x.afterTaskId && !x.onEvent).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        ) : (
          <>
            <input className="field mt-2" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              {db.rooms.map((r) => (
                <button key={r.id} type="button" className={`chip ${roomId === r.id ? 'chip-active' : ''}`} onClick={() => setRoomId(r.id)}><RoomIcon name={r.icon} size={14} />{r.name}</button>
              ))}
            </div>
          </>
        )}
        <p className="mt-2 text-xs text-muted">{t('L’azione tiene la sua ricorrenza; il ciclo del dispositivo la completa (puoi sempre completarla o annullarla a mano).')}</p>
      </div>

      <label className="label">{t('Quando parte, assegnala a')}</label>
      <select className="field" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label={t('Quando parte, assegnala a')}>
        <option value="">{t('Nessuno (si può assegnare dopo)')}</option>
        {db.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <p className="mt-1 px-1 text-xs text-muted">{t('Senza assegnatario l’azione «in corso» mostra un avviso con «Assegna a me»; chi la prende avrà le stelle a fine ciclo. Se resta senza, si completa senza stelle.')}</p>

      <div className="mt-3"><Toggle checked={enabled} onChange={setEnabled} label={t('Automazione attiva')} /></div>
      {err && <p className="mt-3 rounded-xl bg-exp/10 p-3 text-sm text-exp">{err}</p>}

      <button type="button" className="glass-btn btn-primary mt-4 w-full !py-3.5" disabled={busy || !valid || !server} onClick={() => void save()}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : null}{existing ? t('Salva modifiche') : t('Collega dispositivo')}
      </button>

      {existing?.hookToken && (
        <div className="mt-4 rounded-2xl border border-line bg-bg/60 p-3">
          <p className="text-sm font-bold">{t('Indirizzi da far chiamare al dispositivo')}</p>
          <Row k="start" label={t('Quando parte')} value={startUrl} />
          <Row k="finish" label={t('Quando finisce')} value={finishUrl} />
          <p className="mb-1 mt-3 text-xs font-semibold text-muted">{t('Con IFTTT (applet, azione «Webhooks → Make a web request», metodo GET):')}</p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>{t('Se: iRobot → il robot avvia la pulizia. Allora: Webhooks → Make a web request con l’indirizzo «Quando parte».')}</li>
            <li>{t('Se: iRobot → il robot finisce una pulizia. Allora: Make a web request con l’indirizzo «Quando finisce».')}</li>
            <li>{t('IFTTT può metterci qualche minuto a segnalare.')}</li>
          </ol>
          <p className="mb-1 mt-3 text-xs font-semibold text-muted">{t('Per provare senza IFTTT (da un computer):')}</p>
          <div className="flex gap-2"><input readOnly className="field font-mono !text-[11px]" value={`curl "${startUrl}"`} onFocus={(e) => e.currentTarget.select()} aria-label="curl start" /><button type="button" className="glass-btn !px-3" aria-label={t('Copia')} onClick={() => copy('c1', `curl "${startUrl}"`)}>{copied === 'c1' ? <Check size={16} /> : <Copy size={16} />}</button></div>
          <div className="mt-2 flex gap-2"><input readOnly className="field font-mono !text-[11px]" value={`curl "${finishUrl}"`} onFocus={(e) => e.currentTarget.select()} aria-label="curl finish" /><button type="button" className="glass-btn !px-3" aria-label={t('Copia')} onClick={() => copy('c2', `curl "${finishUrl}"`)}>{copied === 'c2' ? <Check size={16} /> : <Copy size={16} />}</button></div>
          <p className="mt-2 text-xs text-muted">{t('Gli indirizzi sono segreti: chi li conosce può segnalare inizio e fine. Non condividerli.')}</p>
          {existing.lastFiredAt ? <p className="mt-1 text-xs text-muted">{t('Ultimo segnale: {when}', { when: timeAgo(existing.lastFiredAt) })}</p> : <p className="mt-1 text-xs text-muted">{t('Nessun segnale ancora')}</p>}
        </div>
      )}
      {existing && (
        <button type="button" className="glass-btn btn-danger mt-3 w-full" onClick={() => { void app.deleteAutomation(existing.id); onClose() }}><Trash2 size={16} /> {t('Elimina automazione')}</button>
      )}
    </div>
  )
}

/** Comandi da Shortcuts di iPhone: un indirizzo per casa; nel link si indica quale azione e che cosa farne. */
function ShortcutForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const app = useApp()
  const { openAutomationSheet } = useUi()
  const { db, me } = app
  const existing = (db.automations ?? []).find((a) => a.id === id)
  const [name, setName] = useState(existing?.name ?? 'Shortcuts')
  const [enabled, setEnabled] = useState(existing?.enabled ?? true)
  const [taskId, setTaskId] = useState(db.tasks.find((x) => !x.archived)?.id ?? '')
  const [action, setAction] = useState('')
  const [who, setWho] = useState(me?.id ?? db.members[0]?.id ?? '') // vuoto = nessuno: il link non porta `who`
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const server = pushConfigured() && app.mode === 'drive'
  const task = db.tasks.find((x) => x.id === taskId)
  const url = existing?.hookToken && taskId ? shortcutUrl(existing.hookToken, taskId, action, who) : ''
  const ACTIONS: Array<{ id: string; label: string }> = [
    { id: '', label: t('Automatica: finisce se è in corso, avvia se ha una durata, altrimenti completa') },
    { id: 'todo', label: t('Segna da fare (azioni «Su richiesta»)') },
    { id: 'complete', label: t('Completa') },
    { id: 'start', label: t('Avvia') },
    { id: 'finish', label: t('Finisci (se in corso)') },
  ]

  const save = async () => {
    setErr(''); setBusy(true)
    try {
      const aid = existing?.id ?? uid('a')
      const e = await app.saveAutomation({ id: aid, kind: 'shortcut', name: name.trim(), deviceId: '', code: '', op: 'eq', value: '', taskId: '', enabled, hookToken: existing?.hookToken })
      if (e) { setErr(e); return }
      if (!existing) openAutomationSheet({ id: aid })
      else onClose()
    } finally { setBusy(false) }
  }

  return (
    <div>
      {!server && <p className="mb-2 rounded-xl bg-brand/15 p-3 text-sm text-brand">{t('Per collegare un dispositivo serve una casa su Drive e il server delle notifiche (vedi README).')}</p>}
      <p className="rounded-xl bg-brand/10 p-3 text-sm text-muted">{t('Una automazione di Shortcuts chiama un indirizzo con l’azione e il comando: l’app lo applica alla prossima apertura (da qualunque dispositivo della casa).')}</p>
      <label className="label">{t('Nome')}</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="mt-3"><Toggle checked={enabled} onChange={setEnabled} label={t('Automazione attiva')} /></div>
      {err && <p className="mt-3 rounded-xl bg-exp/10 p-3 text-sm text-exp">{err}</p>}
      <button type="button" className="glass-btn btn-primary mt-4 w-full !py-3.5" disabled={busy || !name.trim() || !server} onClick={() => void save()}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : null}{existing ? t('Salva modifiche') : t('Attiva i comandi')}
      </button>

      {existing?.hookToken && (
        <div className="mt-4 rounded-2xl border border-line bg-bg/60 p-3">
          <p className="text-sm font-bold">{t('Crea il link per Shortcuts')}</p>
          <label className="label !mt-2">{t('Azione')}</label>
          <select className="field" value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label={t('Azione')}>
            {db.tasks.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <label className="label">{t('Cosa fare')}</label>
          <select className="field" value={action} onChange={(e) => setAction(e.target.value)} aria-label={t('Cosa fare')}>
            {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <label className="label">{t('Per conto di (a lui vanno le stelle)')}</label>
          <select className="field" value={who} onChange={(e) => setWho(e.target.value)} aria-label={t('Per conto di (a lui vanno le stelle)')}>
            <option value="">{t('Nessuno (si può assegnare dopo)')}</option>
            {db.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {!who && <p className="mt-1 px-1 text-xs text-muted">{t('Senza membro, completare non dà stelle; un’azione a tempo parte «in corso» senza assegnatario e chi la prende dall’app con «Assegna a me» avrà le stelle.')}</p>}
          <p className="mb-1 mt-3 text-xs font-semibold text-muted">{t('Indirizzo da incollare in Shortcuts')}</p>
          <div className="flex gap-2">
            <input readOnly className="field font-mono !text-[11px]" value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t('Indirizzo da incollare in Shortcuts')} />
            <button type="button" className="glass-btn !px-3" aria-label={t('Copia')} onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>{t('Shortcuts → Automazione → «+» → scegli quando (un orario, un luogo, un tag NFC, la ricarica…).')}</li>
            <li>{t('Aggiungi l’azione «Ottieni contenuti dell’URL» e incolla l’indirizzo (metodo GET).')}</li>
            <li>{t('Disattiva «Chiedi prima di eseguire» così parte da sola.')}</li>
          </ol>
          <p className="mt-2 text-xs text-muted">{t('Al posto dell’id puoi scrivere il nome esatto dell’azione (se è uno solo). Per «secchiello pieno → da fare» scegli «Segna da fare».')}</p>
          {task && <p className="mt-1 text-xs text-muted">{t('Azione scelta: «{name}»', { name: task.name })}</p>}
          <p className="mt-2 text-xs text-muted">{t('Gli indirizzi sono segreti: chi li conosce può dare comandi alla casa. Non condividerli.')}</p>
          {existing.lastError && <p className="mt-2 rounded-xl bg-exp/10 p-2 text-xs font-semibold text-exp">{t('Ultimo comando non applicato: {error}', { error: existing.lastError })}</p>}
          <p className="mt-1 text-xs text-muted">{existing.lastFiredAt ? t('Ultimo comando: {when}', { when: timeAgo(existing.lastFiredAt) }) : t('Nessun comando ancora')}</p>
        </div>
      )}
      {existing && (
        <button type="button" className="glass-btn btn-danger mt-3 w-full" onClick={() => { void app.deleteAutomation(existing.id); onClose() }}><Trash2 size={16} /> {t('Elimina automazione')}</button>
      )}
    </div>
  )
}

export function AutomationSheet() {
  const { automationSheet, openAutomationSheet } = useUi()
  const { db } = useApp()
  const close = () => openAutomationSheet(null)
  const kind = (db.automations ?? []).find((a) => a.id === automationSheet?.id)?.kind ?? automationSheet?.kind ?? 'tuya'
  return (
    <Sheet open={!!automationSheet} onClose={close} title={automationSheet?.id ? t('Modifica automazione') : t('Collega un dispositivo')}>
      {automationSheet && (kind === 'shortcut'
        ? <ShortcutForm key={automationSheet.id ?? 'new-shortcut'} id={automationSheet.id} onClose={close} />
        : kind === 'cycle'
          ? <CycleForm key={automationSheet.id ?? 'new-cycle'} id={automationSheet.id} onClose={close} />
          : <AutomationForm key={automationSheet.id ?? 'new'} id={automationSheet.id} onClose={close} />)}
    </Sheet>
  )
}
