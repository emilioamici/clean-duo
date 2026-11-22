import { Pencil, Plus, Zap } from 'lucide-react'
import { pushConfigured } from '../services/push'
import { describeAutomation } from '../lib/automations'
import { timeAgo } from '../lib/stats'
import { t } from '../i18n'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'

/** Elenco delle automazioni con i dispositivi (per ora Tuya). */
export function AutomationsCard() {
  const { db, mode } = useApp()
  const { openAutomationSheet } = useUi()
  const list = db.automations ?? []
  const ready = mode === 'drive' && pushConfigured()
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('Collega un dispositivo: quando segnala qualcosa (es. crocchette in esaurimento) un’azione va da sola tra le cose da fare e tutta la casa riceve una notifica.')}</p>
      {!ready && <p className="rounded-xl bg-brand/15 p-3 text-sm text-brand">{t('Servono una casa su Drive e il server delle notifiche (vedi README).')}</p>}
      {list.map((a) => {
        const task = db.tasks.find((x) => x.id === a.taskId)
        return (
          <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-line bg-bg/60 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand"><Zap size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{a.name}{!a.enabled && <span className="ml-2 text-xs font-normal text-muted">{t('disattivata')}</span>}</p>
              <p className="truncate text-xs text-muted">{describeAutomation(a)} → {task?.name ?? '…'}</p>
              <p className="text-[11px] text-muted">{a.lastFiredAt ? t('Ultimo segnale: {when}', { when: timeAgo(a.lastFiredAt) }) : t('Nessun segnale ancora')}</p>
            </div>
            <button className="glass-btn !p-2" aria-label={t('Modifica {name}', { name: a.name })} onClick={() => openAutomationSheet({ id: a.id })}><Pencil size={15} /></button>
          </div>
        )
      })}
      <div className="flex gap-2">
        <button className="glass-btn flex-1" disabled={!ready} onClick={() => openAutomationSheet({})}><Plus size={16} /> {t('Dispositivo Tuya')}</button>
        <button className="glass-btn flex-1" disabled={!ready} onClick={() => openAutomationSheet({ kind: 'cycle' })}><Plus size={16} /> {t('Inizio e fine ciclo')}</button>
      </div>
    </div>
  )
}
