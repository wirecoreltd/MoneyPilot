'use client'
// lib/useMonthSummary.ts — le hook que doivent utiliser Accueil, Budget, etc.
// Un seul chargement -> un seul jeu de chiffres (summary, health, plan) pour tout l'écran.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { loadMonthSnapshot } from './data'
import { buildCoachPlan, computeHealthScore, computeMonthSummary } from './finance'
import type { MonthSnapshot } from './finance'

/** refreshKey : toute valeur qui change quand il faut recharger (ex. le tableau `transactions` du parent). */
export function useMonthSummary(month: string, refreshKey: unknown = 0) {
  const [snapshot, setSnapshot] = useState<MonthSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const mine = ++seq.current // ignore les réponses périmées
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')
      const snap = await loadMonthSnapshot(supabase, user.id, month)
      if (mine === seq.current) setSnapshot(snap)
    } catch (e: any) {
      if (mine === seq.current) setError(e?.message ?? 'Erreur de chargement')
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [month])

  useEffect(() => { reload() }, [reload, refreshKey])

  const derived = useMemo(() => {
    if (!snapshot) return null
    const summary = computeMonthSummary(snapshot)
    return {
      summary,
      health: computeHealthScore(summary, snapshot.debts),
      plan: buildCoachPlan(snapshot, summary),
    }
  }, [snapshot])

  return {
    snapshot,
    summary: derived?.summary ?? null,
    health: derived?.health ?? null,
    plan: derived?.plan ?? null,
    loading,
    error,
    reload,
  }
}
