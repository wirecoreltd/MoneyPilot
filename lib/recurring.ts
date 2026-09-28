// lib/recurring.ts
// Recopie les factures récurrentes et revenus fixes dans le mois en cours.
import type { SupabaseClient } from '@supabase/supabase-js'
import { currentYearMonth, lastDayOf } from './finance'

const key = (s: string) => s.trim().toLowerCase()

// même jour du mois, borné au dernier jour (31 -> 28 en février)
function sameDayIn(ym: string, date?: string | null): string | null {
  const day = Number((date ?? '').slice(8, 10))
  if (!day) return null
  return `${ym}-${String(Math.min(day, lastDayOf(ym))).padStart(2, '0')}`
}

// lignes du dernier mois (avant ym) qui contient des lignes récurrentes
function latestMonthRows<T extends { month: string }>(rows: T[], ym: string): T[] {
  const months = rows.map(r => r.month).filter(m => m < ym).sort()
  const last = months[months.length - 1]
  return last ? rows.filter(r => r.month === last) : []
}

async function ensureFactures(c: SupabaseClient, userId: string, ym: string) {
  const { data, error } = await c.from('factures')
    .select('name,amount,category,due_date,note,month')
    .eq('user_id', userId).eq('is_recurring', true)
  if (error) throw new Error(`factures: ${error.message}`)
  const rows = data ?? []

  const have = new Set(rows.filter(r => r.month === ym).map(r => key(r.name)))
  const toAdd = latestMonthRows(rows, ym)
    .filter(r => !have.has(key(r.name)))
    .map(r => ({
      user_id: userId, name: r.name, amount: r.amount, category: r.category,
      due_date: sameDayIn(ym, r.due_date), is_recurring: true, paid: false,
      note: r.note, month: ym, created_at: `${ym}-01T00:00:00`,
    }))
  if (toAdd.length === 0) return

  const { error: e2 } = await c.from('factures').insert(toAdd)
  if (e2 && e2.code !== '23505') throw new Error(`factures insert: ${e2.message}`) // 23505 = déjà créées
}

async function ensureIncomes(c: SupabaseClient, userId: string, ym: string) {
  const { data, error } = await c.from('monthly_incomes')
    .select('label,amount,received_at,month')
    .eq('user_id', userId).eq('is_fixed', true)
  if (error) throw new Error(`monthly_incomes: ${error.message}`)
  const rows = data ?? []

  const have = new Set(rows.filter(r => r.month === ym).map(r => key(r.label)))
  const toAdd = latestMonthRows(rows, ym)
    .filter(r => !have.has(key(r.label)))
    .map(r => ({
      user_id: userId, label: r.label, amount: r.amount, is_fixed: true,
      month: ym, received_at: sameDayIn(ym, r.received_at) ?? `${ym}-01`,
    }))
  if (toAdd.length === 0) return

  const { error: e2 } = await c.from('monthly_incomes').insert(toAdd)
  if (e2) throw new Error(`monthly_incomes insert: ${e2.message}`)
}

// Garde-fou : un seul appel par utilisateur et par mois (évite les doublons en double rendu React)
const inflight = new Map<string, Promise<void>>()

export function ensureRecurring(c: SupabaseClient, userId: string, ym: string = currentYearMonth()): Promise<void> {
  const k = `${userId}:${ym}`
  let p = inflight.get(k)
  if (!p) {
    p = Promise.all([ensureFactures(c, userId, ym), ensureIncomes(c, userId, ym)])
      .then(() => undefined)
      .catch(e => { inflight.delete(k); throw e })
    inflight.set(k, p)
  }
  return p
}
