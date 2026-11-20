import { motion } from 'framer-motion'
import { Check, Link2, Play, Repeat, Timer, X } from 'lucide-react'
import type { Task } from '../types'
import { currentAssignee, dueLabel, recurrenceLabel, urgencyOf, type Urgency } from '../lib/clean'
import { t } from '../i18n'
import { isWaiting } from '../lib/deps'
import { durationLabel, isRunning, remainingLabel, remainingMs, timeOfDay } from '../lib/timers'
import { useNow } from '../lib/useNow'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { RoomIcon } from './icons'
import { Avatar, Stars } from './ui'

const URGENCY_STYLE: Record<Urgency, string> = {
  overdue: 'bg-exp/15 text-exp',
  today: 'bg-brand/15 text-brand',
  soon: 'bg-trf/15 text-trf',
  later: 'bg-line/70 text-muted',
}

export function TaskRow({ task, showRoom = true }: { task: Task; showRoom?: boolean }) {
  const { db } = useApp()
  const { complete, openTaskSheet } = useUi()
  const { cancelTimer } = useApp()
  const now = useNow(15_000)
  const running = isRunning(task)
  const before = task.afterTaskId ? db.tasks.find((x) => x.id === task.afterTaskId) : undefined
  const waiting = isWaiting(task)
  const room = db.rooms.find((r) => r.id === task.roomId)
  const assignee = db.members.find((m) => m.id === currentAssignee(task))
  const u = urgencyOf(task)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 90, scale: 0.92, transition: { duration: 0.28 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      className="card flex items-center gap-3 p-3"
    >
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openTaskSheet({ id: task.id })}>
        {(showRoom || task.icon) && room && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-inner" style={{ background: `linear-gradient(135deg, ${room.color}, ${room.color}aa)` }}>
            <RoomIcon name={task.icon ?? room.icon} size={20} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-tight">{task.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
            {showRoom && room && <span className="truncate">{room.name}</span>}
            {showRoom && <span>·</span>}
            <Repeat size={11} /> <span className="truncate">{task.afterTaskId ? t('Dopo «{task}»', { task: before?.name ?? '…' }) : recurrenceLabel(task)}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {running ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                <Timer size={11} />{t('In corso · finisce alle {time} ({left})', { time: timeOfDay(task.runningUntil!), left: remainingLabel(remainingMs(task, now)) })}
              </span>
            ) : waiting ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-line/70 px-2 py-0.5 text-[11px] font-semibold text-muted"><Link2 size={11} />{t('In attesa di «{task}»', { task: before?.name ?? '…' })}</span>
            ) : (
              <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${URGENCY_STYLE[u]}`}>{dueLabel(task)}</span>
            )}
            {!running && task.durationMin ? <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-muted"><Timer size={11} />{durationLabel(task.durationMin)}</span> : null}
            <Stars value={task.stars} size={12} />
          </span>
        </span>
      </button>
      {assignee && <Avatar member={assignee} size={28} />}
      {running ? (
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => { if (window.confirm(t('Annullare «{task}»? Non verrà completata.', { task: task.name }))) cancelTimer(task.id) }}
          className="glass-btn !h-12 !w-12 shrink-0 !p-0 text-brand"
          aria-label={t('Annulla {name}', { name: task.name })}
        >
          <X size={22} strokeWidth={2.6} />
        </motion.button>
      ) : (
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            complete(task.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
          }}
          className="glass-btn btn-primary !h-12 !w-12 shrink-0 !p-0"
          aria-label={task.durationMin ? t('Avvia {name}', { name: task.name }) : t('Completa {name}', { name: task.name })}
        >
          {task.durationMin ? <Play size={22} strokeWidth={2.6} className="fill-current" /> : <Check size={24} strokeWidth={3} />}
        </motion.button>
      )}
    </motion.div>
  )
}
