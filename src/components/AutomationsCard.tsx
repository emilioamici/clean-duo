import { ChevronDown, Cpu, Plus, RefreshCcw, Smartphone, Zap, Pencil } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { pushConfigured } from '../services/push'
import { describeAutomation } from '../lib/automations'
import { timeAgo } from '../lib/stats'
import { t } from '../i18n'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'

type Section = 'active' | 'create'
const OPEN_KEY = 'cleanduo:automationsOpen'
const load = (): Partial<Record<Section, boolean>> => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') } catch { return {} } }

/** Sottosezione collassabile (più leggera dell'Accordion delle Impostazioni). */
function Sub({ title, count, open, onToggle, children }: { title: string; count?: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-bg/40">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-3 text-left active:bg-line/30">
        <span className="min-w-0 flex-1 text-sm font-bold">{title}</span>
        {count !== undefined && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">{count}</span>}
        <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="space-y-2 border-t border-line/60 p-2">{children}</div>}
    </section>
  )
}

/** Automazioni con i dispositivi: quelle attive e quelle che si possono creare, in due sezioni che si aprono e chiudono. */
export function AutomationsCard() {
  const { db, mode } = useApp()
  const { openAutomationSheet } = useUi()
  const list = db.automations ?? []
  const ready = mode === 'drive' && pushConfigured()
  // di base si apre l'elenco; se non ce n'è nessuna si apre «Nuova automazione»
  const [open, setOpen] = useState<Partial<Record<Section, boolean>>>(() => { const s = load(); return { active: s.active ?? list.length > 0, create: s.create ?? list.length === 0 } })
  const flip = (k: Section) => setOpen((o) => { const n = { ...o, [k]: !o[k] }; try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)) } catch { /* noop */ } return n })

  const kinds: Array<{ id: string; icon: ReactNode; name: string; text: string; onClick: () => void }> = [
    { id: 'tuya', icon: <Cpu size={18} />, name: t('Dispositivo Tuya'), text: t('Quando un dato del dispositivo cambia (es. crocchette in esaurimento) l’azione va tra le cose da fare.'), onClick: () => openAutomationSheet({}) },
    { id: 'shortcut', icon: <Smartphone size={18} />, name: t('Comandi Shortcuts (iPhone)'), text: t('Un’automazione di Shortcuts avvia, completa, finisce o segna da fare un’azione chiamando un indirizzo.'), onClick: () => openAutomationSheet({ kind: 'shortcut' }) },
    { id: 'cycle', icon: <RefreshCcw size={18} />, name: t('Inizio e fine ciclo'), text: t('Per un robot (es. Roomba): all’inizio l’azione va «in corso», alla fine si completa da sola.'), onClick: () => openAutomationSheet({ kind: 'cycle' }) },
  ]

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('Collega un dispositivo: quando segnala qualcosa (es. crocchette in esaurimento) un’azione va da sola tra le cose da fare e tutta la casa riceve una notifica.')}</p>
      {!ready && <p className="rounded-xl bg-brand/15 p-3 text-sm text-brand">{t('Servono una casa su Drive e il server delle notifiche (vedi README).')}</p>}

      <Sub title={t('Automazioni attive')} count={list.length} open={!!open.active} onToggle={() => flip('active')}>
        {list.length === 0 && <p className="py-1 text-sm text-muted">{t('Nessuna automazione ancora: creane una da «Nuova automazione».')}</p>}
        {list.map((a) => {
          const task = db.tasks.find((x) => x.id === a.taskId)
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-line bg-bg/60 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand"><Zap size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{a.name}{!a.enabled && <span className="ml-2 text-xs font-normal text-muted">{t('disattivata')}</span>}</p>
                <p className="truncate text-xs text-muted">{describeAutomation(a)}{a.kind === 'shortcut' ? '' : ` → ${task?.name ?? '…'}`}</p>
                {a.lastError && <p className="truncate text-[11px] font-semibold text-exp">{a.lastError}</p>}
                <p className="text-[11px] text-muted">{a.lastFiredAt ? t('Ultimo segnale: {when}', { when: timeAgo(a.lastFiredAt) }) : t('Nessun segnale ancora')}</p>
              </div>
              <button className="glass-btn !p-2" aria-label={t('Modifica {name}', { name: a.name })} onClick={() => openAutomationSheet({ id: a.id })}><Pencil size={15} /></button>
            </div>
          )
        })}
      </Sub>

      <Sub title={t('Nuova automazione')} open={!!open.create} onToggle={() => flip('create')}>
        {kinds.map((k) => (
          <button key={k.id} type="button" disabled={!ready} onClick={k.onClick} aria-label={t('Crea: {name}', { name: k.name })}
            className="flex w-full items-center gap-3 rounded-2xl border border-line bg-bg/60 p-3 text-left transition active:scale-[0.99] disabled:opacity-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand">{k.icon}</span>
            <span className="min-w-0 flex-1"><span className="block font-bold">{k.name}</span><span className="block text-xs text-muted">{k.text}</span></span>
            <Plus size={18} className="shrink-0 text-muted" />
          </button>
        ))}
      </Sub>
    </div>
  )
}
