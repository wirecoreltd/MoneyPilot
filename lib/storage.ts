// ─── Types ───────────────────────────────────────────────────────────────────

export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  category: string
  note: string
  date: string // ISO date string YYYY-MM-DD
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
  type: 'owe' | 'owed' // owe = je dois, owed = on me doit
  person: string
  amount: number
  remaining: number
  note: string
  dueDate?: string
  createdAt: string
}

// ─── Categories ──────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
  'Vêtements', 'Éducation', 'Factures', 'Restaurants', 'Épargne', 'Autre'
]

export const INCOME_CATEGORIES = [
  'Salaire', 'Freelance', 'Investissements', 'Cadeau', 'Remboursement', 'Autre'
]

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
  const txs = getTransactions()
  saveTransactions([newTx, ...txs])
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('fr-MU', { style: 'currency', currency: 'MUR', maximumFractionDigits: 0 }).format(amount)
}

export function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getMonthLabel(ym: string): string {
  const [year, month] = ym.split('-')
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}
