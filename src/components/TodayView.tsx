import { AnimatePresence, motion } from 'framer-motion'
import { PartyPopper, Plus, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { nextDue, urgencyOf } from '../lib/clean'
import { starsSince, weekStart } from '../lib/stats'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { MeChip, SyncPill } from './Chrome'
import { RoomIcon } from './icons'
import { TaskRow } from './TaskRow'
import { CleanBar, PageHeader, Segmented } from './ui'

type Filter = 'todo' | 'next' | 'all'

export function TodayView() {
  const { db, me } = useApp()
  const { openTaskSheet } = useUi()
  const [filter, setFilter] = useState<Filter>('todo')
  const [room, setRoom] = useState<string | 'all'>('all')

  const active = useMemo(() => db.tasks.filter((t) => !t.archived), [db.tasks])
  const todoCount = active.filter((t) => ['overdue', 'today'].includes(urgencyOf(t))).length
  const overdueCount = active.filter((t) => urgencyOf(t) === 'overdue').length

  const list = useMemo(() => {
    return active
      .filter((t) => room === 'all' || t.roomId === room)
      .filter((t) => {
        const u = urgencyOf(t)
        return filter === 'all' || (filter === 'todo' ? u === 'overdue' || u === 'today' : u === 'soon' || u === 'later')
      })
      .sort((a, b) => (nextDue(a) ?? 0) - (nextDue(b) ?? 0) || b.stars - a.stars)
  }, [active, filter, room])

  const myStars = me ? starsSince(db.logs, weekStart())[me.id] ?? 0 : 0
  const goal = db.settings.weeklyGoal || 1
  const pct = Math.min(100, Math.round((myStars / goal) * 100))
  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      <PageHeader
        title={me ? `Ciao ${me.name}!` : 'Oggi'}
        subtitle={today}
        right={<><SyncPill /><MeChip /></>}
      />

      <div className="glass mb-4 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-extrabold leading-none">{todoCount}</p>
            <p className="mt-1 text-sm text-muted">
              {todoCount === 0 ? 'nulla da fare, che meraviglia' : todoCount === 1 ? 'azione da fare' : 'azioni da fare'}
              {overdueCount > 0 && <span className="font-semibold text-exp"> · {overdueCount} in ritardo</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-2xl font-extrabold">
              {myStars}<span className="text-base font-semibold text-muted">/{goal}</span>
              <Star size={20} className="fill-brand text-brand" />
            </p>
            <p className="text-xs text-muted">obiettivo settimanale</p>
          </div>
        </div>
        <div className="mt-3"><CleanBar pct={pct} height={10} /></div>
      </div>

      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[{ id: 'todo', label: 'Da fare' }, { id: 'next', label: 'Prossime' }, { id: 'all', label: 'Tutte' }]}
      />

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <button className={`chip ${room === 'all' ? 'chip-active' : ''}`} onClick={() => setRoom('all')}>Tutte le stanze</button>
        {db.rooms.map((r) => (
          <button key={r.id} className={`chip ${room === r.id ? 'chip-active' : ''}`} onClick={() => setRoom(r.id)}>
            <RoomIcon name={r.icon} size={14} />{r.name}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        <AnimatePresence mode="popLayout">
          {list.map((t) => <TaskRow key={t.id} task={t} />)}
        </AnimatePresence>
        {list.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass flex flex-col items-center gap-2 px-6 py-10 text-center">
            <PartyPopper size={40} className="text-brand" />
            <p className="text-lg font-bold">{db.tasks.length === 0 ? 'Nessuna azione ancora' : 'Tutto in ordine!'}</p>
            <p className="text-sm text-muted">
              {db.tasks.length === 0 ? 'Crea una stanza e aggiungi la prima faccenda.' : 'Niente da fare in questa vista.'}
            </p>
          </motion.div>
        )}
      </div>

      <button
        onClick={() => openTaskSheet({ roomId: room === 'all' ? undefined : room })}
        className="glass-btn btn-primary mt-4 w-full !py-3.5"
        disabled={db.rooms.length === 0}
      >
        <Plus size={18} /> Nuova azione
      </button>
    </div>
  )
}
