import { Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Assignment, RecurrenceType, Task } from '../types'
import { AVATARS, MEMBER_COLORS, ROOM_COLORS, ROOM_ICONS } from '../lib/demo'
import { t } from '../i18n'
import { weekdayShort } from '../lib/clean'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { RoomIcon } from './icons'
import { DURATION_PRESETS, MAX_DURATION_MIN, durationLabel } from '../lib/timers'
import { Avatar, Segmented, Sheet, Stars, Toggle } from './ui'

function DeleteButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [armed, setArmed] = useState(false)
  return (
    <button type="button" className="glass-btn btn-danger mt-6 w-full" onClick={() => (armed ? onConfirm() : setArmed(true))}>
      <Trash2 size={16} /> {armed ? t('Tocca ancora per confermare') : label}
    </button>
  )
}

/* ------------------------------ TASK ------------------------------ */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]

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
  const [duration, setDuration] = useState<number | null>(existing?.durationMin ?? null)
  const [picked, setPicked] = useState<string[]>(
    existing?.assignment.mode === 'member' ? [existing.assignment.memberId]
      : existing?.assignment.mode === 'rotation' ? existing.assignment.memberIds : [],
  )

  const toggle = (id: string) => setPicked((p) => (mode === 'member' ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const unit = { once: '', daily: t('giorni'), weekly: t('settimane'), monthly: t('mesi') }[type]

  const save = () => {
    if (!name.trim() || !room) return
    let assignment: Assignment = { mode: 'anyone' }
    if (mode === 'member' && picked[0]) assignment = { mode: 'member', memberId: picked[0] }
    if (mode === 'rotation' && picked.length >= 2) assignment = { mode: 'rotation', memberIds: picked }
    upsertTask({
      id: existing?.id, roomId: room, name: name.trim(), stars, assignment,
      recurrence: { type, every: type === 'once' ? 1 : every, ...(type === 'weekly' && weekdays.length ? { weekdays } : {}) },
      durationMin: duration ? Math.min(MAX_DURATION_MIN, Math.max(1, Math.round(duration))) : undefined,
    })
    onClose()
  }

  return (
    <div>
      <label className="label">{t('Nome')}</label>
      <input className="field" placeholder={t('Es. Pulire il forno')} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />

      <label className="label">{t('Stanza')}</label>
      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        {db.rooms.map((r) => (
          <button key={r.id} type="button" className={`chip ${room === r.id ? 'chip-active' : ''}`} onClick={() => setRoom(r.id)}><RoomIcon name={r.icon} size={14} />{r.name}</button>
        ))}
      </div>

      <label className="label">{t('Difficoltà (stelle)')}</label>
      <div className="glass flex justify-center rounded-2xl py-1"><Stars value={stars} size={30} onChange={setStars} /></div>

      <label className="label">{t('Ricorrenza')}</label>
      <Segmented<RecurrenceType> value={type} onChange={setType} options={[{ id: 'once', label: t('Singola') }, { id: 'daily', label: t('Giorni') }, { id: 'weekly', label: t('Sett.') }, { id: 'monthly', label: t('Mesi') }]} />
      {type !== 'once' && (
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-bg/60 px-4 py-2">
          <span className="font-medium">{t('Ogni {n} {unit}', { n: every, unit })}</span>
          <span className="flex items-center gap-2">
            <button type="button" className="glass-btn !p-2" onClick={() => setEvery(Math.max(1, every - 1))}><Minus size={16} /></button>
            <button type="button" className="glass-btn !p-2" onClick={() => setEvery(Math.min(99, every + 1))}><Plus size={16} /></button>
          </span>
        </div>
      )}
      {type === 'weekly' && (
        <>
          <p className="mb-1.5 mt-3 px-1 text-xs text-muted">{t('Giorni specifici (facoltativo)')}</p>
          <div className="flex justify-between gap-1">
            {WEEKDAYS.map((d) => (
              <button key={d} type="button" onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                className={`chip !h-10 !w-10 justify-center !p-0 ${weekdays.includes(d) ? 'chip-active' : ''}`}>{weekdayShort(d).slice(0, 1).toUpperCase()}</button>
            ))}
          </div>
        </>
      )}

      <label className="label">{t('Durata')}</label>
      <div className="rounded-2xl border border-line bg-bg/60 p-3">
        <Toggle checked={duration !== null} onChange={(v) => setDuration(v ? 60 : null)} label={t('Azione con durata')} hint={t('Il tap la avvia: resta «in corso» e si completa da sola alla fine, avvisando tutti.')} />
        {duration !== null && (
          <>
            <div className="mt-2 flex flex-wrap gap-2">
              {DURATION_PRESETS.map((m) => <button key={m} type="button" className={`chip ${duration === m ? 'chip-active' : ''}`} onClick={() => setDuration(m)}>{durationLabel(m)}</button>)}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <label htmlFor="duration-min" className="text-sm font-medium">{t('Minuti')}</label>
              <input id="duration-min" type="number" inputMode="numeric" min={1} max={MAX_DURATION_MIN} className="field !w-28 text-right" value={duration}
                onChange={(e) => setDuration(e.target.value === '' ? 1 : Math.min(MAX_DURATION_MIN, Math.max(1, Number(e.target.value))))} />
            </div>
          </>
        )}
      </div>

      <label className="label">{t('Assegnazione')}</label>
      <Segmented<Assignment['mode']> value={mode} onChange={(m) => { setMode(m); setPicked([]) }} options={[{ id: 'anyone', label: t('Libera') }, { id: 'member', label: t('Membro') }, { id: 'rotation', label: t('Rotazione') }]} />
      {mode !== 'anyone' && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {db.members.map((m) => (
              <button key={m.id} type="button" className={`chip ${picked.includes(m.id) ? 'chip-active' : ''}`} onClick={() => toggle(m.id)}><Avatar member={m} size={20} />{m.name}</button>
            ))}
          </div>
          {mode === 'rotation' && <p className="mt-2 px-1 text-xs text-muted">{t('Scegli almeno 2 membri: il turno passa al successivo a ogni completamento.')}</p>}
        </>
      )}

      <button type="button" className="glass-btn btn-primary mt-6 w-full !py-3.5" onClick={save} disabled={!name.trim() || !room}>{existing ? t('Salva modifiche') : t('Crea azione')}</button>
      {existing && <DeleteButton label={t('Elimina azione')} onConfirm={() => { deleteTask(existing.id); onClose() }} />}
    </div>
  )
}

export function TaskSheet() {
  const { taskSheet, openTaskSheet } = useUi()
  const close = () => openTaskSheet(null)
  return (
    <Sheet open={!!taskSheet} onClose={close} title={taskSheet?.id ? t('Modifica azione') : t('Nuova azione')}>
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
      <label className="label">{t('Nome')}</label>
      <input className="field" placeholder={t('Es. Studio')} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />
      <label className="label">{t('Icona')}</label>
      <div className="grid grid-cols-6 gap-2">
        {ROOM_ICONS.map((i) => (
          <button key={i} type="button" onClick={() => setIcon(i)} className={`flex h-12 items-center justify-center rounded-2xl border transition active:scale-90 ${icon === i ? 'border-transparent text-white' : 'border-line bg-bg/60'}`} style={icon === i ? { background: color } : undefined}>
            <RoomIcon name={i} size={22} />
          </button>
        ))}
      </div>
      <label className="label">{t('Colore')}</label>
      <div className="flex flex-wrap gap-3">
        {ROOM_COLORS.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={`h-10 w-10 rounded-full border-2 transition active:scale-90 ${color === c ? 'scale-110 border-surface ring-2 ring-brand' : 'border-surface'}`} style={{ background: c }} />
        ))}
      </div>
      <button type="button" className="glass-btn btn-primary mt-6 w-full !py-3.5" disabled={!name.trim()} onClick={() => { upsertRoom({ id: existing?.id, name: name.trim(), icon, color }); onClose() }}>
        {existing ? t('Salva modifiche') : t('Crea stanza')}
      </button>
      {existing && <DeleteButton label={t('Elimina stanza e azioni')} onConfirm={() => { if (roomId === existing.id) openRoom(null); deleteRoom(existing.id); onClose() }} />}
    </div>
  )
}

export function RoomSheet() {
  const { roomSheet, openRoomSheet } = useUi()
  const close = () => openRoomSheet(null)
  return (
    <Sheet open={!!roomSheet} onClose={close} title={roomSheet?.id ? t('Modifica stanza') : t('Nuova stanza')}>
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
      <label className="label">{t('Nome')}</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />
      <label className="label">{t('Email Google (facoltativa)')}</label>
      <input className="field" type="email" inputMode="email" placeholder="nome@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="mt-1 px-1 text-xs text-muted">{t('L’email serve a ricevere le notifiche anche con l’app chiusa.')}</p>
      <label className="label">{t('Avatar')}</label>
      <div className="grid grid-cols-5 gap-2">
        {AVATARS.map((a) => (
          <button key={a} type="button" onClick={() => setAvatar(a)} className={`flex h-12 items-center justify-center rounded-2xl border text-2xl transition active:scale-90 ${avatar === a ? 'border-transparent' : 'border-line bg-bg/60'}`} style={avatar === a ? { background: color } : undefined}>{a}</button>
        ))}
      </div>
      <label className="label">{t('Colore')}</label>
      <div className="flex flex-wrap gap-3">
        {MEMBER_COLORS.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={`h-10 w-10 rounded-full border-2 transition active:scale-90 ${color === c ? 'scale-110 border-surface ring-2 ring-brand' : 'border-surface'}`} style={{ background: c }} />
        ))}
      </div>
      <button type="button" className="glass-btn btn-primary mt-6 w-full !py-3.5" disabled={!name.trim()} onClick={() => {
        const newId = upsertMember({ id: existing?.id, name: name.trim(), email: email.trim() || undefined, avatar, color })
        if (!meId) setMeId(newId)
        onClose()
      }}>{existing ? t('Salva modifiche') : t('Aggiungi membro')}</button>
      {existing && <DeleteButton label={t('Rimuovi membro')} onConfirm={() => { deleteMember(existing.id); onClose() }} />}
    </div>
  )
}

export function MemberSheet() {
  const { memberSheet, openMemberSheet } = useUi()
  const close = () => openMemberSheet(null)
  return (
    <Sheet open={!!memberSheet} onClose={close} title={memberSheet?.id ? t('Modifica membro') : t('Nuovo membro')}>
      {memberSheet && <MemberForm key={memberSheet.id ?? 'new'} id={memberSheet.id} onClose={close} />}
    </Sheet>
  )
}

/* ------------------------ CHI SEI? (switcher) ------------------------ */
export function MemberSwitcher() {
  const { db, meId, setMeId } = useApp()
  const { switcherOpen, openSwitcher, resumePending, openMemberSheet } = useUi()
  return (
    <Sheet open={switcherOpen} onClose={() => openSwitcher(false)} title={t('Chi sei?')}>
      <p className="mb-3 text-sm text-muted">{t('Le stelle vengono assegnate a chi completa l’azione.')}</p>
      <div className="space-y-2">
        {db.members.map((m) => (
          <button key={m.id} className={`glass flex w-full items-center gap-3 p-3 text-left transition active:scale-[0.98] ${meId === m.id ? 'ring-2 ring-brand' : ''}`} onClick={() => { setMeId(m.id); openSwitcher(false); resumePending(m.id) }}>
            <Avatar member={m} size={40} /><span className="font-bold">{m.name}</span>
          </button>
        ))}
        <button className="glass-btn w-full" onClick={() => { openSwitcher(false); openMemberSheet({}) }}><Plus size={16} /> {t('Nuovo membro')}</button>
      </div>
    </Sheet>
  )
}
