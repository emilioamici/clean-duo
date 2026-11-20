import { Crown, Gift, Star, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DAY } from '../lib/clean'
import { monthStart, starsSince, timeAgo, weekStart, weeklySeries } from '../lib/stats'
import { useApp } from '../store/AppContext'
import { RoomIcon } from './icons'
import { MeChip, SyncPill } from './Chrome'
import { Avatar, CleanBar, PageHeader, Segmented } from './ui'

type Period = 'week' | 'month'

export function RankingView() {
  const { db } = useApp()
  const [period, setPeriod] = useState<Period>('week')

  const since = period === 'week' ? weekStart() : monthStart()
  const stars = useMemo(() => starsSince(db.logs, since), [db.logs, since])
  const weekStars = useMemo(() => starsSince(db.logs, weekStart()), [db.logs])
  const monthStars = useMemo(() => starsSince(db.logs, monthStart()), [db.logs])
  const ranked = [...db.members].sort((a, b) => (stars[b.id] ?? 0) - (stars[a.id] ?? 0))
  const max = Math.max(1, ...ranked.map((m) => stars[m.id] ?? 0))

  const goal = db.settings.weeklyGoal || 1
  const teamTotal = db.members.reduce((s, m) => s + (weekStars[m.id] ?? 0), 0)
  const teamGoal = goal * Math.max(1, db.members.length)

  const monthLeader = [...db.members].sort((a, b) => (monthStars[b.id] ?? 0) - (monthStars[a.id] ?? 0))[0]
  const monthLeaderStars = monthLeader ? monthStars[monthLeader.id] ?? 0 : 0
  const daysLeft = Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime() - Date.now()) / DAY)

  const series = useMemo(() => weeklySeries(db, 6), [db])
  const seriesMax = Math.max(1, ...series.flatMap((w) => Object.values(w.per)))

  return (
    <div>
      <PageHeader title="Sfida" subtitle="Chi tiene più in ordine la casa?" right={<><SyncPill /><MeChip /></>} />

      <Segmented<Period> value={period} onChange={setPeriod} options={[{ id: 'week', label: 'Questa settimana' }, { id: 'month', label: 'Questo mese' }]} />

      <div className="glass mt-4 space-y-4 p-4">
        {ranked.map((m, i) => {
          const v = stars[m.id] ?? 0
          return (
            <div key={m.id}>
              <div className="mb-1.5 flex items-center gap-3">
                <span className="relative">
                  <Avatar member={m} size={40} />
                  {i === 0 && v > 0 && <Crown size={16} className="absolute -right-1 -top-2.5 rotate-12 fill-brand text-brand" />}
                </span>
                <span className="flex-1 font-bold">{m.name}</span>
                <span className="flex items-center gap-1 text-lg font-extrabold">{v}<Star size={16} className="fill-brand text-brand" /></span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(v / max) * 100}%`, background: `linear-gradient(90deg, ${m.color}, ${m.color}bb)` }} />
              </div>
            </div>
          )
        })}
        {ranked.length === 0 && <p className="text-center text-sm text-muted">Aggiungi i membri della casa dalle impostazioni.</p>}
      </div>

      {/* Obiettivi */}
      <div className="glass mt-4 p-4">
        <h3 className="mb-3 flex items-center gap-2 font-bold"><Target size={18} className="text-brand" /> Obiettivo settimanale</h3>
        <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">Squadra</span><span>{teamTotal}/{teamGoal} ⭐</span></div>
        <CleanBar pct={Math.min(100, (teamTotal / teamGoal) * 100)} height={10} />
        <div className="mt-4 space-y-2.5">
          {db.members.map((m) => {
            const v = weekStars[m.id] ?? 0
            return (
              <div key={m.id} className="flex items-center gap-2.5">
                <Avatar member={m} size={24} />
                <div className="flex-1"><CleanBar pct={Math.min(100, (v / goal) * 100)} /></div>
                <span className="w-14 text-right text-xs font-semibold text-muted">{v}/{goal}{v >= goal ? ' ✅' : ''}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Premio */}
      {db.settings.prize && (
        <div className="glass mt-4 flex items-center gap-4 p-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-3xl">{db.settings.prizeEmoji || '🏆'}</span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted"><Gift size={13} /> Premio del mese</p>
            <p className="font-bold leading-tight">{db.settings.prize}</p>
            <p className="mt-0.5 text-xs text-muted">
              {monthLeader && monthLeaderStars > 0 ? <>In testa: <b>{monthLeader.name}</b> ({monthLeaderStars} ⭐) · </> : null}
              {daysLeft} {daysLeft === 1 ? 'giorno' : 'giorni'} alla fine
            </p>
          </div>
        </div>
      )}

      {/* Confronto settimane */}
      <div className="glass mt-4 p-4">
        <h3 className="mb-3 font-bold">Ultime 6 settimane</h3>
        <div className="flex h-32 items-end justify-between gap-2">
          {series.map((w, i) => (
            <div key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                {db.members.map((m) => (
                  <div key={m.id} className="w-full max-w-3 rounded-t-md transition-all duration-700" style={{ height: `${Math.max(((w.per[m.id] ?? 0) / seriesMax) * 100, w.per[m.id] ? 4 : 0)}%`, background: m.color }} title={`${m.name}: ${w.per[m.id] ?? 0}`} />
                ))}
              </div>
              <span className="text-[10px] text-muted">{i === series.length - 1 ? 'ora' : new Date(w.start).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' })}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {db.members.map((m) => <span key={m.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />{m.name}</span>)}
        </div>
      </div>

      {/* Storico */}
      <h3 className="mb-2 mt-6 px-1 text-lg font-bold">Attività recenti</h3>
      <div className="glass divide-y divide-line/70 overflow-hidden">
        {db.logs.slice(0, 25).map((l) => {
          const m = db.members.find((x) => x.id === l.memberId)
          const r = db.rooms.find((x) => x.id === l.roomId)
          return (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar member={m} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm"><b>{m?.name ?? 'Ex membro'}</b> ha completato <b>{l.taskName}</b></p>
                <p className="flex items-center gap-1 text-xs text-muted">{r && <RoomIcon name={r.icon} size={11} />}{r?.name ?? 'Stanza rimossa'} · {timeAgo(l.at)}</p>
              </div>
              <span className="flex shrink-0 items-center gap-0.5 text-sm font-bold">+{l.stars}<Star size={13} className="fill-brand text-brand" /></span>
            </div>
          )
        })}
        {db.logs.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Nessuna attività ancora: completa la prima azione!</p>}
      </div>
    </div>
  )
}
