import { BarChart3, Crown, Gift, History, Star, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DAY } from '../lib/clean'
import { monthStart, starsSince, timeAgo, weekStart, weeklySeries } from '../lib/stats'
import { locale, t } from '../i18n'
import { useApp } from '../store/AppContext'
import { MeChip, NotificationBell, SyncPill } from './Chrome'
import { MascotPeek } from './Mascots'
import { RoomIcon } from './icons'
import { Accordion, Avatar, CleanBar, PageHeader, Segmented } from './ui'

type Period = 'week' | 'month'
type Section = 'goal' | 'weeks' | 'history'
const OPEN_KEY = 'cleanduo:rankingOpen'
const loadOpen = (): Partial<Record<Section, boolean>> => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{"goal":true}') } catch { return {} } }

export function RankingView() {
  const { db } = useApp()
  const [period, setPeriod] = useState<Period>('week')
  const [open, setOpen] = useState(loadOpen)
  const flip = (k: Section) => setOpen((o) => { const n = { ...o, [k]: !o[k] }; try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)) } catch { /* noop */ } return n })

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
      <PageHeader title={t('Sfida')} subtitle={t('Chi tiene più in ordine la casa?')} right={<><SyncPill /><NotificationBell /><MeChip /></>} />

      <Segmented<Period> value={period} onChange={setPeriod} options={[{ id: 'week', label: t('Questa settimana') }, { id: 'month', label: t('Questo mese') }]} />

      <MascotPeek kind="zenitsu" side="left">
        <div className="card space-y-4 p-4">
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
          {ranked.length === 0 && <p className="text-center text-sm text-muted">{t('Aggiungi i membri della casa dalle impostazioni.')}</p>}
        </div>
      </MascotPeek>

      {db.settings.prize && (
        <div className="card mt-4 flex items-center gap-4 p-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-3xl">{db.settings.prizeEmoji || '🏆'}</span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted"><Gift size={13} /> {t('Premio del mese')}</p>
            <p className="font-bold leading-tight">{db.settings.prize}</p>
            <p className="mt-0.5 text-xs text-muted">
              {monthLeader && monthLeaderStars > 0 ? <>{t('In testa:')} <b>{monthLeader.name}</b> ({monthLeaderStars} ⭐) · </> : null}
              {daysLeft === 1 ? t('1 giorno alla fine') : t('{n} giorni alla fine', { n: daysLeft })}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <Accordion title={t('Obiettivo settimanale')} icon={<Target size={20} />} open={!!open.goal} onToggle={() => flip('goal')} summary={t('Squadra {a}/{b} ⭐', { a: teamTotal, b: teamGoal })}>
          <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{t('Squadra')}</span><span>{teamTotal}/{teamGoal} ⭐</span></div>
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
        </Accordion>

        <Accordion title={t('Ultime 6 settimane')} icon={<BarChart3 size={20} />} open={!!open.weeks} onToggle={() => flip('weeks')} summary={t('Confronto tra i membri')}>
          <div className="flex h-32 items-end justify-between gap-2">
            {series.map((w, i) => (
              <div key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  {db.members.map((m) => (
                    <div key={m.id} className="w-full max-w-3 rounded-t-md transition-all duration-700" style={{ height: `${Math.max(((w.per[m.id] ?? 0) / seriesMax) * 100, w.per[m.id] ? 4 : 0)}%`, background: m.color }} title={`${m.name}: ${w.per[m.id] ?? 0}`} />
                  ))}
                </div>
                <span className="text-[10px] text-muted">{i === series.length - 1 ? t('ora') : new Date(w.start).toLocaleDateString(locale(), { day: 'numeric', month: 'numeric' })}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {db.members.map((m) => <span key={m.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />{m.name}</span>)}
          </div>
        </Accordion>

        <Accordion title={t('Attività recenti')} icon={<History size={20} />} open={!!open.history} onToggle={() => flip('history')} summary={db.logs[0] ? `${db.members.find((x) => x.id === db.logs[0].memberId)?.name ?? ''} · ${db.logs[0].taskName}` : t('Nessuna attività ancora')}>
          <div className="-mx-4 -my-4 divide-y divide-line/70">
            {db.logs.slice(0, 25).map((l) => {
              const m = db.members.find((x) => x.id === l.memberId)
              const r = db.rooms.find((x) => x.id === l.roomId)
              return (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar member={m} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t('{who} ha completato {task}', { who: m?.name ?? t('Ex membro'), task: l.taskName })}</p>
                    <p className="flex items-center gap-1 text-xs text-muted">{r && <RoomIcon name={r.icon} size={11} />}{r?.name ?? t('Stanza rimossa')} · {timeAgo(l.at)}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-0.5 text-sm font-bold">+{l.stars}<Star size={13} className="fill-brand text-brand" /></span>
                </div>
              )
            })}
            {db.logs.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">{t('Nessuna attività ancora: completa la prima azione!')}</p>}
          </div>
        </Accordion>
      </div>
    </div>
  )
}
