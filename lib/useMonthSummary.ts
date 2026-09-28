'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { loadMonthSnapshot, loadSpendingLines } from './data'
import { computeBudgetStatuses, earliestCycleStart } from './budgetPeriods'
import { buildCoachPlan, computeHealthScore, computeMonthSummary, isoDate } from './finance'
import type { BudgetStatus, MonthSnapshot } from './finance'

export function useMonthSummary(month: string, refreshKey: unknown = 0) {
  const [data, setData] = useState<{ snap: MonthSnapshot; budgets: BudgetStatus[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')
      const snap = await loadMonthSnapshot(supabase, user.id, month)
      const from = earliestCycleStart(snap.budgets)
      const lines = from ? await loadSpendingLines(supabase, user.id, from, isoDate(new Date())) : []
      const budgets = computeBudgetStatuses(snap.budgets, lines)
      if (mine === seq.current) setData({ snap, budgets })
    } catch (e: any) {
      if (mine === seq.current) setError(e?.message ?? 'Erreur de chargement')
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [month])

  useEffect(() => { reload() }, [reload, refreshKey])

  const derived = useMemo(() => {
    if (!data) return null
    const summary = { ...computeMonthSummary(data.snap), budgets: data.budgets }
    return {
      summary,
      health: computeHealthScore(summary, data.snap.debts),
      plan: buildCoachPlan(data.snap, summary),
    }
  }, [data])

  return {
    snapshot: data?.snap ?? null,
    summary: derived?.summary ?? null,
    health: derived?.health ?? null,
    plan: derived?.plan ?? null,
    loading, error, reload,
  }
}
