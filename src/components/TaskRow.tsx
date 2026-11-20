import { motion } from 'framer-motion'
import { Check, Repeat } from 'lucide-react'
import type { Task } from '../types'
import { currentAssignee, dueLabel, recurrenceLabel, urgencyOf, type Urgency } from '../lib/clean'
import { t } from '../i18n'
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
        {showRoom && room && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-inner" style={{ background: `linear-gradient(135deg, ${room.color}, ${room.color}aa)` }}>
            <RoomIcon name={room.icon} size={20} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-tight">{task.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
            {showRoom && room && <span className="truncate">{room.name}</span>}
            {showRoom && <span>·</span>}
            <Repeat size={11} /> <span className="truncate">{recurrenceLabel(task)}</span>
          </span>
          <span className="mt-1.5 flex items-center gap-2">
            <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${URGENCY_STYLE[u]}`}>{dueLabel(task)}</span>
            <Stars value={task.stars} size={12} />
          </span>
        </span>
      </button>
      {assignee && <Avatar member={assignee} size={28} />}
      <motion.button
        whileTap={{ scale: 0.82 }}
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          complete(task.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
        }}
        className="glass-btn btn-primary !h-12 !w-12 shrink-0 !p-0"
        aria-label={t('Completa {name}', { name: task.name })}
      >
        <Check size={24} strokeWidth={3} />
      </motion.button>
    </motion.div>
  )
}
