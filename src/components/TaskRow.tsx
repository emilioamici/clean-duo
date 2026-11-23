import { motion } from 'framer-motion'
import { Check, ClipboardList, Link2, Play, Repeat, StickyNote, Timer, UserCheck, UserX, X } from 'lucide-react'
import { useState } from 'react'
import type { Task } from '../types'
import { currentAssignee, dueLabel, nextDue, recurrenceLabel, urgencyOf, type Urgency } from '../lib/clean'
import { t } from '../i18n'
import { isOnDemand, isWaiting } from '../lib/deps'
import { taskRooms } from '../lib/rooms'
import { durationLabel, isAutoRunning, isRunning, remainingLabel, remainingMs, timeOfDay } from '../lib/timers'
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

/**
 * `roomId` = vista di una singola stanza: scadenza e completamento valgono solo per quella stanza.
 * Senza (pagina Oggi): per un'azione con più stanze la scadenza è la più vicina e il completamento vale per tutte.
 */
export function TaskRow({ task, showRoom = true, roomId }: { task: Task; showRoom?: boolean; roomId?: string }) {
  const { db } = useApp()
  const [noteOpen, setNoteOpen] = useState(false)
  const { complete, finish, openTaskSheet } = useUi()
  const { cancelTimer, markTodo, assignRunning } = useApp()
  const now = useNow(15_000)
  const running = isRunning(task)
  const before = task.afterTaskId ? db.tasks.find((x) => x.id === task.afterTaskId) : undefined
  const waiting = isWaiting(task)
  const device = task.onEvent ? (db.automations ?? []).find((a) => a.id === task.onEvent) : undefined
  const rooms = taskRooms(task).map((id) => db.rooms.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r)
  const room = (roomId && rooms.find((r) => r.id === roomId)) || rooms[0]
  const roomNames = rooms.length > 2 ? t('{n} stanze', { n: rooms.length }) : rooms.map((r) => r.name).join(', ')
  const assignee = db.members.find((m) => m.id === currentAssignee(task))
  const u = urgencyOf(task, now, roomId)
  // «in corso» senza assegnatario (avviata da un'automazione): si prende con «Assegna a me»; «Completa ora» passa allo swipe
  const unassigned = running && !db.members.some((m) => m.id === task.runningBy)
  const holder = running ? db.members.find((m) => m.id === task.runningBy) : undefined

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 90, scale: 0.92, transition: { duration: 0.28 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      className="card"
    >
      <div className="relative overflow-hidden rounded-[inherit]">
      {unassigned && <div aria-hidden className="absolute inset-0 flex items-center justify-end gap-2 bg-inc/20 pr-5 text-sm font-bold text-inc"><Check size={18} strokeWidth={3} />{t('Completa ora')}</div>}
      <motion.div
        drag={unassigned ? 'x' : false} dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.5, right: 0 }}
        onDragEnd={(_, info) => { if (unassigned && (info.offset.x < -110 || (info.offset.x < -60 && info.velocity.x < -600))) finish(task.id, { x: window.innerWidth / 2, y: window.innerHeight / 2 }) }}
        className={`flex items-center gap-3 p-3 ${unassigned ? 'relative bg-surface' : ''}`} data-swipe={unassigned || undefined}
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
            {showRoom && room && <span className="truncate">{roomNames}</span>}
            {showRoom && <span>·</span>}
            <Repeat size={11} /> <span className="truncate">{task.onEvent ? t('Quando lo segnala «{name}»', { name: device?.name ?? '…' }) : task.afterTaskId ? t('Dopo «{task}»', { task: before?.name ?? '…' }) : recurrenceLabel(task)}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {running ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                <Timer size={11} />{isAutoRunning(task)
                  ? t('In corso dalle {time} · attende la fine', { time: timeOfDay(task.autoRunSince!) })
                  : t('In corso · finisce alle {time} ({left})', { time: timeOfDay(task.runningUntil!), left: remainingLabel(remainingMs(task, now)) })}
              </span>
            ) : waiting ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-line/70 px-2 py-0.5 text-[11px] font-semibold text-muted"><Link2 size={11} />{task.onEvent ? t('In attesa del dispositivo «{name}»', { name: device?.name ?? '…' }) : t('In attesa di «{task}»', { task: before?.name ?? '…' })}</span>
            ) : (
              <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${URGENCY_STYLE[u]}`}>{dueLabel(task, now, roomId)}</span>
            )}
            {!running && task.durationMin ? <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-muted"><Timer size={11} />{durationLabel(task.durationMin)}</span> : null}
            <Stars value={task.stars} size={12} />
          </span>
        </span>
      </button>
      {(holder ?? (running ? undefined : assignee)) && <Avatar member={(holder ?? assignee)!} size={28} />}
      {running ? (
        <span className="flex shrink-0 items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => { if (window.confirm(t('Annullare «{task}»? Non verrà completata.', { task: task.name }))) cancelTimer(task.id) }}
            className="glass-btn !h-10 !w-10 !p-0 text-muted"
            aria-label={t('Annulla {name}', { name: task.name })}
          >
            <X size={18} strokeWidth={2.6} />
          </motion.button>
          {unassigned ? (
            <motion.button
              whileTap={{ scale: 0.82 }}
              onClick={() => assignRunning(task.id)}
              className="glass-btn btn-primary !h-12 !w-12 !p-0"
              aria-label={t('Assegna «{name}» a me', { name: task.name })}
              title={t('Assegna a me')}
            >
              <UserCheck size={22} strokeWidth={2.6} />
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.82 }}
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                finish(task.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
              }}
              className="glass-btn btn-primary !h-12 !w-12 !p-0"
              aria-label={t('Completa ora {name}', { name: task.name })}
            >
              <Check size={24} strokeWidth={3} />
            </motion.button>
          )}
        </span>
      ) : (
        <>
        {isOnDemand(task) && nextDue(task, roomId) === null && (
          <motion.button
            whileTap={{ scale: 0.82 }}
            onClick={() => { markTodo(task.id); try { navigator.vibrate?.(15) } catch { /* non supportato (iOS) */ } }}
            className="glass-btn !h-10 !w-10 shrink-0 !p-0 text-muted"
            aria-label={t('Segna «{name}» da fare', { name: task.name })}
            title={t('Segna da fare')}
          >
            <ClipboardList size={18} />
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            complete(task.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, roomId)
          }}
          className="glass-btn btn-primary !h-12 !w-12 shrink-0 !p-0"
          aria-label={task.durationMin ? t('Avvia {name}', { name: task.name }) : t('Completa {name}', { name: task.name })}
        >
          {task.durationMin ? <Play size={22} strokeWidth={2.6} className="fill-current" /> : <Check size={24} strokeWidth={3} />}
        </motion.button>
        </>
      )}
      </motion.div>
      {unassigned && (
        <div className="relative flex items-center gap-2 border-t border-line/60 bg-brand/10 px-3 py-2 text-xs font-semibold text-brand"><UserX size={13} className="shrink-0" />{t('Nessuno ci sta lavorando: assegnala a te per avere le stelle. Scorri a sinistra per completarla ora.')}</div>
      )}
      </div>
      {task.notes && (
        <button type="button" onClick={() => setNoteOpen((o) => !o)} aria-expanded={noteOpen}
          className={`flex w-full items-start gap-2 border-t border-line/60 px-3 py-2 text-left text-xs text-muted ${noteOpen ? '' : ''}`}>
          <StickyNote size={13} className="mt-0.5 shrink-0 text-brand" />
          <span className={noteOpen ? 'whitespace-pre-wrap' : 'line-clamp-1'}>{task.notes}</span>
        </button>
      )}
    </motion.div>
  )
}
