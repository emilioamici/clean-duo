import { useEffect, useState } from 'react'

/** Ora corrente che si aggiorna ogni `ms` (per i conti alla rovescia). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(id) }, [ms])
  return now
}
