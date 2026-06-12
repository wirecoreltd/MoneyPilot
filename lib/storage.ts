// ─── Types ───────────────────────────────────────────────────────────────────

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
  createdAt: string
}

export interface Debt {
  id: string
  type: 'owe' | 'owed'
  person: string
  amount: number
  remaining: number
  minimumPayment: number        // ← NOUVEAU : minimum obligatoire/mois
  interestRate?: number         // ← NOUVEAU : taux annuel optionnel
  note: string
  dueDate?: string
  createdAt: string
}

export interface RecurringCharge {  // ← NOUVEAU
  id: string
  name: string
  amount: number
  type: 'fixed' | 'variable'        // fixe ou variable
  category: 'logement' | 'transport' | 'assurance' | 'école' | 'alimentation' | 'factures' | 'autre'
  frequency: 'monthly' | 'yearly' | 'once'
  note?: string
}

export interface MonthlyIncome {    // ← NOUVEAU
  id: string
  label: string
  amount: number
  isFixed: boolean                   // salaire fixe vs revenu variable
  month: string                      // YYYY-MM
}

// ─── Categories ──────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
  'Vêtements', 'Éducation', 'Factures', 'Restaurants', 'Épargne', 'Autre'
]

export const INCOME_CATEGORIES = [
  'Salaire', 'Freelance', 'Investissements', 'Cadeau', 'Remboursement', 'Autre'
]

export const RECURRING_CATEGORIES = [
  'logement', 'transport', 'assurance', 'école', 'alimentation', 'factures', 'autre'
] as const

// ─── Storage helpers ──────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function save<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(data))
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export function getTransactions(): Transaction[] {
  return load<Transaction[]>('mb_transactions', [])
}
export function saveTransactions(txs: Transaction[]): void {
  save('mb_transactions', txs)
}
export function addTransaction(tx: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
  const newTx: Transaction = { ...tx, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
  saveTransactions([newTx, ...getTransactions()])
  return newTx
}
export function deleteTransaction(id: string): void {
  saveTransactions(getTransactions().filter(t => t.id !== id))
}

// ─── Budget ───────────────────────────────────────────────────────────────────

const DEFAULT_BUDGETS: BudgetCategory[] = [
  { id: '1', name: 'Alimentation', limit: 15000, color: '#F59E0B' },
  { id: '2', name: 'Transport', limit: 5000, color: '#3B82F6' },
  { id: '3', name: 'Loisirs', limit: 8000, color: '#8B5CF6' },
  { id: '4', name: 'Factures', limit: 10000, color: '#EF4444' },
]
export function getBudgets(): BudgetCategory[] {
  return load<BudgetCategory[]>('mb_budgets', DEFAULT_BUDGETS)
}
export function saveBudgets(budgets: BudgetCategory[]): void {
  save('mb_budgets', budgets)
}

// ─── Savings ─────────────────────────────────────────────────────────────────

export function getSavings(): SavingsGoal[] {
  return load<SavingsGoal[]>('mb_savings', [])
}
export function saveSavings(goals: SavingsGoal[]): void {
  save('mb_savings', goals)
}

// ─── Debts ────────────────────────────────────────────────────────────────────

export function getDebts(): Debt[] {
  return load<Debt[]>('mb_debts', [])
}
export function saveDebts(debts: Debt[]): void {
  save('mb_debts', debts)
}

// ─── Recurring Charges ────────────────────────────────────────────────────────

export function getRecurringCharges(): RecurringCharge[] {
  return load<RecurringCharge[]>('mb_recurring', [])
}
export function saveRecurringCharges(charges: RecurringCharge[]): void {
  save('mb_recurring', charges)
}

// ─── Monthly Income ───────────────────────────────────────────────────────────

export function getMonthlyIncomes(): MonthlyIncome[] {
  return load<MonthlyIncome[]>('mb_incomes', [])
}
export function saveMonthlyIncomes(incomes: MonthlyIncome[]): void {
  save('mb_incomes', incomes)
}

// ─── Coach Engine ─────────────────────────────────────────────────────────────

export interface CoachPlan {
  totalIncome: number
  fixedCharges: number
  debtMinimums: number
  variableEstimate: number
  freeMoney: number
  snowballTarget: Debt | null        // la dette prioritaire
  snowballSuggestion: number         // montant suggéré en plus
  savingsSuggestion: number
  leisureSuggestion: number
  alerts: string[]
  debtsByPriority: Debt[]            // triées petite → grande (snowball)
}

export function computeCoachPlan(month: string): CoachPlan {
  const debts = getDebts().filter(d => d.type === 'owe')
  const charges = getRecurringCharges()
  const incomes = getMonthlyIncomes().filter(i => i.month === month)

  // Revenus
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0)

  // Charges fixes mensuelles (annuelles divisées par 12)
  const fixedCharges = charges.reduce((s, c) => {
    if (c.frequency === 'monthly') return s + c.amount
    if (c.frequency === 'yearly') return s + c.amount / 12
    return s
  }, 0)

  // Minimums dettes
  const debtMinimums = debts.reduce((s, d) => s + d.minimumPayment, 0)

  // Estimation variable (essence, courses — on prend 15% du revenu comme base)
  const variableEstimate = totalIncome * 0.15

  // Argent libre
  const freeMoney = Math.max(0, totalIncome - fixedCharges - debtMinimums - variableEstimate)

  // Snowball : trier dettes par restant croissant
  const debtsByPriority = [...debts].sort((a, b) => a.remaining - b.remaining)
  const snowballTarget = debtsByPriority[0] || null

  // Répartition de l'argent libre : 50% snowball, 30% épargne, 20% loisirs
  const snowballSuggestion = Math.round(freeMoney * 0.5)
  const savingsSuggestion = Math.round(freeMoney * 0.3)
  const leisureSuggestion = Math.round(freeMoney * 0.2)

  // Alertes intelligentes
  const alerts: string[] = []

  debtsByPriority.forEach(d => {
    if (d.minimumPayment > 0) {
      const monthsLeft = Math.ceil(d.remaining / d.minimumPayment)
      if (monthsLeft <= 3) {
        alerts.push(`💡 "${d.person}" sera soldée dans ${monthsLeft} mois — prépare le snowball !`)
      }
    }
    if (d.dueDate && new Date(d.dueDate) < new Date()) {
      alerts.push(`⚠️ La dette envers "${d.person}" est en retard !`)
    }
  })

  if (snowballTarget && snowballSuggestion > 0) {
    const extraMonths = Math.floor(snowballTarget.remaining / (snowballTarget.minimumPayment + snowballSuggestion))
    const normalMonths = Math.ceil(snowballTarget.remaining / snowballTarget.minimumPayment)
    const gain = normalMonths - extraMonths
    if (gain > 0) {
      alerts.push(`🚀 En ajoutant ${formatAmount(snowballSuggestion)}/mois sur "${snowballTarget.person}", tu gagnes ${gain} mois !`)
    }
  }

  if (totalIncome === 0) {
    alerts.push('📝 Ajoute tes revenus du mois pour que le Coach puisse t\'aider.')
  }

  return {
    totalIncome, fixedCharges, debtMinimums, variableEstimate,
    freeMoney, snowballTarget, snowballSuggestion, savingsSuggestion,
    leisureSuggestion, alerts, debtsByPriority,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('fr-MU', {
    style: 'currency', currency: 'MUR', maximumFractionDigits: 0
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
