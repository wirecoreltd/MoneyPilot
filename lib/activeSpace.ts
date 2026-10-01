// lib/activeSpace.ts
// Espace actif, lisible depuis n'importe quelle fonction (hors React).
export const OVERVIEW = 'all'
const KEY = 'moneyapp_active_space'
let current: string | null = null

export function getActiveSpaceId(): string | null {
  if (current !== null) return current
  if (typeof window === 'undefined') return null
  current = localStorage.getItem(KEY)
  return current
}

export function setActiveSpaceId(id: string): void {
  current = id
  if (typeof window !== 'undefined') localStorage.setItem(KEY, id)
}

// Pour toute écriture : refuse « Vue d'ensemble », qui est en lecture seule.
export function requireWritableSpaceId(): string {
  const id = getActiveSpaceId()
  if (!id || id === OVERVIEW) throw new Error('Choisis un espace pour enregistrer.')
  return id
}

// Pour toute lecture : null = pas de filtre (vue d'ensemble ou espace inconnu).
export function readSpaceId(): string | null {
  const id = getActiveSpaceId()
  return id && id !== OVERVIEW ? id : null
}
