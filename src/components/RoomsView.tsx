import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import { cleanColor, nextDue, roomCleanliness, urgencyOf } from '../lib/clean'
import { t } from '../i18n'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { Fab, NotificationBell } from './Chrome'
import { MascotImg, MascotPeek } from './Mascots'
import { RoomIcon } from './icons'
import { TaskRow } from './TaskRow'
import { isRunning } from '../lib/timers'
import { inRoom } from '../lib/rooms'
import { CleanBar, PageHeader } from './ui'

export function RoomsView() {
  const { roomId } = useUi()
  return roomId ? <RoomDetail /> : <RoomGrid />
}

function RoomGrid() {
  const { db } = useApp()
  const { openRoom, openRoomSheet } = useUi()
  const overall = db.rooms.length ? Math.round(db.rooms.reduce((s, r) => s + roomCleanliness(r, db.tasks), 0) / db.rooms.length) : 100

  return (
    <div>
      <PageHeader title={t('Stanze')} subtitle={t('Pulizia media della casa: {n}%', { n: overall })} right={<NotificationBell />} />
      <MascotPeek kind="mochi">
        <div className="grid grid-cols-2 gap-3">
          {db.rooms.map((r, i) => {
            const pct = roomCleanliness(r, db.tasks)
            const due = db.tasks.filter((x) => inRoom(x, r.id) && !isRunning(x) && ['overdue', 'today'].includes(urgencyOf(x, Date.now(), r.id))).length
            return (
              <motion.button
                key={r.id}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => openRoom(r.id)}
                className="card flex flex-col gap-3 p-4 text-left"
              >
                <span className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-inner" style={{ background: `linear-gradient(135deg, ${r.color}, ${r.color}99)` }}>
                    <RoomIcon name={r.icon} size={24} />
                  </span>
                  {due > 0 && <span className="rounded-full bg-exp/15 px-2 py-0.5 text-xs font-bold text-exp">{t('{n} da fare', { n: due })}</span>}
                </span>
                <span>
                  <span className="block text-lg font-bold leading-tight">{r.name}</span>
                  <span className="text-sm font-semibold" style={{ color: cleanColor(pct) }}>{t('{n}% pulita', { n: pct })}</span>
                </span>
                <CleanBar pct={pct} />
              </motion.button>
            )
          })}
          <button onClick={() => openRoomSheet({})} className="flex min-h-[10.5rem] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line text-muted transition active:scale-95">
            <Plus size={26} /><span className="text-sm font-semibold">{t('Aggiungi stanza')}</span>
          </button>
        </div>
      </MascotPeek>
    </div>
  )
}

function RoomDetail() {
  const { db } = useApp()
  const { roomId, openRoom, openRoomSheet, openTaskSheet } = useUi()
  const room = db.rooms.find((r) => r.id === roomId)
  if (!room) return null
  const pct = roomCleanliness(room, db.tasks)
  const tasks = db.tasks.filter((x) => inRoom(x, room.id) && !x.archived).sort((a, b) => (nextDue(a, room.id) ?? 8.64e15) - (nextDue(b, room.id) ?? 8.64e15))

  return (
    <div>
      <PageHeader
        title={room.name}
        left={<button className="glass-btn !p-2.5" onClick={() => openRoom(null)} aria-label={t('Indietro')}><ChevronLeft size={20} /></button>}
        right={<button className="glass-btn !p-2.5" onClick={() => openRoomSheet({ id: room.id })} aria-label={t('Modifica stanza')}><Pencil size={18} /></button>}
      />
      <MascotPeek kind="zenitsu" side="left">
        <div className="card flex items-center gap-4 p-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-white shadow-inner" style={{ background: `linear-gradient(135deg, ${room.color}, ${room.color}99)` }}>
            <RoomIcon name={room.icon} size={32} />
          </span>
          <div className="flex-1">
            <p className="text-3xl font-extrabold" style={{ color: cleanColor(pct) }}>{pct}%</p>
            <p className="mb-2 text-xs text-muted">{t('stato di pulizia')}</p>
            <CleanBar pct={pct} height={10} />
          </div>
        </div>
      </MascotPeek>
      <div className="mt-4 space-y-3">
        <AnimatePresence mode="popLayout">{tasks.map((x) => <TaskRow key={x.id} task={x} showRoom={false} roomId={room.id} />)}</AnimatePresence>
        {tasks.length === 0 && (
          <div className="card flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted">
            <MascotImg kind="mochi" className="h-16 w-auto" />{t('Nessuna azione in questa stanza.')}
          </div>
        )}
      </div>
      <Fab label={t('Nuova azione')} onClick={() => openTaskSheet({ roomId: room.id })} />
    </div>
  )
}
