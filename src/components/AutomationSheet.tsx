import { CheckCircle2, CircleAlert, Loader2, Plug, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { describeCondition, OP_LABEL } from '../lib/automations'
import { uid } from '../lib/clean'
import { t } from '../i18n'
import { pushConfigured, tuyaStatus, type TuyaCondition, type TuyaDeviceInfo } from '../services/push'
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

export function AutomationSheet() {
  const { automationSheet, openAutomationSheet } = useUi()
  const close = () => openAutomationSheet(null)
  return (
    <Sheet open={!!automationSheet} onClose={close} title={automationSheet?.id ? t('Modifica automazione') : t('Collega un dispositivo')}>
      {automationSheet && <AutomationForm key={automationSheet.id ?? 'new'} id={automationSheet.id} onClose={close} />}
    </Sheet>
  )
}
