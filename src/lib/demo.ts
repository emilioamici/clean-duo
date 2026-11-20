import type { AppDatabase, Task } from '../types'
import { DAY } from './clean'
import { t } from '../i18n'

export const MEMBER_COLORS = ['#c9692a', '#e0a93e', '#5b6577', '#2a8f78', '#c0506a', '#3f87b8']
export const AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐙', '🐱', '🐶', '🦉', '🐯', '🐨']
export const ROOM_COLORS = ['#c9692a', '#2a8f78', '#c0506a', '#e0a93e', '#8a5fa8', '#3f87b8', '#6aa84f', '#5b6577']
export const ROOM_ICONS = ['cooking-pot', 'bath', 'sofa', 'bed-double', 'trees', 'shirt', 'car', 'briefcase', 'baby', 'paw-print', 'utensils', 'door-open']

export function createDemoDb(): AppDatabase {
  const now = Date.now()
  const mk = (
    id: string, roomId: string, name: string, stars: Task['stars'],
    recurrence: Task['recurrence'], daysAgo: number | null,
    assignment: Task['assignment'] = { mode: 'anyone' },
  ): Task => ({
    id, roomId, name, stars, recurrence, assignment,
    createdAt: now - 30 * DAY,
    lastCompletedAt: daysAgo === null ? null : now - daysAgo * DAY,
    completions: daysAgo === null ? 0 : 3,
    archived: false,
    updatedAt: now,
  })

  const logs = [
    { id: 'l1', taskId: 't1', taskName: t('Lavare i piatti'), roomId: 'r1', memberId: 'm1', stars: 1, at: now - 2 * 3600_000 },
    { id: 'l2', taskId: 't5', taskName: t('Passare l’aspirapolvere'), roomId: 'r3', memberId: 'm2', stars: 3, at: now - 1 * DAY },
    { id: 'l3', taskId: 't3', taskName: t('Pulire il piano cottura'), roomId: 'r1', memberId: 'm2', stars: 2, at: now - 2 * DAY },
    { id: 'l4', taskId: 't7', taskName: t('Cambiare le lenzuola'), roomId: 'r4', memberId: 'm1', stars: 4, at: now - 3 * DAY },
    { id: 'l5', taskId: 't4', taskName: t('Pulire il bagno a fondo'), roomId: 'r2', memberId: 'm1', stars: 5, at: now - 4 * DAY },
    { id: 'l6', taskId: 't1', taskName: t('Lavare i piatti'), roomId: 'r1', memberId: 'm2', stars: 1, at: now - 5 * DAY },
    { id: 'l7', taskId: 't5', taskName: t('Passare l’aspirapolvere'), roomId: 'r3', memberId: 'm1', stars: 3, at: now - 9 * DAY },
    { id: 'l8', taskId: 't4', taskName: t('Pulire il bagno a fondo'), roomId: 'r2', memberId: 'm2', stars: 5, at: now - 12 * DAY },
  ]

  return {
    schema: 1,
    houseName: t('Casa Dolce Casa'),
    members: [
      { id: 'm1', name: 'Giulia', color: MEMBER_COLORS[1], avatar: '🦊', updatedAt: now },
      { id: 'm2', name: 'Marco', color: MEMBER_COLORS[0], avatar: '🐼', updatedAt: now },
    ],
    rooms: [
      { id: 'r1', name: t('Cucina'), icon: 'cooking-pot', color: ROOM_COLORS[3], updatedAt: now },
      { id: 'r2', name: t('Bagno'), icon: 'bath', color: ROOM_COLORS[5], updatedAt: now },
      { id: 'r3', name: t('Soggiorno'), icon: 'sofa', color: ROOM_COLORS[4], updatedAt: now },
      { id: 'r4', name: t('Camera'), icon: 'bed-double', color: ROOM_COLORS[2], updatedAt: now },
      { id: 'r5', name: t('Giardino'), icon: 'trees', color: ROOM_COLORS[1], updatedAt: now },
    ],
    tasks: [
      mk('t1', 'r1', t('Lavare i piatti'), 1, { type: 'daily', every: 1 }, 1),
      mk('t2', 'r1', t('Svuotare la lavastoviglie'), 1, { type: 'daily', every: 2 }, 1, { mode: 'rotation', memberIds: ['m1', 'm2'] }),
      mk('t3', 'r1', t('Pulire il piano cottura'), 2, { type: 'weekly', every: 1 }, 4),
      mk('t4', 'r2', t('Pulire il bagno a fondo'), 5, { type: 'weekly', every: 1 }, 9, { mode: 'member', memberId: 'm2' }),
      mk('t5', 'r3', t('Passare l’aspirapolvere'), 3, { type: 'weekly', every: 1, weekdays: [1, 4] }, 3),
      mk('t6', 'r3', t('Spolverare i mobili'), 2, { type: 'weekly', every: 2 }, 6),
      mk('t7', 'r4', t('Cambiare le lenzuola'), 4, { type: 'weekly', every: 2 }, 5),
      mk('t8', 'r4', t('Rifare il letto'), 1, { type: 'daily', every: 1 }, 0.3),
      mk('t9', 'r5', t('Annaffiare le piante'), 2, { type: 'daily', every: 3 }, 2),
      mk('t10', 'r5', t('Tagliare l’erba'), 4, { type: 'monthly', every: 1 }, 20),
      mk('t11', 'r2', t('Cambiare l’asciugamano'), 1, { type: 'weekly', every: 1 }, 2),
      mk('t12', 'r3', t('Montare la libreria nuova'), 5, { type: 'once', every: 1 }, null),
    ],
    logs,
    settings: { weeklyGoal: 12, prize: t('Cena fuori offerta dallo sconfitto'), prizeEmoji: '🍝' },
    settingsUpdatedAt: now,
    tombstones: {},
    lastUpdated: now,
  }
}

export function createEmptyDb(houseName = t('La mia casa')): AppDatabase {
  const now = Date.now()
  return {
    schema: 1,
    houseName,
    members: [],
    rooms: [],
    tasks: [],
    logs: [],
    settings: { weeklyGoal: 10, prize: '', prizeEmoji: '🏆' },
    settingsUpdatedAt: now,
    tombstones: {},
    lastUpdated: now,
  }
}
