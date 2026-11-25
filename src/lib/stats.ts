import type { ActivityLog, AppDatabase } from '../types'
import { DAY, startOfMonth, startOfWeek } from './clean'
import { locale, t } from '../i18n'

export const round1 = (n: number): number => Math.round(n * 10) / 10

/** Chi ha contribuito a un completamento: chi l'ha fatto e gli altri indicati (senza doppioni), con le stelle in parti uguali. */
export function starShares(l: Pick<ActivityLog, 'memberId' | 'stars' | 'with'>): Array<[string, number]> {
  if (!l.memberId) return []
  const others = [...new Set((l.with ?? []).filter((id) => id && id !== l.memberId))]
  const each = l.stars / (1 + others.length)
  return [[l.memberId, each], ...others.map((id): [string, number] => [id, each])]
}

export function starsSince(logs: ActivityLog[], since: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of logs) if (l.at >= since) for (const [id, s] of starShares(l)) out[id] = (out[id] ?? 0) + s
  for (const id of Object.keys(out)) out[id] = round1(out[id])
  return out
}

export const weekStart = () => startOfWeek(Date.now())
export const monthStart = () => startOfMonth(Date.now())

/** Stelle per membro nelle ultime n settimane (la più vecchia per prima). */
export function weeklySeries(db: AppDatabase, weeks = 6) {
  const cur = startOfWeek(Date.now())
  return Array.from({ length: weeks }, (_, i) => {
    const start = cur - (weeks - 1 - i) * 7 * DAY
    const end = start + 7 * DAY
    const per: Record<string, number> = {}
    for (const l of db.logs) if (l.at >= start && l.at < end) for (const [id, s] of starShares(l)) per[id] = (per[id] ?? 0) + s
    for (const id of Object.keys(per)) per[id] = round1(per[id])
    return { start, per }
  })
}

export function timeAgo(ts: number, now = Date.now()): string {
  const m = Math.round((now - ts) / 60_000)
  if (m < 1) return t('adesso')
  if (m < 60) return t('{n} min fa', { n: m })
  const h = Math.round(m / 60)
  if (h < 24) return t('{n} h fa', { n: h })
  const d = Math.round(h / 24)
  if (d === 1) return t('ieri')
  if (d < 7) return t('{n} giorni fa', { n: d })
  return new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
}
