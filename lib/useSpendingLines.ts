'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { loadSpendingLines } from './data'
import type { SpendingLine } from './data'
import { isoDate } from './finance'

/** from = null tant qu'on n'est pas prêt à charger. Charge de `from` jusqu'à aujourd'hui. */
export function useSpendingLines(from: string | null, refreshKey: unknown = 0) {
  const [lines, setLines] = useState<SpendingLine[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    if (!from) return
    const mine = ++seq.current
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')
      const res = await loadSpendingLines(supabase, user.id, from, isoDate(new Date()))
      if (mine === seq.current) { setLines(res); setLoaded(true) }
    } catch (e: any) {
      if (mine === seq.current) setError(e?.message ?? 'Erreur de chargement')
    }
  }, [from])

  useEffect(() => { reload() }, [reload, refreshKey])

  return { lines, loaded, error, reload }
}
