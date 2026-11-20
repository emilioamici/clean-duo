import { pushUrl } from './push'
import { sessionId } from './broker'

/**
 * Ponte del Worker verso il database su Drive (vedi worker/src/bridge.ts): chi è invitato in una casa ma non ha accesso
 * diretto al file (permesso `drive.file`) legge e scrive passando dal Worker, senza Selettore di Google né ID.
 * Funziona solo se chi ha creato la casa l'ha registrata aprendo l'app con l'accesso persistente.
 */

let availability: Promise<boolean> | null = null
/** Il Worker ha il ponte attivo? */
export function bridgeAvailable(): Promise<boolean> {
  const base = pushUrl()
  if (!base) return Promise.resolve(false)
  availability ??= fetch(base + '/health').then((r) => (r.ok ? r.json() : null)).then((j) => !!j?.bridge).catch(() => false)
  return availability
}

export interface BridgeResult { status: number; json: any }

/** Chiamata al ponte. Non lancia per gli errori HTTP (li interpreta il chiamante); lancia solo se il server è irraggiungibile. */
export async function bridgePost(path: string, token: string, body: unknown): Promise<BridgeResult> {
  const r = await fetch(pushUrl() + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

/** Chi ha accesso diretto al file lo affida al ponte (con la sua sessione persistente). Silenzioso se non applicabile. */
export async function registerHouse(fileId: string, token: string): Promise<boolean> {
  const session = sessionId()
  if (!session || !(await bridgeAvailable())) return false
  try { return (await bridgePost('/house/register', token, { fileId, session })).status === 200 } catch { return false }
}

export interface BridgeHouse { id: string; name: string; modifiedTime: string }

/** Le case a cui questo account è stato invitato e che si possono aprire dal ponte. */
export async function myHouses(token: string): Promise<BridgeHouse[]> {
  if (!(await bridgeAvailable())) return []
  try {
    const r = await bridgePost('/house/mine', token, {})
    return r.status === 200 && Array.isArray(r.json.houses) ? (r.json.houses as BridgeHouse[]) : []
  } catch { return [] }
}
