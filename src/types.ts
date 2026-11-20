export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'monthly'

export interface Recurrence {
  type: RecurrenceType
  /** Ogni X giorni / settimane / mesi (ignorato per "once") */
  every: number
  /** Solo per weekly: giorni specifici della settimana (0=Dom ... 6=Sab) */
  weekdays?: number[]
}

export type Assignment =
  | { mode: 'anyone' }
  | { mode: 'member'; memberId: string }
  | { mode: 'rotation'; memberIds: string[] }

export interface Member {
  id: string
  name: string
  color: string
  avatar: string
  email?: string
  /** Quali notifiche vuole ricevere dagli altri (predefinito: tutte) */
  notify?: NotifyPrefs
  updatedAt: number
}

export interface NotifyPrefs { done: boolean; task: boolean; member: boolean }

export interface Room {
  id: string
  name: string
  icon: string
  color: string
  updatedAt: number
}

export interface Task {
  id: string
  /** Stanza principale (la prima); le altre, se ce ne sono, sono in `roomIds` */
  roomId: string
  /** Tutte le stanze dell'azione (compresa la principale). Assente = solo `roomId` */
  roomIds?: string[]
  /** Ultimo completamento per ciascuna stanza (solo per azioni con più stanze, dopo il primo completamento) */
  roomDone?: Record<string, number>
  /** Istruzioni, come si fa, quando farla… */
  notes?: string
  name: string
  stars: 1 | 2 | 3 | 4 | 5
  recurrence: Recurrence
  assignment: Assignment
  createdAt: number
  /** Chi ha creato l'azione (per le notifiche agli altri) */
  createdBy?: string
  lastCompletedAt: number | null
  /** Quante volte è stata completata (usato per la rotazione) */
  completions: number
  /** Icona propria dell'azione (altrimenti quella della stanza) */
  icon?: string
  /** Parte quando l'azione con questo id viene completata (o, se a tempo, finisce) */
  afterTaskId?: string
  /** Quando l'azione precedente è stata completata: da allora questa è «da fare». Vuoto = in attesa */
  triggeredAt?: number | null
  /** Durata in minuti: il tap avvia l'azione, che resta «in corso» e si completa da sola alla fine (es. asciugatrice) */
  durationMin?: number
  /** Fine prevista (ms) se è in corso, altrimenti assente */
  runningUntil?: number | null
  /** Chi l'ha avviata: a lui vanno le stelle */
  runningBy?: string
  /** Stanze per cui verrà completata alla fine (assente = tutte) */
  runningRooms?: string[]
  /** Una tantum completata -> archiviata */
  archived: boolean
  updatedAt: number
}

export interface ActivityLog {
  id: string
  taskId: string
  taskName: string
  roomId: string
  /** Stanze completate, se più di una: le stelle sono comunque quelle dell'azione, una volta sola */
  roomIds?: string[]
  memberId: string
  stars: number
  at: number
  /** completata da sola alla fine della durata */
  timer?: boolean
  /** completata prima della fine della durata, con «Completa ora» */
  early?: boolean
  /** stato dell'azione prima di questo completamento (per poterlo annullare esattamente) */
  prev?: number | null
  prevTrigger?: number | null
  prevRoomDone?: Record<string, number> | null
}

export interface Settings {
  weeklyGoal: number
  prize: string
  prizeEmoji: string
}

export interface AppDatabase {
  schema: 1
  houseName: string
  members: Member[]
  rooms: Room[]
  tasks: Task[]
  logs: ActivityLog[]
  settings: Settings
  settingsUpdatedAt: number
  /** Lapidi: id -> timestamp di cancellazione (per il merge) */
  tombstones: Record<string, number>
  lastUpdated: number
}

export type TabId = 'today' | 'rooms' | 'ranking' | 'settings'
