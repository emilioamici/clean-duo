import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import { nextDue, roomCleanliness, urgencyOf, cleanColor } from '../lib/clean'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { RoomIcon } from './icons'
import { TaskRow } from './TaskRow'
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
      <PageHeader title="Stanze" subtitle={`Pulizia media della casa: ${overall}%`} right={<button className="glass-btn !p-2.5" aria-label="Nuova stanza" onClick={() => openRoomSheet({})}><Plus size={20} /></button>} />
      <div className="grid grid-cols-2 gap-3">
        {db.rooms.map((r, i) => {
          const pct = roomCleanliness(r, db.tasks)
          const due = db.tasks.filter((t) => t.roomId === r.id && ['overdue', 'today'].includes(urgencyOf(t))).length
          return (
            <motion.button
              key={r.id}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => openRoom(r.id)}
              className="glass flex flex-col gap-3 p-4 text-left"
            >
              <span className="flex items-start justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-inner" style={{ background: `linear-gradient(135deg, ${r.color}, ${r.color}99)` }}>
                  <RoomIcon name={r.icon} size={24} />
                </span>
                {due > 0 && <span className="rounded-full bg-exp/15 px-2 py-0.5 text-xs font-bold text-exp">{due} da fare</span>}
              </span>
              <span>
                <span className="block text-lg font-bold leading-tight">{r.name}</span>
                <span className="text-sm font-semibold" style={{ color: cleanColor(pct) }}>{pct}% pulita</span>
              </span>
              <CleanBar pct={pct} />
            </motion.button>
          )
        })}
        <button onClick={() => openRoomSheet({})} className="flex min-h-[10.5rem] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line text-muted transition active:scale-95">
          <Plus size={26} /><span className="text-sm font-semibold">Aggiungi stanza</span>
        </button>
      </div>
    </div>
  )
}

function RoomDetail() {
  const { db } = useApp()
  const { roomId, openRoom, openRoomSheet, openTaskSheet } = useUi()
  const room = db.rooms.find((r) => r.id === roomId)
  if (!room) return null
  const pct = roomCleanliness(room, db.tasks)
  const tasks = db.tasks.filter((t) => t.roomId === room.id && !t.archived).sort((a, b) => (nextDue(a) ?? 0) - (nextDue(b) ?? 0))
  const archived = db.tasks.filter((t) => t.roomId === room.id && t.archived).length

  return (
    <div>
      <PageHeader
        title={room.name}
        left={<button className="glass-btn !p-2.5" onClick={() => openRoom(null)} aria-label="Indietro"><ChevronLeft size={20} /></button>}
        right={<button className="glass-btn !p-2.5" onClick={() => openRoomSheet({ id: room.id })} aria-label="Modifica stanza"><Pencil size={18} /></button>}
      />
      <div className="glass mb-4 flex items-center gap-4 p-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-white shadow-inner" style={{ background: `linear-gradient(135deg, ${room.color}, ${room.color}99)` }}>
          <RoomIcon name={room.icon} size={32} />
        </span>
        <div className="flex-1">
          <p className="text-3xl font-extrabold" style={{ color: cleanColor(pct) }}>{pct}%</p>
          <p className="mb-2 text-xs text-muted">stato di pulizia</p>
          <CleanBar pct={pct} height={10} />
        </div>
      </div>
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">{tasks.map((t) => <TaskRow key={t.id} task={t} showRoom={false} />)}</AnimatePresence>
        {tasks.length === 0 && <p className="glass px-4 py-8 text-center text-sm text-muted">Nessuna azione in questa stanza.</p>}
      </div>
      {archived > 0 && <p className="mt-3 text-center text-xs text-muted">{archived} azioni una tantum completate in archivio</p>}
      <button onClick={() => openTaskSheet({ roomId: room.id })} className="glass-btn btn-primary mt-4 w-full !py-3.5"><Plus size={18} /> Nuova azione</button>
    </div>
  )
}
