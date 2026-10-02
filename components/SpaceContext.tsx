'use client'
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { Space, fetchSpaces, createSpace } from '@/lib/spaces'
import { OVERVIEW, getActiveSpaceId, setActiveSpaceId } from '@/lib/activeSpace'
import { supabase } from '@/lib/supabase'

interface SpaceCtx {
  spaces: Space[]
  activeId: string            // id d'un espace, ou 'all' (vue d'ensemble)
  active: Space | null        // null en vue d'ensemble
  isOverview: boolean
  select: (id: string) => void
  reload: () => Promise<void>
}

const Ctx = createContext<SpaceCtx | null>(null)

export function useSpaces(): SpaceCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSpaces doit être utilisé dans <SpaceProvider>')
  return c
}

export function SpaceProvider({ children }: { children: ReactNode }) {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      // Pas de session (déconnecté / session expirée) : on renvoie vers la connexion
      // au lieu d'essayer de charger ou de créer des espaces sans utilisateur.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }

      let list = await fetchSpaces()
      // Nouveau compte créé après la migration : aucun espace, on crée « Perso »
      if (list.length === 0) list = [await createSpace('Perso', '👤', 'perso')]
      setSpaces(list)

      const stored = getActiveSpaceId()
      const valid = stored === OVERVIEW || list.some(s => s.id === stored)
      const id = valid && stored ? stored : list[0].id
      setActiveSpaceId(id)
      setActiveId(id)
      setError(null)
    } catch (e) {
      if (e instanceof Error && e.message === 'Non authentifié') { window.location.href = '/login'; return }
      setError(e instanceof Error ? e.message : 'Erreur de chargement des espaces')
    }
  }, [])

  useEffect(() => { load() }, [load])

  function select(id: string) {
    setActiveSpaceId(id)
    setActiveId(id)
  }

  if (error) {
    return (
      <div className="card text-center py-8 space-y-3 m-4">
        <p className="text-sm text-danger">Impossible de charger tes espaces : {error}</p>
        <button className="btn-ghost" onClick={load}>Réessayer</button>
      </div>
    )
  }
  // On n'affiche rien tant que l'espace actif n'est pas connu : sinon une section
  // pourrait charger ses données avant de savoir dans quel espace elle est.
  if (!activeId) return <div className="card text-center py-8 text-ink-soft m-4">Chargement...</div>

  const value: SpaceCtx = {
    spaces, activeId,
    active: spaces.find(s => s.id === activeId) ?? null,
    isOverview: activeId === OVERVIEW,
    select, reload: load,
  }

  // Pas de key={activeId} ici : remonter toute l'appli à chaque changement d'espace
  // relançait l'écran de chargement + getSession + ensureRecurring + profil.
  // C'est maintenant page.tsx qui remonte uniquement le contenu des onglets.
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
