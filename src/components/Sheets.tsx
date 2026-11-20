import { Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Assignment, RecurrenceType, Task } from '../types'
import { AVATARS, MEMBER_COLORS, ROOM_COLORS, ROOM_ICONS } from '../lib/demo'
import { t } from '../i18n'
import { weekdayShort } from '../lib/clean'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { RoomIcon, TASK_ICONS } from './icons'
import { canDependOn } from '../lib/deps'
import { lastFor, taskRooms } from '../lib/rooms'
import { timeAgo } from '../lib/stats'
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
  const [rooms, setRooms] = useState<string[]>(existing ? taskRooms(existing) : [roomId ?? db.rooms[0]?.id ?? ''])
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const room = rooms[0] ?? ''
  const { complete } = useUi()
  const [stars, setStars] = useState<Task['stars']>(existing?.stars ?? 2)
  const [type, setType] = useState<RecurrenceType>(existing?.recurrence.type ?? 'weekly')
  const [every, setEvery] = useState(existing?.recurrence.every ?? 1)
  const [weekdays, setWeekdays] = useState<number[]>(existing?.recurrence.weekdays ?? [])
  const [mode, setMode] = useState<Assignment['mode']>(existing?.assignment.mode ?? 'anyone')
  const [icon, setIcon] = useState<string | null>(existing?.icon ?? null)
  const [afterId, setAfterId] = useState<string | null>(existing?.afterTaskId ?? null)
  const eventId = existing?.onEvent ?? null
  const eventName = eventId ? (db.automations ?? []).find((a) => a.id === eventId)?.name ?? '…' : null
  const [duration, setDuration] = useState<number | null>(existing?.durationMin ?? null)
  const [picked, setPicked] = useState<string[]>(
    existing?.assignment.mode === 'member' ? [existing.assignment.memberId]
      : existing?.assignment.mode === 'rotation' ? existing.assignment.memberIds : [],
  )

  const roomColor = db.rooms.find((r) => r.id === room)?.color ?? '#c9692a'
  const options = db.tasks.filter((x) => !x.archived && x.id !== existing?.id && canDependOn(db.tasks, existing?.id, x.id))
  const toggle = (id: string) => setPicked((p) => (mode === 'member' ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const unit = { once: '', daily: t('giorni'), weekly: t('settimane'), monthly: t('mesi') }[type]

  const save = () => {
    if (!name.trim() || !room) return
    let assignment: Assignment = { mode: 'anyone' }
    if (mode === 'member' && picked[0]) assignment = { mode: 'member', memberId: picked[0] }
    if (mode === 'rotation' && picked.length >= 2) assignment = { mode: 'rotation', memberIds: picked }
    upsertTask({
      id: existing?.id, roomId: room, roomIds: rooms.length > 1 ? rooms : undefined, name: name.trim(), notes: notes.trim() || undefined, stars, assignment,
      onEvent: eventId ?? undefined,
      recurrence: afterId !== null || eventId ? { type: 'daily', every: 1 } : { type, every: type === 'once' ? 1 : every, ...(type === 'weekly' && weekdays.length ? { weekdays } : {}) },
      icon: icon ?? undefined,
      afterTaskId: afterId ?? undefined,
      durationMin: duration ? Math.min(MAX_DURATION_MIN, Math.max(1, Math.round(duration))) : undefined,
    })
    onClose()
  }

  return (
    <div>
      <label className="label">{t('Nome')}</label>
      <input className="field" placeholder={t('Es. Pulire il forno')} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />

      <label className="label">{t('Note')}</label>
      <textarea className="field min-h-[5rem] resize-y" rows={3} maxLength={2000} placeholder={t('Istruzioni: come si fa, quando farla…')} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <label className="label">{rooms.length > 1 ? t('Stanze') : t('Stanza')}</label>
      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        {db.rooms.map((r) => {
          const on = rooms.includes(r.id)
          // si possono scegliere più stanze; la prima scelta è quella principale. Almeno una resta sempre.
          return (
            <button key={r.id} type="button" className={`chip ${on ? 'chip-active' : ''}`} aria-pressed={on}
              onClick={() => setRooms((cur) => (on ? (cur.length > 1 ? cur.filter((x) => x !== r.id) : cur) : [...cur, r.id]))}>
              <RoomIcon name={r.icon} size={14} />{r.name}
            </button>
          )
        })}
      </div>
      {rooms.length > 1 && <p className="mt-1.5 px-1 text-xs text-muted">{t('Con più stanze, «completa» dalla pagina Oggi vale per tutte; dalla singola stanza solo per quella. Le stelle sono sempre quelle dell’azione.')}</p>}
      {existing && rooms.length > 1 && taskRooms(existing).length > 1 && (
        <div className="mt-2 rounded-2xl border border-line bg-bg/60 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('Completa per stanza')}</p>
          <ul className="space-y-2">
            {taskRooms(existing).filter((rid) => rooms.includes(rid)).map((rid) => {
              const r = db.rooms.find((x) => x.id === rid)
              if (!r) return null
              const last = lastFor(existing, rid)
              return (
                <li key={rid} className="flex items-center gap-2">
                  <RoomIcon name={r.icon} size={16} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                  <span className="text-xs text-muted">{last ? timeAgo(last) : t('mai')}</span>
                  <button type="button" className="glass-btn !px-3 !py-1.5 text-xs" onClick={() => { complete(existing.id, undefined, rid); onClose() }}>{t('Completa')}</button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <label className="label">{t('Difficoltà (stelle)')}</label>
      <div className="glass flex justify-center rounded-2xl py-1"><Stars value={stars} size={30} onChange={setStars} /></div>

      <label className="label">{t('Icona')}</label>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" className={`chip !px-2.5 ${icon === null ? 'chip-active' : ''}`} onClick={() => setIcon(null)}>{t('Come la stanza')}</button>
      </div>
      <div className="mt-2 grid grid-cols-6 gap-2">
        {TASK_ICONS.map((i) => (
          <button key={i} type="button" aria-label={i} onClick={() => setIcon(i)} className={`flex h-11 items-center justify-center rounded-2xl border transition active:scale-90 ${icon === i ? 'border-transparent text-white' : 'border-line bg-bg/60'}`} style={icon === i ? { background: roomColor } : undefined}>
            <RoomIcon name={i} size={20} />
          </button>
        ))}
      </div>

      {!eventId && (
        <>
      <label className="label">{t('Quando parte')}</label>
      <div className="rounded-2xl border border-line bg-bg/60 p-3">
        <Toggle checked={afterId !== null} onChange={(v) => setAfterId(v ? options[0]?.id ?? null : null)} label={t('Dopo un’altra azione')} hint={options.length === 0 && afterId === null ? t('Crea prima un’altra azione da cui dipendere.') : t('Resta in attesa e va tra le cose da fare quando l’altra è completata (o, se a tempo, finita).')} />
        {afterId !== null && (
          <select className="field mt-2" value={afterId} onChange={(e) => setAfterId(e.target.value)} aria-label={t('Azione precedente')}>
            {options.map((o) => <option key={o.id} value={o.id}>{`${db.rooms.find((r) => r.id === o.roomId)?.name ?? ''} · ${o.name}`}</option>)}
          </select>
        )}
      </div>

        </>
      )}
      {eventName && <p className="mt-2 rounded-xl bg-brand/10 p-3 text-sm text-brand">{t('Parte quando lo segnala il dispositivo «{name}» (si gestisce da Impostazioni → Automazioni).', { name: eventName })}</p>}
      {afterId === null && !eventId && (
        <>
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
