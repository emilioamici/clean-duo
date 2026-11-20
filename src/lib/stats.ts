import type { ActivityLog, AppDatabase } from '../types'
import { DAY, startOfMonth, startOfWeek } from './clean'

export function starsSince(logs: ActivityLog[], since: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of logs) if (l.at >= since) out[l.memberId] = (out[l.memberId] ?? 0) + l.stars
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
    for (const l of db.logs) if (l.at >= start && l.at < end) per[l.memberId] = (per[l.memberId] ?? 0) + l.stars
    return { start, per }
  })
}

export function timeAgo(ts: number, now = Date.now()): string {
  const m = Math.round((now - ts) / 60_000)
  if (m < 1) return 'adesso'
  if (m < 60) return `${m} min fa`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h fa`
  const d = Math.round(h / 24)
  if (d === 1) return 'ieri'
  if (d < 7) return `${d} giorni fa`
  return new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
