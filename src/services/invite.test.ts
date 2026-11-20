import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearInvite, consumeInviteFromUrl, inviteLink, pendingInvite } from './invite'

const store = new Map<string, string>()
let hash = ''
const replaced: string[] = []
beforeEach(() => {
  store.clear(); replaced.length = 0; hash = ''
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
  vi.stubGlobal('window', { location: { origin: 'https://utente.github.io', pathname: '/clean-duo/', search: '', get hash() { return hash } } })
  vi.stubGlobal('history', { replaceState: (_: unknown, __: string, url: string) => { replaced.push(url); hash = '' } })
})

describe('link d\'invito', () => {
  it('si ricorda l\'ID del file e si ripulisce l\'indirizzo', () => {
    hash = '#join=1WkGOPnfJ38bOLB5UmZED'
    expect(consumeInviteFromUrl()).toBe(true)
    expect(pendingInvite()).toBe('1WkGOPnfJ38bOLB5UmZED')
    expect(replaced).toEqual(['/clean-duo/'])
    clearInvite()
    expect(pendingInvite()).toBeNull()
  })
  it('ignora gli indirizzi senza invito e gli ID non validi', () => {
    hash = '#altro'
    expect(consumeInviteFromUrl()).toBe(false)
    hash = '#join=x'
    expect(consumeInviteFromUrl()).toBe(true)
    expect(pendingInvite()).toBeNull()
  })
  it('il link contiene l\'ID del file', () => {
    vi.stubGlobal('import.meta', {})
    expect(inviteLink('ABCDEFGHIJK')).toMatch(/^https:\/\/utente\.github\.io\/.*#join=ABCDEFGHIJK$/)
  })
})
