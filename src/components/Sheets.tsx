import { Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Assignment, RecurrenceType, Task } from '../types'
import { AVATARS, MEMBER_COLORS, ROOM_COLORS, ROOM_ICONS } from '../lib/demo'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { RoomIcon } from './icons'
import { Avatar, Segmented, Sheet, Stars } from './ui'

function DeleteButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [armed, setArmed] = useState(false)
  return (
    <button type="button" className="glass-btn btn-danger mt-6 w-full" onClick={() => (armed ? onConfirm() : setArmed(true))}>
      <Trash2 size={16} /> {armed ? 'Tocca ancora per confermare' : label}
    </button>
  )
}

/* ------------------------------ TASK ------------------------------ */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]
const WD_NAMES = ['D', 'L', 'M', 'M', 'G', 'V', 'S']

function TaskForm({ taskId, roomId, onClose }: { taskId?: string; roomId?: string; onClose: () => void }) {
  const { db, upsertTask, deleteTask } = useApp()
  const existing = db.tasks.find((t) => t.id === taskId)
  const [name, setName] = useState(existing?.name ?? '')
  const [room, setRoom] = useState(existing?.roomId ?? roomId ?? db.rooms[0]?.id ?? '')
  const [stars, setStars] = useState<Task['stars']>(existing?.stars ?? 2)
  const [type, setType] = useState<RecurrenceType>(existing?.recurrence.type ?? 'weekly')
  const [every, setEvery] = useState(existing?.recurrence.every ?? 1)
  const [weekdays, setWeekdays] = useState<number[]>(existing?.recurrence.weekdays ?? [])
  const [mode, setMode] = useState<Assignment['mode']>(existing?.assignment.mode ?? 'anyone')
  const [picked, setPicked] = useState<string[]>(
    existing?.assignment.mode === 'member' ? [existing.assignment.memberId]
      : existing?.assignment.mode === 'rotation' ? existing.assignment.memberIds : [],
  )

  const toggle = (id: string) => setPicked((p) => (mode === 'member' ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const unit = { once: '', daily: 'giorni', weekly: 'settimane', monthly: 'mesi' }[type]

  const save = () => {
    if (!name.trim() || !room) return
    let assignment: Assignment = { mode: 'anyone' }
    if (mode === 'member' && picked[0]) assignment = { mode: 'member', memberId: picked[0] }
    if (mode === 'rotation' && picked.length >= 2) assignment = { mode: 'rotation', memberIds: picked }
    upsertTask({
      id: existing?.id, roomId: room, name: name.trim(), stars, assignment,
      recurrence: { type, every: type === 'once' ? 1 : every, ...(type === 'weekly' && weekdays.length ? { weekdays } : {}) },
    })
    onClose()
  }

  return (
    <div>
      <label className="label">Nome</label>
      <input className="field" placeholder="Es. Pulire il forno" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />

      <label className="label">Stanza</label>
      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        {db.rooms.map((r) => (
          <button key={r.id} type="button" className={`chip ${room === r.id ? 'chip-active' : ''}`} onClick={() => setRoom(r.id)}><RoomIcon name={r.icon} size={14} />{r.name}</button>
        ))}
      </div>

      <label className="label">Difficoltà (stelle)</label>
      <div className="glass flex justify-center rounded-2xl py-1"><Stars value={stars} size={30} onChange={setStars} /></div>

      <label className="label">Ricorrenza</label>
      <Segmented<RecurrenceType> value={type} onChange={setType} options={[{ id: 'once', label: 'Singola' }, { id: 'daily', label: 'Giorni' }, { id: 'weekly', label: 'Sett.' }, { id: 'monthly', label: 'Mesi' }]} />
      {type !== 'once' && (
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-bg/60 px-4 py-2">
          <span className="font-medium">Ogni {every} {unit}</span>
          <span className="flex items-center gap-2">
            <button type="button" className="glass-btn !p-2" onClick={() => setEvery(Math.max(1, every - 1))}><Minus size={16} /></button>
            <button type="button" className="glass-btn !p-2" onClick={() => setEvery(Math.min(99, every + 1))}><Plus size={16} /></button>
          </span>
        </div>
      )}
      {type === 'weekly' && (
        <>
          <p className="mb-1.5 mt-3 px-1 text-xs text-muted">Giorni specifici (facoltativo)</p>
          <div className="flex justify-between gap-1">
            {WEEKDAYS.map((d) => (
              <button key={d} type="button" onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                className={`chip !h-10 !w-10 justify-center !p-0 ${weekdays.includes(d) ? 'chip-active' : ''}`}>{WD_NAMES[d]}</button>
            ))}
          </div>
        </>
      )}

      <label className="label">Assegnazione</label>
      <Segmented<Assignment['mode']> value={mode} onChange={(m) => { setMode(m); setPicked([]) }} options={[{ id: 'anyone', label: 'Libera' }, { id: 'member', label: 'Membro' }, { id: 'rotation', label: 'Rotazione' }]} />
      {mode !== 'anyone' && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {db.members.map((m) => (
              <button key={m.id} type="button" className={`chip ${picked.includes(m.id) ? 'chip-active' : ''}`} onClick={() => toggle(m.id)}><Avatar member={m} size={20} />{m.name}</button>
            ))}
          </div>
          {mode === 'rotation' && <p className="mt-2 px-1 text-xs text-muted">Scegli almeno 2 membri: il turno passa al successivo a ogni completamento.</p>}
        </>
      )}

      <button type="button" className="glass-btn btn-primary mt-6 w-full !py-3.5" onClick={save} disabled={!name.trim() || !room}>{existing ? 'Salva modifiche' : 'Crea azione'}</button>
      {existing && <DeleteButton label="Elimina azione" onConfirm={() => { deleteTask(existing.id); onClose() }} />}
    </div>
  )
}

export function TaskSheet() {
  const { taskSheet, openTaskSheet } = useUi()
  const close = () => openTaskSheet(null)
  return (
    <Sheet open={!!taskSheet} onClose={close} title={taskSheet?.id ? 'Modifica azione' : 'Nuova azione'}>
      {taskSheet && <TaskForm key={taskSheet.id ?? 'new'} taskId={taskSheet.id} roomId={taskSheet.roomId} onClose={close} />}
    </Sheet>
  )
}

/* ------------------------------ ROOM ------------------------------ */
function RoomForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { db, upsertRoom, deleteRoom } = useApp()
  const { roomId, openRoom } = useUi()
  const existing = db.rooms.find((r) => r.id === id)
  const [name, setName] = useState(existing?.name ?? '')
  const [icon, setIcon] = useState(existing?.icon ?? ROOM_ICONS[0])
  const [color, setColor] = useState(existing?.color ?? ROOM_COLORS[0])

  return (
    <div>
      <label className="label">Nome</label>
      <input className="field" placeholder="Es. Studio" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />
      <label className="label">Icona</label>
      <div className="grid grid-cols-6 gap-2">
        {ROOM_ICONS.map((i) => (
          <button key={i} type="button" onClick={() => setIcon(i)} className={`flex h-12 items-center justify-center rounded-2xl border transition active:scale-90 ${icon === i ? 'border-transparent text-white' : 'border-line bg-bg/60'}`} style={icon === i ? { background: color } : undefined}>
            <RoomIcon name={i} size={22} />
          </button>
        ))}
      </div>
      <label className="label">Colore</label>
      <div className="flex flex-wrap gap-3">
        {ROOM_COLORS.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={`h-10 w-10 rounded-full border-2 transition active:scale-90 ${color === c ? 'scale-110 border-surface ring-2 ring-brand' : 'border-surface'}`} style={{ background: c }} />
        ))}
      </div>
      <button type="button" className="glass-btn btn-primary mt-6 w-full !py-3.5" disabled={!name.trim()} onClick={() => { upsertRoom({ id: existing?.id, name: name.trim(), icon, color }); onClose() }}>
        {existing ? 'Salva modifiche' : 'Crea stanza'}
      </button>
      {existing && <DeleteButton label="Elimina stanza e azioni" onConfirm={() => { if (roomId === existing.id) openRoom(null); deleteRoom(existing.id); onClose() }} />}
    </div>
  )
}

export function RoomSheet() {
  const { roomSheet, openRoomSheet } = useUi()
  const close = () => openRoomSheet(null)
  return (
    <Sheet open={!!roomSheet} onClose={close} title={roomSheet?.id ? 'Modifica stanza' : 'Nuova stanza'}>
      {roomSheet && <RoomForm key={roomSheet.id ?? 'new'} id={roomSheet.id} onClose={close} />}
    </Sheet>
  )
}

/* ----------------------------- MEMBER ----------------------------- */
function MemberForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { db, upsertMember, deleteMember, setMeId, meId } = useApp()
  const existing = db.members.find((m) => m.id === id)
  const [name, setName] = useState(existing?.name ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')
  const [avatar, setAvatar] = useState(existing?.avatar ?? AVATARS[db.members.length % AVATARS.length])
  const [color, setColor] = useState(existing?.color ?? MEMBER_COLORS[db.members.length % MEMBER_COLORS.length])

  return (
    <div>
      <label className="label">Nome</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />
      <label className="label">Email Google (facoltativa)</label>
      <input className="field" type="email" inputMode="email" placeholder="nome@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="label">Avatar</label>
      <div className="grid grid-cols-5 gap-2">
        {AVATARS.map((a) => (
          <button key={a} type="button" onClick={() => setAvatar(a)} className={`flex h-12 items-center justify-center rounded-2xl border text-2xl transition active:scale-90 ${avatar === a ? 'border-transparent' : 'border-line bg-bg/60'}`} style={avatar === a ? { background: color } : undefined}>{a}</button>
        ))}
      </div>
      <label className="label">Colore</label>
      <div className="flex flex-wrap gap-3">
        {MEMBER_COLORS.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={`h-10 w-10 rounded-full border-2 transition active:scale-90 ${color === c ? 'scale-110 border-surface ring-2 ring-brand' : 'border-surface'}`} style={{ background: c }} />
        ))}
      </div>
      <button type="button" className="glass-btn btn-primary mt-6 w-full !py-3.5" disabled={!name.trim()} onClick={() => {
        const newId = upsertMember({ id: existing?.id, name: name.trim(), email: email.trim() || undefined, avatar, color })
        if (!meId) setMeId(newId)
        onClose()
      }}>{existing ? 'Salva modifiche' : 'Aggiungi membro'}</button>
      {existing && <DeleteButton label="Rimuovi membro" onConfirm={() => { deleteMember(existing.id); onClose() }} />}
    </div>
  )
}

export function MemberSheet() {
  const { memberSheet, openMemberSheet } = useUi()
  const close = () => openMemberSheet(null)
  return (
    <Sheet open={!!memberSheet} onClose={close} title={memberSheet?.id ? 'Modifica membro' : 'Nuovo membro'}>
      {memberSheet && <MemberForm key={memberSheet.id ?? 'new'} id={memberSheet.id} onClose={close} />}
    </Sheet>
  )
}

/* ------------------------ CHI SEI? (switcher) ------------------------ */
export function MemberSwitcher() {
  const { db, meId, setMeId } = useApp()
  const { switcherOpen, openSwitcher, resumePending, openMemberSheet } = useUi()
  return (
    <Sheet open={switcherOpen} onClose={() => openSwitcher(false)} title="Chi sei?">
      <p className="mb-3 text-sm text-muted">Le stelle vengono assegnate a chi completa l’azione.</p>
      <div className="space-y-2">
        {db.members.map((m) => (
          <button key={m.id} className={`glass flex w-full items-center gap-3 p-3 text-left transition active:scale-[0.98] ${meId === m.id ? 'ring-2 ring-brand' : ''}`} onClick={() => { setMeId(m.id); openSwitcher(false); resumePending(m.id) }}>
            <Avatar member={m} size={40} /><span className="font-bold">{m.name}</span>
          </button>
        ))}
        <button className="glass-btn w-full" onClick={() => { openSwitcher(false); openMemberSheet({}) }}><Plus size={16} /> Nuovo membro</button>
      </div>
    </Sheet>
  )
}
