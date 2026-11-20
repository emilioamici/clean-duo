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
  updatedAt: number
}

export interface Room {
  id: string
  name: string
  icon: string
  color: string
  updatedAt: number
}

export interface Task {
  id: string
  roomId: string
  name: string
  stars: 1 | 2 | 3 | 4 | 5
  recurrence: Recurrence
  assignment: Assignment
  createdAt: number
  lastCompletedAt: number | null
  /** Quante volte è stata completata (usato per la rotazione) */
  completions: number
  /** Una tantum completata -> archiviata */
  archived: boolean
  updatedAt: number
}

export interface ActivityLog {
  id: string
  taskId: string
  taskName: string
  roomId: string
  memberId: string
  stars: number
  at: number
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
