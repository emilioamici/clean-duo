import { AnimatePresence, motion } from 'framer-motion'
import { Star } from 'lucide-react'
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
import { CleanBar, PageHeader, Segmented } from './ui'

type Filter = 'todo' | 'next' | 'all'

export function TodayView() {
  const { db, me } = useApp()
  const { openTaskSheet } = useUi()
  const [filter, setFilter] = useState<Filter>('todo')
  const [room, setRoom] = useState<string | 'all'>('all')

  const active = useMemo(() => db.tasks.filter((x) => !x.archived), [db.tasks])
  const todoCount = active.filter((x) => ['overdue', 'today'].includes(urgencyOf(x))).length
  const overdueCount = active.filter((x) => urgencyOf(x) === 'overdue').length

  const list = useMemo(() => {
    return active
      .filter((x) => room === 'all' || inRoom(x, room))
      .filter((x) => {
        const u = urgencyOf(x)
        return filter === 'all' || (filter === 'todo' ? u === 'overdue' || u === 'today' || isRunning(x) : (u === 'soon' || u === 'later') && !isRunning(x))
      })
      .sort((a, b) => Number(isRunning(b)) - Number(isRunning(a)) || (nextDue(a) ?? 8.64e15) - (nextDue(b) ?? 8.64e15) || b.stars - a.stars)
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
        right={<><SyncPill /><NotificationBell /><MeChip /></>}
      />

      <MascotPeek kind="mochi">
        <div className="card p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-extrabold leading-none">{todoCount}</p>
              <p className="mt-1 text-sm text-muted">
                {todoCount === 0 ? t('nulla da fare, che meraviglia') : todoCount === 1 ? t('azione da fare') : t('azioni da fare')}
                {overdueCount > 0 && <span className="font-semibold text-exp"> · {t('{n} in ritardo', { n: overdueCount })}</span>}
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
      </MascotPeek>

      <div className="mt-4">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[{ id: 'todo', label: t('Da fare') }, { id: 'next', label: t('Prossime') }, { id: 'all', label: t('Tutte') }]}
        />
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <button className={`chip ${room === 'all' ? 'chip-active' : ''}`} onClick={() => setRoom('all')}>{t('Tutte le stanze')}</button>
        {db.rooms.map((r) => (
          <button key={r.id} className={`chip ${room === r.id ? 'chip-active' : ''}`} onClick={() => setRoom(r.id)}>
            <RoomIcon name={r.icon} size={14} />{r.name}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        <AnimatePresence mode="popLayout">
          {list.map((x) => <TaskRow key={x.id} task={x} />)}
        </AnimatePresence>
        {list.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card flex flex-col items-center gap-2 px-6 py-8 text-center">
            <MascotImg kind="zenitsu" className="h-20 w-auto" />
            <p className="text-lg font-bold">{db.tasks.length === 0 ? t('Nessuna azione ancora') : t('Tutto in ordine!')}</p>
            <p className="text-sm text-muted">
              {db.tasks.length === 0 ? t('Crea una stanza e aggiungi la prima faccenda.') : t('Niente da fare in questa vista.')}
            </p>
          </motion.div>
        )}
      </div>

      {db.rooms.length > 0 && <Fab label={t('Nuova azione')} onClick={() => openTaskSheet({ roomId: room === 'all' ? undefined : room })} />}
    </div>
  )
}
