import { motion } from 'framer-motion'
import { ChevronDown, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { nextDue, urgencyOf } from '../lib/clean'
import { starsSince, weekStart } from '../lib/stats'
import { isRunning } from '../lib/timers'
import { inRoom } from '../lib/rooms'
import { locale, t } from '../i18n'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { Fab, MeChip, NotificationBell, SyncPill } from './Chrome'
import { MascotImg, MascotPeek } from './Mascots'
import { RoomIcon } from './icons'
import { TaskRow } from './TaskRow'
import type { Task } from '../types'
import { CleanBar, PageHeader, Segmented } from './ui'

type Filter = 'todo' | 'next' | 'all'
const RUNNING_OPEN_KEY = 'cleanduo:runningOpen'

function GoalCard({ todoCount, overdueCount, runningCount, myStars, goal, pct }: {
  todoCount: number
  overdueCount: number
  runningCount: number
  myStars: number
  goal: number
  pct: number
}) {
  return (
    <div className="card p-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-4xl font-extrabold leading-none">{todoCount}</p>
          <p className="mt-1 text-sm text-muted">
            {todoCount === 0 ? t('nulla da fare, che meraviglia') : todoCount === 1 ? t('azione da fare') : t('azioni da fare')}
            {overdueCount > 0 && <span className="font-semibold text-exp"> · {t('{n} in ritardo', { n: overdueCount })}</span>}
            {runningCount > 0 && <span className="font-semibold text-brand"> · {t('{n} in corso', { n: runningCount })}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-2xl font-extrabold">
            {myStars}<span className="text-base font-semibold text-muted">/{goal}</span>
            <Star size={20} className="fill-brand text-brand" />
          </p>
          <p className="text-xs text-muted">{t('obiettivo settimanale')}</p>
        </div>
      </div>
      <div className="mt-3"><CleanBar pct={pct} height={10} /></div>
    </div>
  )
}

/**
 * Le azioni in corso, in una scheda che si apre e si chiude in cima alla pagina (compare solo se ce ne sono).
 * Il gattino con la scopa spazza mentre c'è qualcosa in corso.
 */
function RunningPanel({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(RUNNING_OPEN_KEY) !== 'false' } catch { return true } })
  const flip = () => setOpen((o) => { try { localStorage.setItem(RUNNING_OPEN_KEY, String(!o)) } catch { /* noop */ } return !o })
  const title = tasks.length === 1 ? t('1 azione in corso') : t('{n} azioni in corso', { n: tasks.length })
  return (
    <div className="relative pt-11" data-testid="running-panel">
      <span className="cat-bob absolute left-6 top-0 block"><MascotImg kind="zenitsu" className="h-16 w-auto" /></span>
      {/* la scopa oscilla con il manico come perno, sul bordo della scheda */}
      <span className="broom-sweep pointer-events-none absolute left-[5.4rem] top-0 z-10 block"><MascotImg kind="broom" className="h-[2.9rem] w-auto" /></span>
      <section className="card relative overflow-hidden">
        <button type="button" onClick={flip} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left active:bg-line/30">
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-extrabold leading-tight">{title}</span>
            {!open && <span className="block truncate text-xs text-muted">{tasks.map((x) => x.name).join(' · ')}</span>}
          </span>
          <ChevronDown size={20} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div className="space-y-3 border-t border-line/60 p-3">{tasks.map((x) => <TaskRow key={x.id} task={x} />)}</div>}
      </section>
    </div>
  )
}

export function TodayView() {
  const { db, me } = useApp()
  const { openTaskSheet } = useUi()
  const [filter, setFilter] = useState<Filter>('todo')
  const [room, setRoom] = useState<string | 'all'>('all')

  const active = useMemo(() => db.tasks.filter((x) => !x.archived), [db.tasks])
  // le azioni in corso stanno nella loro scheda (non tra quelle «da fare»: qualcuno se ne sta già occupando)
  const runningCount = active.filter(isRunning).length
  const todoCount = active.filter((x) => ['overdue', 'today'].includes(urgencyOf(x)) && !isRunning(x)).length
  const overdueCount = active.filter((x) => urgencyOf(x) === 'overdue' && !isRunning(x)).length
  const runningTasks = useMemo(() => active.filter(isRunning), [active])

  const list = useMemo(() => {
    return active
      .filter((x) => room === 'all' || inRoom(x, room))
      .filter((x) => {
        const u = urgencyOf(x)
        if (isRunning(x)) return false // stanno nella scheda «in corso» in cima
        if (filter === 'all') return true
        return filter === 'todo' ? u === 'overdue' || u === 'today' : u === 'soon' || u === 'later'
      })
      .sort((a, b) => (nextDue(a) ?? 8.64e15) - (nextDue(b) ?? 8.64e15) || b.stars - a.stars)
  }, [active, filter, room])

  const myStars = me ? starsSince(db.logs, weekStart())[me.id] ?? 0 : 0
  const goal = db.settings.weeklyGoal || 1
  const pct = Math.min(100, Math.round((myStars / goal) * 100))
  const today = new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      <PageHeader
        title={me ? t('Ciao {name}!', { name: me.name }) : t('Oggi')}
        subtitle={today}
        right={
          <div className="flex md:hidden items-center gap-2">
            <SyncPill /><NotificationBell /><MeChip />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-8 items-start">
        {/* Colonna Principale: Filtri e Azioni */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Card obiettivo mostrata in testa su schermi compatti */}
          <div className="lg:hidden">
            <MascotPeek kind="mochi">
              <GoalCard todoCount={todoCount} overdueCount={overdueCount} runningCount={runningCount} myStars={myStars} goal={goal} pct={pct} />
            </MascotPeek>
          </div>

          {runningTasks.length > 0 && <RunningPanel tasks={runningTasks} />}

          <div>
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'todo', label: t('Da fare') },
                { id: 'next', label: t('Prossime') },
                { id: 'all', label: t('Tutte') },
              ]}
            />
          </div>

          <div className="-mx-4 lg:mx-0 flex gap-2 overflow-x-auto px-4 lg:px-0 pb-1">
            <button className={`chip ${room === 'all' ? 'chip-active' : ''}`} onClick={() => setRoom('all')}>{t('Tutte le stanze')}</button>
            {db.rooms.map((r) => (
              <button key={r.id} className={`chip ${room === r.id ? 'chip-active' : ''}`} onClick={() => setRoom(r.id)}>
                <RoomIcon name={r.icon} size={14} />{r.name}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {/* niente AnimatePresence: la riga che esce non deve dipendere da un'animazione di uscita */}
            {list.map((x) => <TaskRow key={x.id} task={x} />)}
            {list.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
                <MascotImg kind={todoCount === 0 ? 'spray' : 'zenitsu'} className="h-20 w-auto" />
                <p className="text-lg font-bold">{db.tasks.length === 0 ? t('Nessuna azione ancora') : t('Tutto in ordine!')}</p>
                <p className="text-sm text-muted max-w-sm">
                  {db.tasks.length === 0 ? t('Crea una stanza e aggiungi la prima faccenda.') : t('Niente da fare in questa vista.')}
                </p>
              </motion.div>
            )}
          </div>
        </div>

        {/* Colonna Laterale: Obiettivo, Statistiche e Mascotte su Desktop/Tablet largo */}
        <div className="hidden lg:block lg:col-span-5 xl:col-span-4 space-y-6">
          <MascotPeek kind="mochi">
            <GoalCard todoCount={todoCount} overdueCount={overdueCount} runningCount={runningCount} myStars={myStars} goal={goal} pct={pct} />
          </MascotPeek>

          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <MascotImg kind="broom" className="h-16 w-auto shrink-0" />
              <div>
                <h4 className="font-bold text-ink">{t('Pulizie di casa')}</h4>
                <p className="text-xs text-muted">{t('Piccole abitudini quotidiane per una casa che splende.')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-2xl bg-bg/80 p-3 border border-line/60">
                <p className="text-xs font-semibold text-muted">{t('Da fare oggi')}</p>
                <p className="text-xl font-extrabold text-brand mt-0.5">{todoCount}</p>
              </div>
              <div className="rounded-2xl bg-bg/80 p-3 border border-line/60">
                <p className="text-xs font-semibold text-muted">{t('In corso')}</p>
                <p className="text-xl font-extrabold text-inc mt-0.5">{runningCount}</p>
              </div>
            </div>
            {overdueCount > 0 && (
              <div className="rounded-2xl bg-exp/10 p-3 border border-exp/20 text-xs font-semibold text-exp flex items-center gap-2">
                <MascotImg kind="spray" className="h-7 w-auto shrink-0" />
                <span>{t('{n} azioni richiedono attenzione!', { n: overdueCount })}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {db.rooms.length > 0 && <Fab label={t('Nuova azione')} onClick={() => openTaskSheet({ roomId: room === 'all' ? undefined : room })} />}
    </div>
  )
}
