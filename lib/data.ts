// lib/data.ts
// Couche d'accès Supabase -> MonthSnapshot. Le client est PASSÉ EN PARAMÈTRE :
//  - navigateur : loadMonthSnapshot(supabase, user.id, month)
//  - serveur    : loadMonthSnapshot(auth.client, auth.user.id, month)  (client authentifié par le JWT, RLS appliquées)
// Toute erreur Supabase est LEVÉE (plus de "data ?? []" qui masque les pannes).

import type { SupabaseClient } from '@supabase/supabase-js'
import { shiftMonth, isoDate } from './finance'
import type { MonthSnapshot } from './finance'

function must(res: { data: any; error: { message: string } | null }, what: string): any[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data ?? []
}
const num = (v: unknown) => Number(v ?? 0)
const empty = Promise.resolve({ data: [] as any[], error: null })

export async function loadMonthSnapshot(
  client: SupabaseClient,
  userId: string,
  month: string,
): Promise<MonthSnapshot> {
  const firstMonth = shiftMonth(month, -3)
  const nextFirst = `${shiftMonth(month, 1)}-01`

  // Vague 1 : tables directement rattachées à l'utilisateur
  const [txR, incR, facR, allFacR, debtR, goalR, budR, projR, recR] = await Promise.all([
    client.from('transactions').select('id,type,amount,category,note,date')
      .eq('user_id', userId).gte('date', `${firstMonth}-01`).lt('date', nextFirst),
    client.from('monthly_incomes').select('id,label,amount,is_fixed,month')
      .eq('user_id', userId).gte('month', firstMonth).lte('month', month),
    client.from('factures').select('id,name,amount,category,due_date,is_recurring')
    .eq('user_id', userId).eq('month', month),
  client.from('factures').select('id,category').eq('user_id', userId),
    client.from('debts').select('id,type,person,amount,remaining,minimum_payment,interest_rate,due_date,recurring,category')
      .eq('user_id', userId),
    client.from('savings_goals').select('id,name,target,saved,category').eq('user_id', userId),
    client.from('budget_categories').select('id,name,limit,color,period_months,created_at'),
    client.from('projects').select('id,name,emoji,type,target_amount,saved_amount,target_date,monthly_contribution')
      .eq('user_id', userId),
    client.from('recurring_payments')
      .select('id,name,default_amount,category,frequency,recurring_payment_checks(month,paid,amount)')
      .eq('user_id', userId),
  ])

  const facRows = must(facR, 'factures')
  const debtRows = must(debtR, 'debts')
  const goalRows = must(goalR, 'savings_goals')
  const factureIds = facRows.map(f => f.id)
  const debtIds = debtRows.map(d => d.id)
  const goalIds = goalRows.map(g => g.id)

  // Vague 2 : tables d'historique (rattachées via l'id parent, pas de user_id)
  const allFacRows = must(allFacR, 'factures (toutes)')
const allFactureIds = allFacRows.map(f => f.id)
const factureCat = new Map<string, string>(allFacRows.map(f => [f.id, f.category ?? 'Autre']))

// (b) paiements DATÉS du mois, sur n'importe quelle facture (par paquets de 100 : limite d'URL)
const fpDated = Promise.all(chunk(allFactureIds).map(ids =>
  client.from('facture_payment_history').select('id,facture_id,amount,paid_at')
    .in('facture_id', ids).gte('paid_at', `${month}-01`).lt('paid_at', nextFirst)))

  const [fpOfMonthR, dpR, depR, fpDatedRs] = await Promise.all([
    // (a) tous les paiements des factures du mois -> sert au "reste à payer"
    factureIds.length
      ? client.from('facture_payment_history')
          .select('id,facture_id,amount,paid_at')
          .in('facture_id', factureIds)
      : empty,

    debtIds.length
      ? client.from('debt_payment_history')
          .select('debt_id,amount,paid_at,category')
          .in('debt_id', debtIds)
          .gte('paid_at', `${month}-01`)
          .lt('paid_at', nextFirst)
      : empty,

    goalIds.length
      ? client.from('savings_deposits')
          .select('goal_id,amount,is_withdrawal,deposited_at')
          .in('goal_id', goalIds)
          .gte('deposited_at', `${month}-01`)
          .lt('deposited_at', nextFirst)
      : empty,

    fpDated,
  ])

  // (a) ∪ (b), dédoublonnés par id
  const fpById = new Map<string, any>()

  for (const r of must(fpOfMonthR, 'facture_payment_history')) {
    fpById.set(r.id, r)
  }

  for (const res of fpDatedRs) {
    for (const r of must(res, 'facture_payment_history')) {
      fpById.set(r.id, r)
    }
  }
    debtIds.length
      ? client.from('debt_payment_history').select('debt_id,amount,paid_at,category')
          .in('debt_id', debtIds).gte('paid_at', `${month}-01`).lt('paid_at', nextFirst)
      : empty,
    goalIds.length
      ? client.from('savings_deposits').select('goal_id,amount,is_withdrawal,deposited_at')
          .in('goal_id', goalIds).gte('deposited_at', `${month}-01`).lt('deposited_at', nextFirst)
      : empty,
  ])

  return {
    month,
    transactions: must(txR, 'transactions').map(r => ({
      id: r.id, type: r.type, amount: num(r.amount), category: r.category ?? 'Autre', note: r.note ?? '', date: r.date,
    })),
    incomes: must(incR, 'monthly_incomes').map(r => ({
      id: r.id, label: r.label, amount: num(r.amount), isFixed: !!r.is_fixed, month: r.month,
    })),
    factures: facRows.map(r => ({
      id: r.id, name: r.name, amount: num(r.amount), category: r.category ?? 'Autre',
      dueDate: r.due_date ?? undefined, isRecurring: !!r.is_recurring,
    })),
    facturePayments: [...fpById.values()].map(r => ({
  id: r.id, factureId: r.facture_id, amount: num(r.amount),
  paidAt: String(r.paid_at).slice(0, 10),
  category: factureCat.get(r.facture_id) ?? 'Autre',
})),
    debts: debtRows.map(r => ({
      id: r.id, type: r.type, person: r.person, amount: num(r.amount), remaining: num(r.remaining),
      minimumPayment: num(r.minimum_payment), interestRate: r.interest_rate ?? undefined,
      dueDate: r.due_date ?? undefined, recurring: !!r.recurring, category: r.category ?? 'Dette',
    })),
    debtPayments: must(dpR, 'debt_payment_history').map(r => ({
      debtId: r.debt_id, amount: num(r.amount), paidAt: r.paid_at, category: r.category ?? '',
    })),
    goals: goalRows.map(r => ({
      id: r.id, name: r.name, target: num(r.target), saved: num(r.saved), category: r.category ?? 'Épargne',
    })),
    deposits: must(depR, 'savings_deposits').map(r => ({
      goalId: r.goal_id, amount: num(r.amount), isWithdrawal: !!r.is_withdrawal, date: r.deposited_at,
    })),
    budgets: must(budR, 'budget_categories').map(r => ({
      id: r.id, name: r.name, limit: num(r.limit), color: r.color,
      periodMonths: r.period_months ?? 1,
      createdAt: r.created_at,
    })),
    recurring: must(recR, 'recurring_payments').map(r => {
      const check = (r.recurring_payment_checks ?? []).find((c: any) => c.month === month)
      return {
        id: r.id, name: r.name, category: r.category, defaultAmount: num(r.default_amount),
        frequency: r.frequency, paid: !!check?.paid, paidAmount: num(check?.amount ?? r.default_amount),
      }
    }),
    projects: must(projR, 'projects').map(r => ({
      id: r.id, name: r.name, emoji: r.emoji, type: r.type, targetAmount: num(r.target_amount),
      savedAmount: num(r.saved_amount), targetDate: r.target_date, monthlyContribution: num(r.monthly_contribution),
    })),
  }
}

// ─── Dépenses par ligne sur une plage de dates (écran Budget) ─────────────────
// Un MonthSnapshot ne couvre que le mois + 3 mois précédents ; les plafonds de
// 6 mois à 3 ans et le filtre de période ont besoin d'un historique plus long.

export interface SpendingLine { date: string; category: string; amount: number }

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d + 1))
}

function chunk<T>(xs: T[], n = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

// Supabase plafonne à 1000 lignes par requête : on pagine jusqu'à épuisement.
async function fetchAll(
  build: (from: number, to: number) => PromiseLike<{ data: any; error: { message: string } | null }>,
  what: string,
): Promise<any[]> {
  const rows: any[] = []
  for (let i = 0; ; i += 1000) {
    const page = must(await build(i, i + 999), what)
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

/**
 * Toutes les dépenses entre `from` et `to` (inclus) :
 * transactions "dépense" + paiements de factures + remboursements de dettes "je dois".
 * Les prêts "on me doit" sont exclus (argent reçu, pas dépensé), comme dans finance.ts.
 */
export async function loadSpendingLines(
  client: SupabaseClient,
  userId: string,
  from: string,
  to: string,
): Promise<SpendingLine[]> {
  const end = nextDay(to)

  const [txRows, facRows, debtRows] = await Promise.all([
    fetchAll((a, b) => client.from('transactions').select('id,date,category,amount')
      .eq('user_id', userId).eq('type', 'expense').gte('date', from).lt('date', end)
      .order('id').range(a, b), 'transactions'),
    fetchAll((a, b) => client.from('factures').select('id,category')
      .eq('user_id', userId).order('id').range(a, b), 'factures'),
    fetchAll((a, b) => client.from('debts').select('id,category')
      .eq('user_id', userId).eq('type', 'owe').order('id').range(a, b), 'debts'),
  ])

  const factureCat = new Map<string, string>(facRows.map(f => [f.id, f.category ?? 'Autre']))
  const debtCat = new Map<string, string>(debtRows.map(d => [d.id, d.category ?? 'Autre']))

  // Les tables d'historique n'ont pas de user_id : on les charge via l'id parent (par paquets de 100)
  const [fpRows, dpRows] = await Promise.all([
    Promise.all(chunk([...factureCat.keys()]).map(ids =>
      fetchAll((a, b) => client.from('facture_payment_history').select('id,facture_id,amount,paid_at')
        .in('facture_id', ids).gte('paid_at', from).lt('paid_at', end)
        .order('id').range(a, b), 'facture_payment_history'))),
    Promise.all(chunk([...debtCat.keys()]).map(ids =>
      fetchAll((a, b) => client.from('debt_payment_history').select('id,debt_id,amount,paid_at,category')
        .in('debt_id', ids).gte('paid_at', from).lt('paid_at', end)
        .order('id').range(a, b), 'debt_payment_history'))),
  ])

  return [
    ...txRows.map(r => ({
      date: String(r.date).slice(0, 10), category: r.category ?? 'Autre', amount: num(r.amount),
    })),
    ...fpRows.flat().map(r => ({
      date: String(r.paid_at).slice(0, 10), category: factureCat.get(r.facture_id) ?? 'Autre', amount: num(r.amount),
    })),
    ...dpRows.flat().map(r => ({
      date: String(r.paid_at).slice(0, 10), category: r.category || debtCat.get(r.debt_id) || 'Autre', amount: num(r.amount),
    })),
  ]
}

export interface ProfileLite {
  firstName: string
  situation: string
  children: number
  monthlyIncome: number
  incomeType: string
  mainGoal: string
  currency: string
}

/** null = aucun profil ; erreur Supabase = exception (ne jamais confondre les deux). */
export async function loadProfile(client: SupabaseClient, userId: string): Promise<ProfileLite | null> {
  const { data, error } = await client.from('profiles')
    .select('first_name,situation,children,monthly_income,income_type,main_goal,currency')
    .eq('id', userId).maybeSingle()
  if (error) throw new Error(`profiles: ${error.message}`)
  if (!data) return null
  return {
    firstName: data.first_name ?? 'Ami', situation: data.situation ?? 'single', children: num(data.children),
    monthlyIncome: num(data.monthly_income), incomeType: data.income_type ?? 'fixed',
    mainGoal: data.main_goal ?? 'stabilize', currency: data.currency ?? 'MUR',
  }
}
