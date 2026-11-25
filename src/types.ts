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
  /** Parte quando lo segnala un'automazione (id): in attesa finché il dispositivo non lo segnala */
  onEvent?: string
  /** Avvisa i membri quando l'azione passa da «in attesa» a «da fare» (solo azioni legate a un'altra azione o a un dispositivo) */
  notifyWhenTodo?: boolean
  /** «Su richiesta»: quando è stata segnata «da fare». È da fare finché non viene completata dopo quel momento */
  todoAt?: number | null
  /** Quando l'azione precedente è stata completata: da allora questa è «da fare». Vuoto = in attesa */
  triggeredAt?: number | null
  /** Durata in minuti: il tap avvia l'azione, che resta «in corso» e si completa da sola alla fine (es. asciugatrice) */
  durationMin?: number
  /** Fine prevista (ms) se è in corso, altrimenti assente */
  runningUntil?: number | null
  /** Chi l'ha avviata: a lui vanno le stelle */
  runningBy?: string
  /** Ora dell'ultimo comando esterno (Shortcuts…) applicato a questa azione: un comando non più recente non si applica due volte */
  lastCommandAt?: number
  /** «In corso» senza ora di fine: da quando (ms) un dispositivo ha segnalato l'inizio del ciclo. Finisce con il segnale di fine */
  autoRunSince?: number | null
  /** automazione che l'ha avviata */
  autoRunRule?: string
  /** Stanze per cui verrà completata alla fine (assente = tutte) */
  runningRooms?: string[]
  /** Non più usato per le azioni «su richiesta» (restano visibili); resta per i dati delle versioni precedenti */
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
  /** Altri membri che hanno dato una mano: le stelle si dividono in parti uguali tra chi ha completato e questi */
  with?: string[]
  /** Ultima modifica dei contributori (nel merge vince la più recente) */
  updatedAt?: number
  /** completata dal segnale di un dispositivo (es. fine del ciclo del Roomba): nessun membro, nessuna stella */
  auto?: boolean
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

/** Collegamento a un dispositivo (per ora Tuya): quando la condizione si verifica, l'azione collegata va tra le cose da fare. */
export interface Automation {
  id: string
  /** `tuya`: quando un dato del dispositivo soddisfa la condizione l'azione va «da fare». `shortcut`: comandi da Shortcuts di iPhone (un indirizzo per casa: avvia, completa, finisci o segna da fare un'azione). `cycle`: l'azione va «in corso» all'inizio del ciclo e si completa alla fine (es. Roomba, via IFTTT) */
  kind: 'tuya' | 'cycle' | 'shortcut'
  name: string
  deviceId: string
  /** codice del dato del dispositivo (es. «fault») */
  code: string
  op: 'eq' | 'ne' | 'lt' | 'gt' | 'bit' | 'contains'
  value: string
  /** azione che diventa «da fare» */
  taskId: string
  enabled: boolean
  /** `cycle`: codice segreto dell'indirizzo che il dispositivo (IFTTT…) chiama per segnalare inizio e fine */
  hookToken?: string
  /** `cycle`: membro a cui vanno le stelle quando il ciclo finisce (vuoto = nessuno: si può assegnare dopo dall'azione «in corso»). `shortcut`: membro per conto del quale si applica il comando */
  assignTo?: string
  /** `shortcut`: comando predefinito ('todo' | 'complete' | 'start' | 'finish' | '') */
  action?: string
  /** `shortcut`: ultimo comando che non è stato possibile applicare (es. azione non riconosciuta) */
  lastError?: string
  /** ultima volta che il dispositivo ha segnalato (ms) */
  lastFiredAt?: number
  updatedAt: number
}

export interface AppDatabase {
  schema: 1
  houseName: string
  members: Member[]
  rooms: Room[]
  tasks: Task[]
  /** Automazioni con i dispositivi */
  automations?: Automation[]
  logs: ActivityLog[]
  settings: Settings
  settingsUpdatedAt: number
  /** Lapidi: id -> timestamp di cancellazione (per il merge) */
  tombstones: Record<string, number>
  lastUpdated: number
}

export type TabId = 'today' | 'rooms' | 'ranking' | 'settings'
