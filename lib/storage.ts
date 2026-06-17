import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  completed: boolean
  firstName: string
  situation: 'single' | 'couple' | 'family' | 'single-parent'
  children: number
  monthlyIncome: number
  incomeType: '' | 'fixed' | 'mixed' | 'variable' | 'none'
  mainGoal: 'survive' | 'stabilize' | 'build' | 'prosper'
  hasDebts: boolean
  currency: string
  language: string
  createdAt: string
}

export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  category: string
  note: string
  date: string
  createdAt: string
}

export interface BudgetCategory {
  id: string
  name: string
  limit: number
  color: string
}

export interface SavingsGoal {
  id: string
  name: string
  target: number
  saved: number
  emoji: string
  category: string        // ← nouveau
  createdAt: string
}

export interface DebtPaymentHistory {
  id: string
  debtId: string
  amount: number
  paidAt: string
  category?: string       // ← nouveau (héritée de la dette)
  createdAt: string
}

export interface Debt {
  id: string
  type: 'owe' | 'owed'
  person: string
  amount: number
  remaining: number
  minimumPayment: number
  interestRate?: number
  note: string
  dueDate?: string
  recurring: boolean
  category: string        // ← nouveau (obligatoire)
  createdAt: string
}

export interface RecurringPayment {
  id: string
  name: string
  defaultAmount: number
  category: 'logement' | 'transport' | 'assurance' | 'école' | 'alimentation' | 'factures' | 'dette' | 'autre'
  frequency: 'monthly' | 'yearly'
  note?: string
  payments: {
    month: string
    paid: boolean
    amount: number
  }[]
}

// ─── Unified Monthly Checklist (récurrents + dettes) ──────────────────────────

export interface ChecklistItem {
  id: string
  source: 'recurring' | 'debt'
  name: string
  emoji: string
  defaultAmount: number
  amount: number
  paid: boolean
  category?: string
  frequency?: 'monthly' | 'yearly'
  hasTotal?: boolean
}

export async function getMonthlyChecklist(month: string): Promise<ChecklistItem[]> {
  const [recurring, debts] = await Promise.all([getRecurringPayments(), getDebts()])

  const recurringItems: ChecklistItem[] = recurring.map(r => {
    const pay = getPaymentForMonth(r, month)
    return {
      id: r.id, source: 'recurring', name: r.name,
      emoji: RECURRING_CATEGORY_EMOJI[r.category],
      defaultAmount: r.defaultAmount, amount: pay.amount, paid: pay.paid,
      category: r.category, frequency: r.frequency,
    }
  })

  const eligibleDebts = debts.filter(d => d.type === 'owe' && d.minimumPayment > 0)
  let checks: { debt_id: string; paid: boolean; amount: number }[] = []
  if (eligibleDebts.length > 0) {
    const { data } = await supabase
      .from('debt_payment_checks')
      .select('debt_id, paid, amount')
      .in('debt_id', eligibleDebts.map(d => d.id))
      .eq('month', month)
    checks = data ?? []
  }

  const debtItems: ChecklistItem[] = eligibleDebts.map(d => {
    const check = checks.find(c => c.debt_id === d.id)
    return {
      id: d.id, source: 'debt', name: d.person, emoji: '💳',
      defaultAmount: d.minimumPayment,
      amount: check?.amount ?? d.minimumPayment,
      paid: check?.paid ?? false,
      category: d.category,
      hasTotal: d.amount > 0,
    }
  })

  return [...recurringItems, ...debtItems]
}

export async function toggleDebtPayment(debtId: string, month: string, amount?: number): Promise<{ deleted: boolean }> {
  const { data: debt } = await supabase.from('debts').select('*').eq('id', debtId).single()
  if (!debt) throw new Error('Dette introuvable')

  const { data: existing } = await supabase
    .from('debt_payment_checks')
    .select('*')
    .eq('debt_id', debtId)
    .eq('month', month)
    .maybeSingle()

  if (existing?.paid && amount === undefined) {
    await supabase.from('debt_payment_checks').update({ paid: false }).eq('id', existing.id)
    if (debt.amount > 0) {
      await supabase.from('debts').update({ remaining: debt.remaining + existing.amount }).eq('id', debtId)
    }
    return { deleted: false }
  }

  let currentRemaining = debt.remaining
  if (existing?.paid && debt.amount > 0) currentRemaining += existing.amount

  const payAmount = amount ?? existing?.amount ?? debt.minimum_payment

  if (existing) {
    await supabase.from('debt_payment_checks').update({ paid: true, amount: payAmount }).eq('id', existing.id)
  } else {
    await supabase.from('debt_payment_checks').insert({ debt_id: debtId, month, paid: true, amount: payAmount })
  }

  if (debt.amount > 0) {
    const newRemaining = Math.max(0, currentRemaining - payAmount)
    if (newRemaining === 0) {
      if (debt.recurring) {
        await supabase.from('debts').update({ remaining: debt.amount }).eq('id', debtId)
        await addDebtPaymentHistory(debtId, payAmount, undefined, debt.category)
        return { deleted: false }
      }
      await deleteDebt(debtId)
      return { deleted: true }
    }
    await supabase.from('debts').update({ remaining: newRemaining }).eq('id', debtId)
    await addDebtPaymentHistory(debtId, payAmount, undefined, debt.category)
  }

  return { deleted: false }
}

export interface MonthlyIncome {
  id: string
  label: string
  amount: number
  isFixed: boolean
  month: string
}

export interface Project {
  id: string
  name: string
  emoji: string
  type: 'savings' | 'investment' | 'purchase' | 'upcoming'
  targetAmount: number
  savedAmount: number
  targetDate: string
  monthlyContribution: number
  note?: string
  createdAt: string
}

// ─── Categories ───────────────────────────────────────────────────────────────

// Liste commune utilisée par transactions, dettes, épargne et budget
export const BUDGET_CATEGORIES = [
  'Logement',
  'Alimentation',
  'Transport',
  'Santé',
  'Loisirs',
  'Vêtements',
  'Éducation',
  'Factures',
  'Restaurants',
  'Épargne',
  'Dette',
  'Autre',
] as const

export type BudgetCategoryName = typeof BUDGET_CATEGORIES[number]

export const EXPENSE_CATEGORIES = [...BUDGET_CATEGORIES]

export const INCOME_CATEGORIES = [
  'Salaire', 'Freelance', 'Investissements', 'Cadeau', 'Remboursement', 'Autre'
]

export const RECURRING_CATEGORIES = [
  'logement', 'transport', 'assurance', 'école',
  'alimentation', 'factures', 'dette', 'autre'
] as const

export const RECURRING_CATEGORY_EMOJI: Record<string, string> = {
  logement: '🏠', transport: '🚗', assurance: '🛡️',
  école: '🎓', alimentation: '🛒', factures: '⚡',
  dette: '💳', autre: '📦'
}

// Mapping catégorie récurrente (minuscule) → catégorie budget (casse BUDGET_CATEGORIES)
export const RECURRING_TO_BUDGET: Record<string, string> = {
  logement:     'Logement',
  transport:    'Transport',
  alimentation: 'Alimentation',
  factures:     'Factures',
  assurance:    'Factures',
  école:        'Éducation',
  dette:        'Dette',
  autre:        'Autre',
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  return user.id
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getUserProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!data) return null

  return {
    completed:     true,
    firstName:     data.first_name,
    situation:     data.situation,
    children:      data.children,
    monthlyIncome: data.monthly_income,
    incomeType:    data.income_type,
    mainGoal:      data.main_goal,
    hasDebts:      data.has_debts,
    currency:      data.currency,
    language:      data.language,
    createdAt:     data.created_at,
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const userId = await getUserId()

  await supabase.from('profiles').upsert({
    id:             userId,
    first_name:     profile.firstName,
    situation:      profile.situation,
    children:       profile.children,
    monthly_income: profile.monthlyIncome,
    income_type:    profile.incomeType,
    main_goal:      profile.mainGoal,
    has_debts:      profile.hasDebts,
    currency:       profile.currency,
    language:       profile.language,
  })
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(): Promise<Transaction[]> {
  const userId = await getUserId()

  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })

  return (data ?? []).map(r => ({
    id:        r.id,
    type:      r.type,
    amount:    r.amount,
    category:  r.category,
    note:      r.note ?? '',
    date:      r.date,
    createdAt: r.created_at,
  }))
}

export async function addTransaction(tx: Omit<Transaction, 'id' | 'createdAt'>): Promise<Transaction> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id:  userId,
      type:     tx.type,
      amount:   tx.amount,
      category: tx.category,
      note:     tx.note,
      date:     tx.date,
    })
    .select()
    .single()

  if (error) throw error

  return {
    id:        data.id,
    type:      data.type,
    amount:    data.amount,
    category:  data.category,
    note:      data.note ?? '',
    date:      data.date,
    createdAt: data.created_at,
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  await supabase.from('transactions').delete().eq('id', id)
}

// ─── Budget ───────────────────────────────────────────────────────────────────

const DEFAULT_BUDGETS: Omit<BudgetCategory, 'id'>[] = [
  { name: 'Alimentation', limit: 15000, color: '#F59E0B' },
  { name: 'Transport',    limit: 5000,  color: '#3B82F6' },
  { name: 'Loisirs',      limit: 8000,  color: '#8B5CF6' },
  { name: 'Factures',     limit: 10000, color: '#EF4444' },
]

export async function getBudgets(): Promise<BudgetCategory[]> {
  const userId = await getUserId()

  const { data } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('user_id', userId)

  if (!data || data.length === 0) {
    const toInsert = DEFAULT_BUDGETS.map(b => ({ ...b, user_id: userId }))
    const { data: inserted } = await supabase
      .from('budget_categories')
      .insert(toInsert)
      .select()
    return (inserted ?? []).map(r => ({ id: r.id, name: r.name, limit: r.limit, color: r.color }))
  }

  return data.map(r => ({ id: r.id, name: r.name, limit: r.limit, color: r.color }))
}

export async function addBudget(b: Omit<BudgetCategory, 'id'>): Promise<BudgetCategory> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('budget_categories')
    .insert({ user_id: userId, name: b.name, limit: b.limit, color: b.color })
    .select()
    .single()

  if (error) throw error
  return { id: data.id, name: data.name, limit: data.limit, color: data.color }
}

export async function updateBudget(id: string, fields: { name?: string; limit?: number; color?: string }): Promise<void> {
  await supabase.from('budget_categories').update(fields).eq('id', id)
}

export async function deleteBudget(id: string): Promise<void> {
  await supabase.from('budget_categories').delete().eq('id', id)
}

// ─── Savings ──────────────────────────────────────────────────────────────────

export async function getSavings(): Promise<SavingsGoal[]> {
  const userId = await getUserId()

  const { data } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  return (data ?? []).map(r => ({
    id:        r.id,
    name:      r.name,
    target:    r.target,
    saved:     r.saved,
    emoji:     r.emoji,
    category:  r.category ?? 'Épargne',
    createdAt: r.created_at,
  }))
}

export async function addSavingsGoal(g: Omit<SavingsGoal, 'id' | 'createdAt'>): Promise<SavingsGoal> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('savings_goals')
    .insert({ user_id: userId, name: g.name, target: g.target, saved: g.saved, emoji: g.emoji, category: g.category ?? 'Épargne' })
    .select()
    .single()

  if (error) throw error
  return {
    id:        data.id,
    name:      data.name,
    target:    data.target,
    saved:     data.saved,
    emoji:     data.emoji,
    category:  data.category ?? 'Épargne',
    createdAt: data.created_at,
  }
}

export async function updateSavingsGoal(id: string, saved: number): Promise<void> {
  await supabase.from('savings_goals').update({ saved }).eq('id', id)
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  await supabase.from('savings_goals').delete().eq('id', id)
}

// ─── Debts ────────────────────────────────────────────────────────────────────

export async function getDebts(): Promise<Debt[]> {
  const userId = await getUserId()

  const { data } = await supabase
    .from('debts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  return (data ?? []).map(r => ({
    id:             r.id,
    type:           r.type,
    person:         r.person,
    amount:         r.amount,
    remaining:      r.remaining,
    minimumPayment: r.minimum_payment,
    interestRate:   r.interest_rate ?? undefined,
    note:           r.note ?? '',
    dueDate:        r.due_date ?? undefined,
    recurring:      r.recurring ?? false,
    category:       r.category ?? 'Dette',
    createdAt:      r.created_at,
  }))
}

export async function addDebt(d: Omit<Debt, 'id' | 'createdAt'>): Promise<Debt> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('debts')
    .insert({
      user_id:         userId,
      type:            d.type,
      person:          d.person,
      amount:          d.amount,
      remaining:       d.remaining,
      minimum_payment: d.minimumPayment,
      interest_rate:   d.interestRate,
      note:            d.note,
      due_date:        d.dueDate,
      recurring:       d.recurring,
      category:        d.category ?? 'Dette',
    })
    .select()
    .single()

  if (error) throw error

  return {
    id:             data.id,
    type:           data.type,
    person:         data.person,
    amount:         data.amount,
    remaining:      data.remaining,
    minimumPayment: data.minimum_payment,
    interestRate:   data.interest_rate ?? undefined,
    note:           data.note ?? '',
    dueDate:        data.due_date ?? undefined,
    recurring:      data.recurring ?? false,
    category:       data.category ?? 'Dette',
    createdAt:      data.created_at,
  }
}

export async function updateDebt(id: string, fields: Partial<Omit<Debt, 'id' | 'createdAt'>>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (fields.type            !== undefined) update.type             = fields.type
  if (fields.person          !== undefined) update.person           = fields.person
  if (fields.amount          !== undefined) update.amount           = fields.amount
  if (fields.remaining       !== undefined) update.remaining        = fields.remaining
  if (fields.minimumPayment  !== undefined) update.minimum_payment  = fields.minimumPayment
  if (fields.interestRate    !== undefined) update.interest_rate    = fields.interestRate
  if (fields.note            !== undefined) update.note             = fields.note
  if (fields.dueDate         !== undefined) update.due_date         = fields.dueDate
  if (fields.recurring       !== undefined) update.recurring        = fields.recurring
  if (fields.category        !== undefined) update.category         = fields.category
  await supabase.from('debts').update(update).eq('id', id)
}

export async function deleteDebt(id: string): Promise<void> {
  await supabase.from('debts').delete().eq('id', id)
}

// ─── Debt Payment History ─────────────────────────────────────────────────────

export async function getDebtPaymentHistory(debtId: string): Promise<DebtPaymentHistory[]> {
  const { data } = await supabase
    .from('debt_payment_history')
    .select('*')
    .eq('debt_id', debtId)
    .order('paid_at', { ascending: false })

  return (data ?? []).map(r => ({
    id:        r.id,
    debtId:    r.debt_id,
    amount:    r.amount,
    paidAt:    r.paid_at,
    category:  r.category ?? undefined,
    createdAt: r.created_at,
  }))
}

export async function addDebtPaymentHistory(
  debtId: string,
  amount: number,
  paidAt?: string,
  category?: string,
): Promise<void> {
  await supabase.from('debt_payment_history').insert({
    debt_id:  debtId,
    amount,
    paid_at:  paidAt ?? new Date().toISOString().slice(0, 10),
    category: category ?? null,
  })
}

// ─── Recurring Payments ───────────────────────────────────────────────────────

export async function getRecurringPayments(): Promise<RecurringPayment[]> {
  const userId = await getUserId()

  const { data: payments } = await supabase
    .from('recurring_payments')
    .select('*, recurring_payment_checks(*)')
    .eq('user_id', userId)
    .order('name', { ascending: true })

  return (payments ?? []).map(r => ({
    id:            r.id,
    name:          r.name,
    defaultAmount: r.default_amount,
    category:      r.category,
    frequency:     r.frequency,
    note:          r.note ?? undefined,
    payments:      (r.recurring_payment_checks ?? []).map((c: any) => ({
      month:  c.month,
      paid:   c.paid,
      amount: c.amount,
    })),
  }))
}

export async function addRecurringPayment(p: Omit<RecurringPayment, 'id' | 'payments'>): Promise<RecurringPayment> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('recurring_payments')
    .insert({
      user_id:        userId,
      name:           p.name,
      default_amount: p.defaultAmount,
      category:       p.category,
      frequency:      p.frequency,
      note:           p.note,
    })
    .select()
    .single()

  if (error) throw error

  return {
    id:            data.id,
    name:          data.name,
    defaultAmount: data.default_amount,
    category:      data.category,
    frequency:     data.frequency,
    note:          data.note ?? undefined,
    payments:      [],
  }
}

export async function deleteRecurringPayment(id: string): Promise<void> {
  await supabase.from('recurring_payments').delete().eq('id', id)
}

export async function toggleRecurringPayment(id: string, month: string, amount?: number): Promise<void> {
  const { data: existing } = await supabase
    .from('recurring_payment_checks')
    .select('*')
    .eq('payment_id', id)
    .eq('month', month)
    .single()

  if (existing) {
    await supabase
      .from('recurring_payment_checks')
      .update({
        paid:   amount !== undefined ? true : !existing.paid,
        amount: amount ?? existing.amount,
      })
      .eq('id', existing.id)
  } else {
    const { data: parent } = await supabase
      .from('recurring_payments')
      .select('default_amount')
      .eq('id', id)
      .single()

    await supabase.from('recurring_payment_checks').insert({
      payment_id: id,
      month,
      paid:   true,
      amount: amount ?? parent?.default_amount ?? 0,
    })
  }
}

export function getPaymentForMonth(p: RecurringPayment, month: string) {
  return p.payments.find(x => x.month === month) ?? { month, paid: false, amount: p.defaultAmount }
}

// ─── Monthly Incomes ──────────────────────────────────────────────────────────

export async function getMonthlyIncomes(month?: string): Promise<MonthlyIncome[]> {
  const userId = await getUserId()

  let query = supabase
    .from('monthly_incomes')
    .select('*')
    .eq('user_id', userId)

  if (month) query = query.eq('month', month)

  const { data } = await query.order('created_at', { ascending: true })

  return (data ?? []).map(r => ({
    id:      r.id,
    label:   r.label,
    amount:  r.amount,
    isFixed: r.is_fixed,
    month:   r.month,
  }))
}

export async function addMonthlyIncome(i: Omit<MonthlyIncome, 'id'>): Promise<MonthlyIncome> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('monthly_incomes')
    .insert({ user_id: userId, label: i.label, amount: i.amount, is_fixed: i.isFixed, month: i.month })
    .select()
    .single()

  if (error) throw error
  return { id: data.id, label: data.label, amount: data.amount, isFixed: data.is_fixed, month: data.month }
}

export async function deleteMonthlyIncome(id: string): Promise<void> {
  await supabase.from('monthly_incomes').delete().eq('id', id)
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const userId = await getUserId()

  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  return (data ?? []).map(r => ({
    id:                  r.id,
    name:                r.name,
    emoji:               r.emoji,
    type:                r.type,
    targetAmount:        r.target_amount,
    savedAmount:         r.saved_amount,
    targetDate:          r.target_date,
    monthlyContribution: r.monthly_contribution,
    note:                r.note ?? undefined,
    createdAt:           r.created_at,
  }))
}

export async function addProject(p: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id:              userId,
      name:                 p.name,
      emoji:                p.emoji,
      type:                 p.type,
      target_amount:        p.targetAmount,
      saved_amount:         p.savedAmount,
      target_date:          p.targetDate,
      monthly_contribution: p.monthlyContribution,
      note:                 p.note,
    })
    .select()
    .single()

  if (error) throw error

  return {
    id:                  data.id,
    name:                data.name,
    emoji:               data.emoji,
    type:                data.type,
    targetAmount:        data.target_amount,
    savedAmount:         data.saved_amount,
    targetDate:          data.target_date,
    monthlyContribution: data.monthly_contribution,
    note:                data.note ?? undefined,
    createdAt:           data.created_at,
  }
}

export async function updateProject(id: string, fields: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (fields.name                !== undefined) update.name                 = fields.name
  if (fields.emoji               !== undefined) update.emoji                = fields.emoji
  if (fields.type                !== undefined) update.type                 = fields.type
  if (fields.targetAmount        !== undefined) update.target_amount        = fields.targetAmount
  if (fields.savedAmount         !== undefined) update.saved_amount         = fields.savedAmount
  if (fields.targetDate          !== undefined) update.target_date          = fields.targetDate
  if (fields.monthlyContribution !== undefined) update.monthly_contribution = fields.monthlyContribution
  if (fields.note                !== undefined) update.note                 = fields.note
  await supabase.from('projects').update(update).eq('id', id)
}

export async function deleteProject(id: string): Promise<void> {
  await supabase.from('projects').delete().eq('id', id)
}

// ─── Health Score ─────────────────────────────────────────────────────────────

export function computeHealthScore(
  transactions: Transaction[],
  debts: Debt[],
  savings: SavingsGoal[],
  projects: Project[]
): { score: number; label: string; color: string; details: string[] } {
  const now = new Date()
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthTxs = transactions.filter(t => t.date.startsWith(ym))
  const income   = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  let score = 50
  const details: string[] = []

  if (income > 0) {
    const ratio = expenses / income
    if (ratio < 0.5)       { score += 20; details.push('✅ Dépenses < 50% des revenus') }
    else if (ratio < 0.7)  { score += 10; details.push('🟡 Dépenses raisonnables') }
    else if (ratio < 0.9)  { score -= 5;  details.push('⚠️ Dépenses élevées') }
    else                   { score -= 20; details.push('🔴 Dépenses > revenus') }
  }

  const owedDebts = debts.filter(d => d.type === 'owe')
  if (owedDebts.length === 0)      { score += 15; details.push('✅ Aucune dette') }
  else if (owedDebts.length <= 2)  { score += 5;  details.push('🟡 Peu de dettes') }
  else                             { score -= 10; details.push('⚠️ Plusieurs dettes') }

  if (savings.length > 0) {
    const totalSaved = savings.reduce((s, g) => s + g.saved, 0)
    if (totalSaved > income * 3) { score += 15; details.push('✅ Fonds d\'urgence solide') }
    else                         { score += 5;  details.push('🟡 Épargne en cours') }
  } else {
    score -= 5; details.push('⚠️ Pas encore d\'épargne')
  }

  if (projects.length > 0) { score += 5; details.push('✅ Projets définis') }

  score = Math.max(0, Math.min(100, score))

  let label = 'Critique'
  let color = '#DC2626'
  if (score >= 80)      { label = 'Excellent';    color = '#16A34A' }
  else if (score >= 60) { label = 'Bien';          color = '#2563EB' }
  else if (score >= 40) { label = 'À améliorer';   color = '#D97706' }
  else if (score >= 20) { label = 'Fragile';       color = '#EF4444' }

  return { score, label, color, details }
}

// ─── Coach Plan ───────────────────────────────────────────────────────────────

export interface CoachPlan {
  totalIncome: number
  fixedCharges: number
  debtMinimums: number
  variableEstimate: number
  freeMoney: number
  snowballTarget: Debt | null
  snowballSuggestion: number
  savingsSuggestion: number
  leisureSuggestion: number
  alerts: string[]
  debtsByPriority: Debt[]
}

export function computeCoachPlan(
  debts: Debt[],
  recurringPayments: RecurringPayment[],
  monthlyIncomes: MonthlyIncome[],
  month: string
): CoachPlan {
  const owedDebts   = debts.filter(d => d.type === 'owe')
  const totalIncome = monthlyIncomes.filter(i => i.month === month).reduce((s, i) => s + i.amount, 0)

  const fixedCharges = recurringPayments.reduce((s, p) => {
    if (p.frequency === 'monthly') return s + p.defaultAmount
    if (p.frequency === 'yearly')  return s + p.defaultAmount / 12
    return s
  }, 0)

  const debtMinimums     = owedDebts.reduce((s, d) => s + d.minimumPayment, 0)
  const variableEstimate = totalIncome * 0.15
  const freeMoney        = Math.max(0, totalIncome - fixedCharges - debtMinimums - variableEstimate)
  const debtsByPriority  = [...owedDebts].filter(d => !d.recurring).sort((a, b) => a.remaining - b.remaining)
  const snowballTarget   = debtsByPriority[0] || null
  const snowballSuggestion = Math.round(freeMoney * 0.5)
  const savingsSuggestion  = Math.round(freeMoney * 0.3)
  const leisureSuggestion  = Math.round(freeMoney * 0.2)

  const alerts: string[] = []
  debtsByPriority.forEach(d => {
    if (d.minimumPayment > 0) {
      const ml = Math.ceil(d.remaining / d.minimumPayment)
      if (ml <= 3) alerts.push(`💡 "${d.person}" soldée dans ${ml} mois — prépare le snowball !`)
    }
    if (d.dueDate && new Date(d.dueDate) < new Date())
      alerts.push(`⚠️ La dette "${d.person}" est en retard !`)
  })
  if (snowballTarget && snowballSuggestion > 0) {
    const gain = Math.ceil(snowballTarget.remaining / snowballTarget.minimumPayment) -
                 Math.ceil(snowballTarget.remaining / (snowballTarget.minimumPayment + snowballSuggestion))
    if (gain > 0)
      alerts.push(`🚀 +${formatAmount(snowballSuggestion)}/mois sur "${snowballTarget.person}" = ${gain} mois gagnés !`)
  }
  if (totalIncome === 0)
    alerts.push('📝 Ajoute tes revenus du mois pour que le Coach calcule ton plan.')

  return {
    totalIncome, fixedCharges, debtMinimums, variableEstimate,
    freeMoney, snowballTarget, snowballSuggestion, savingsSuggestion,
    leisureSuggestion, alerts, debtsByPriority,
  }
}

// ─── Yearly Projection ────────────────────────────────────────────────────────

export interface MonthProjection {
  month: string
  label: string
  projectedBalance: number
  projectedIncome: number
  projectedExpenses: number
}

export function computeYearlyProjection(
  transactions: Transaction[],
  recurringPayments: RecurringPayment[],
  monthlyIncomes: MonthlyIncome[]
): MonthProjection[] {
  const now  = new Date()
  const year = now.getFullYear()

  const last3 = Array.from({ length: 3 }, (_, i) => {
    const d  = new Date(now.getFullYear(), now.getMonth() - i - 1, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const txs = transactions.filter(t => t.date.startsWith(ym))
    return {
      income:   txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expenses: txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    }
  })

  const avgIncome    = last3.reduce((s, m) => s + m.income, 0)   / 3 || 0
  const avgExpenses  = last3.reduce((s, m) => s + m.expenses, 0) / 3 || 0
  const fixedMonthly = recurringPayments
    .filter(p => p.frequency === 'monthly')
    .reduce((s, p) => s + p.defaultAmount, 0)

  let runningBalance = 0

  return Array.from({ length: 12 }, (_, m) => {
    const d     = new Date(year, m, 1)
    const ym    = `${year}-${String(m + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('fr-FR', { month: 'short' })
    const isPast = m < now.getMonth()
    const txs    = transactions.filter(t => t.date.startsWith(ym))

    const realIncome   = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const realExpenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const savedIncome  = monthlyIncomes.filter(i => i.month === ym).reduce((s, i) => s + i.amount, 0)

    const projIncome   = isPast ? realIncome   : (savedIncome || avgIncome)
    const projExpenses = isPast ? realExpenses : Math.max(avgExpenses, fixedMonthly)

    runningBalance += projIncome - projExpenses

    return { month: ym, label, projectedBalance: runningBalance, projectedIncome: projIncome, projectedExpenses: projExpenses }
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatAmount(amount: number, currency = 'MUR'): string {
  return new Intl.NumberFormat('fr-MU', {
    style: 'currency', currency, maximumFractionDigits: 0
  }).format(amount)
}

export function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getMonthLabel(ym: string): string {
  const [year, month] = ym.split('-')
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

export function monthsUntil(targetDate: string): number {
  const now    = new Date()
  const target = new Date(targetDate)
  return Math.max(0,
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth())
  )
}

export function debtEndDate(debt: Debt): Date | null {
  if (debt.recurring || debt.minimumPayment <= 0 || debt.remaining <= 0) return null
  const monthsLeft = Math.ceil(debt.remaining / debt.minimumPayment)
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + monthsLeft)
  return d
}

export function formatDebtEndDate(debt: Debt): string | null {
  const d = debtEndDate(debt)
  if (!d) return null
  return `Terminé en ${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
}

export function daysUntilDue(dueDate: string): number {
  const now    = new Date(); now.setHours(0, 0, 0, 0)
  const target = new Date(dueDate); target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Compatibility aliases ────────────────────────────────────────────────────

export type RecurringCharge = RecurringPayment

export const getRecurringCharges = getRecurringPayments

export const saveRecurringCharges  = async (_: RecurringPayment[]): Promise<void> => {}
export const saveRecurringPayments = async (_: RecurringPayment[]): Promise<void> => {}
export const saveMonthlyIncomes    = async (_: MonthlyIncome[]): Promise<void> => {}
export const saveProjects          = async (_: Project[]): Promise<void> => {}

export function projectMonthlyNeeded(p: Project): number {
  const months = monthsUntil(p.targetDate)
  if (months <= 0) return 0
  return Math.ceil((p.targetAmount - p.savedAmount) / months)
}
