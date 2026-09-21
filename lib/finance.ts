// lib/finance.ts
// Source unique de vérité pour tous les chiffres de MoneyPilot.
// Fonctions PURES : aucun accès réseau, aucun React -> utilisables côté client ET serveur.
// Accueil, Budget, Coach (et plus tard Synthèse) doivent tous passer par ici.

// ─── Types du snapshot (photo en lecture seule de la base) ────────────────────

export interface SnapTransaction { id: string; type: 'income' | 'expense'; amount: number; category: string; note: string; date: string }
export interface SnapIncome { id: string; label: string; amount: number; isFixed: boolean; month: string }
export interface SnapFacture { id: string; name: string; amount: number; category: string; dueDate?: string; isRecurring: boolean }
export interface SnapFacturePayment { factureId: string; amount: number; paidAt: string }
export interface SnapDebt {
  id: string; type: 'owe' | 'owed'; person: string
  amount: number; remaining: number; minimumPayment: number
  interestRate?: number; dueDate?: string; recurring: boolean; category: string
}
export interface SnapDebtPayment { debtId: string; amount: number; paidAt: string; category: string }
export interface SnapGoal { id: string; name: string; target: number; saved: number; category: string }
export interface SnapDeposit { goalId: string; amount: number; isWithdrawal: boolean; date: string }
export interface SnapBudget { id: string; name: string; limit: number; color: string }
export interface SnapRecurring {
  id: string; name: string; category: string; defaultAmount: number
  frequency: 'monthly' | 'yearly'; paid: boolean; paidAmount: number
}
export interface SnapProject {
  id: string; name: string; emoji: string; type: string
  targetAmount: number; savedAmount: number; targetDate: string; monthlyContribution: number
}

/**
 * Tout ce qu'il faut pour calculer un mois.
 * - transactions : le mois demandé + les 3 mois précédents (pour les moyennes / l'historique)
 * - incomes      : idem (champ `month`)
 * - factures     : uniquement celles du mois ; facturePayments = TOUS les paiements de ces factures
 * - debtPayments / deposits : uniquement ceux du mois
 */
export interface MonthSnapshot {
  month: string // 'YYYY-MM'
  transactions: SnapTransaction[]
  incomes: SnapIncome[]
  factures: SnapFacture[]
  facturePayments: SnapFacturePayment[]
  debts: SnapDebt[]
  debtPayments: SnapDebtPayment[]
  goals: SnapGoal[]
  deposits: SnapDeposit[]
  budgets: SnapBudget[]
  recurring: SnapRecurring[]
  projects: SnapProject[]
}

// ─── Helpers de date / format ─────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x))
const inMonth = (date: string, ym: string) => (date ?? '').slice(0, 7) === ym

export function currentYearMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function lastDayOf(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

export function formatAmount(amount: number, currency = 'MUR'): string {
  return new Intl.NumberFormat('fr-MU', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount)
}

export function debtEndLabel(d: Pick<SnapDebt, 'remaining' | 'minimumPayment' | 'recurring'>): string | null {
  if (d.recurring || d.minimumPayment <= 0 || d.remaining <= 0) return null
  const months = Math.ceil(d.remaining / d.minimumPayment)
  const end = new Date()
  end.setDate(1)
  end.setMonth(end.getMonth() + months)
  return `Terminé en ${end.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
}

// Catégorie récurrente (minuscule) -> catégorie de budget. UNE seule copie.
export const RECURRING_TO_BUDGET: Record<string, string> = {
  logement: 'Logement', transport: 'Transport', alimentation: 'Alimentation',
  factures: 'Factures', assurance: 'Factures', école: 'Éducation',
  dette: 'Dette', autre: 'Autre',
}

// ─── Résumé du mois ───────────────────────────────────────────────────────────

export interface BudgetStatus {
  id: string; name: string; limit: number; color: string
  spent: number; pct: number; status: 'ok' | 'near' | 'over'
}

export interface MonthSummary {
  month: string
  // Entrées
  income: number          // revenus déclarés + transactions de type "revenu"
  incomeDeclared: number  // table monthly_incomes
  incomeOther: number     // transactions de type "revenu"
  debtReceived: number    // remboursements reçus sur les prêts "on me doit" (entrée de cash, hors revenus)
  // Sorties
  expenses: number        // dépenses ponctuelles (transactions)
  billsPlanned: number    // factures du mois (montants)
  billsPaid: number       // paiements faits sur les factures du mois
  billsRemaining: number  // reste à payer sur les factures du mois
  debtDue: number         // somme des mensualités dues (dettes "je dois" actives)
  debtPaid: number        // remboursements de dettes payés ce mois
  debtRemaining: number   // mensualités encore à payer ce mois
  recurringPaid: number   // anciens "paiements récurrents" cochés (legacy)
  savedNet: number        // dépôts - retraits d'épargne ce mois
  totalOut: number        // dépenses + factures payées + dettes payées + récurrents payés
  // Résultats
  balance: number          // ce qui reste réellement en poche ce mois (cash)
  remainingToLive: number  // balance - factures restantes - mensualités restantes
  // Patrimoine / dettes
  totalSavings: number
  totalDebtOwed: number    // capital restant dû (contexte : PAS une charge mensuelle)
  totalOwedToMe: number
  monthlyCost: number      // coût mensuel engagé : dépenses + factures + mensualités
  safetyMonths: number | null // épargne / coût mensuel
  // Détail
  spendingByCategory: Record<string, number>
  budgets: BudgetStatus[]
}

export function computeMonthSummary(s: MonthSnapshot): MonthSummary {
  const m = s.month
  const monthTx = s.transactions.filter(t => inMonth(t.date, m))
  const expenseTx = monthTx.filter(t => t.type === 'expense')

  // Entrées
  const incomeDeclared = sum(s.incomes.filter(i => i.month === m).map(i => i.amount))
  const incomeOther = sum(monthTx.filter(t => t.type === 'income').map(t => t.amount))
  const income = incomeDeclared + incomeOther
  const expenses = sum(expenseTx.map(t => t.amount))

  // Factures : objets "du mois" -> tous leurs paiements comptent pour ce mois
  const factureById = new Map(s.factures.map(f => [f.id, f]))
  const paidByFacture: Record<string, number> = {}
  for (const p of s.facturePayments) {
    if (factureById.has(p.factureId)) {
      paidByFacture[p.factureId] = (paidByFacture[p.factureId] || 0) + p.amount
    }
  }
  const billsPlanned = sum(s.factures.map(f => f.amount))
  const billsPaid = sum(Object.values(paidByFacture))
  const billsRemaining = sum(s.factures.map(f => Math.max(0, f.amount - (paidByFacture[f.id] || 0))))

  // Dettes : les paiements sont datés ; "on me doit" = argent reçu, pas dépensé
  const debtById = new Map(s.debts.map(d => [d.id, d]))
  const monthDebtPayments = s.debtPayments.filter(p => inMonth(p.paidAt, m))
  let debtPaid = 0
  let debtReceived = 0
  const paidByDebt: Record<string, number> = {}
  for (const p of monthDebtPayments) {
    if (debtById.get(p.debtId)?.type === 'owed') { debtReceived += p.amount; continue }
    debtPaid += p.amount
    paidByDebt[p.debtId] = (paidByDebt[p.debtId] || 0) + p.amount
  }
  const activeOwe = s.debts.filter(d => d.type === 'owe' && d.minimumPayment > 0 && (d.amount === 0 || d.remaining > 0))
  const debtDue = sum(activeOwe.map(d => d.minimumPayment))
  const debtRemaining = sum(activeOwe.map(d => Math.max(0, d.minimumPayment - (paidByDebt[d.id] || 0))))

  // Épargne
  const savedNet = sum(
    s.deposits.filter(d => inMonth(d.date, m)).map(d => (d.isWithdrawal ? -d.amount : d.amount)),
  )
  const totalSavings = sum(s.goals.map(g => g.saved))
  const totalDebtOwed = sum(s.debts.filter(d => d.type === 'owe').map(d => d.remaining))
  const totalOwedToMe = sum(s.debts.filter(d => d.type === 'owed').map(d => d.remaining))

  // Legacy : paiements récurrents cochés
  const recurringPaid = 0

  // Dépenses par catégorie (même logique pour Budget, Home, Coach)
  const spendingByCategory: Record<string, number> = {}
  const add = (cat: string, amt: number) => {
    if (!cat) return
    spendingByCategory[cat] = (spendingByCategory[cat] || 0) + amt
  }
  expenseTx.forEach(t => add(t.category, t.amount))
  s.facturePayments.forEach(p => {
    const f = factureById.get(p.factureId)
    if (f) add(f.category || 'Autre', p.amount)
  })
  monthDebtPayments.forEach(p => {
    const d = debtById.get(p.debtId)
    if (d?.type === 'owed') return
    add(p.category || d?.category || 'Autre', p.amount)
  })

  // Totaux
  const totalOut = expenses + billsPaid + debtPaid + recurringPaid
  const balance = income + debtReceived - totalOut - savedNet
  const remainingToLive = balance - billsRemaining - debtRemaining
  const monthlyCost = expenses + billsPlanned + debtDue
  const safetyMonths = monthlyCost > 0 ? totalSavings / monthlyCost : null

  const budgets: BudgetStatus[] = s.budgets.map(b => {
    const spent = spendingByCategory[b.name] || 0
    const pct = b.limit > 0 ? (spent / b.limit) * 100 : 0
    return { ...b, spent, pct, status: spent > b.limit ? 'over' : pct >= 80 ? 'near' : 'ok' }
  })

  return {
    month: m,
    income, incomeDeclared, incomeOther, debtReceived,
    expenses, billsPlanned, billsPaid, billsRemaining,
    debtDue, debtPaid, debtRemaining, recurringPaid, savedNet, totalOut,
    balance, remainingToLive,
    totalSavings, totalDebtOwed, totalOwedToMe, monthlyCost, safetyMonths,
    spendingByCategory, budgets,
  }
}

export function averagePreviousExpenses(s: MonthSnapshot, monthsBack = 3): number | null {
  const totals: number[] = []
  for (let i = 1; i <= monthsBack; i++) {
    const ym = shiftMonth(s.month, -i)
    const txs = s.transactions.filter(t => t.type === 'expense' && inMonth(t.date, ym))
    if (txs.length > 0) totals.push(sum(txs.map(t => t.amount)))
  }
  return totals.length > 0 ? sum(totals) / totals.length : null
}

// ─── Score de santé (déterministe, 0-100) ─────────────────────────────────────
// Trésorerie 35 pts + poids des mensualités 25 + épargne de sécurité 25 + budgets 15.
// Le LLM n'invente plus de score : il explique celui-ci.

export interface HealthScore {
  score: number
  label: string
  color: string
  details: string[]
  complete: boolean // false tant qu'aucun revenu n'est saisi
}

export function computeHealthScore(m: MonthSummary, debts: SnapDebt[], today: Date = new Date()): HealthScore {
  if (m.income <= 0) {
    return {
      score: 0, label: 'À compléter', color: '#8896B0', complete: false,
      details: ['📝 Ajoute tes revenus du mois pour calculer ton score.'],
    }
  }

  const details: string[] = []
  const pctTxt = (x: number) => `${Math.round(x * 100)} %`

  // 1. Trésorerie : sorties engagées / revenus
  const outflow = m.expenses + Math.max(m.billsPlanned, m.billsPaid) + Math.max(m.debtDue, m.debtPaid) + m.recurringPaid
  const ratio = outflow / m.income
  const cashPts = 35 * clamp((1.1 - ratio) / 0.6)
  details.push(
    ratio < 0.5 ? '✅ Dépenses et charges < 50 % des revenus'
      : ratio < 0.7 ? '🟡 Dépenses et charges raisonnables'
      : ratio < 0.9 ? '⚠️ Dépenses et charges élevées'
      : ratio < 1 ? '🔴 Dépenses et charges ≈ revenus'
      : '🔴 Dépenses et charges supérieures aux revenus',
  )

  // 2. Poids des MENSUALITÉS (jamais le capital total)
  const debtRatio = m.debtDue / m.income
  const iso = isoDate(today)
  const overdue = debts.filter(d =>
    d.type === 'owe' && !d.recurring && d.remaining > 0 && !!d.dueDate && d.dueDate.slice(0, 10) < iso)
  let debtPts = 25 * clamp((0.4 - debtRatio) / 0.3)
  if (overdue.length > 0) debtPts = Math.max(0, debtPts - 5)
  details.push(
    m.debtDue === 0 ? '✅ Aucune mensualité de dette'
      : debtRatio <= 0.15 ? `✅ Mensualités légères (${pctTxt(debtRatio)} des revenus)`
      : debtRatio <= 0.3 ? `🟡 Mensualités = ${pctTxt(debtRatio)} des revenus`
      : `🔴 Mensualités lourdes (${pctTxt(debtRatio)} des revenus)`,
  )
  if (overdue.length > 0) details.push(`⚠️ Dette en retard : ${overdue[0].person}`)

  // 3. Épargne de sécurité (en mois de dépenses engagées)
  const months = outflow > 0 ? m.totalSavings / outflow : 0
  const fundPts = 25 * clamp(months / 6)
  details.push(
    months >= 6 ? `✅ Épargne solide (${months.toFixed(1)} mois)`
      : months >= 3 ? `✅ Fonds d'urgence correct (${months.toFixed(1)} mois)`
      : months > 0 ? `🟡 Épargne en cours (${months.toFixed(1)} mois)`
      : "⚠️ Pas encore d'épargne",
  )

  // 4. Discipline budgétaire
  let budgetPts = 8 // neutre quand aucun plafond n'est défini
  if (m.budgets.length > 0) {
    const over = m.budgets.filter(b => b.status === 'over')
    budgetPts = 15 * ((m.budgets.length - over.length) / m.budgets.length)
    details.push(over.length === 0 ? '✅ Tous les plafonds respectés' : `⚠️ ${over.length} plafond(s) dépassé(s)`)
  }

  const score = Math.min(100, Math.max(0, Math.round(cashPts + debtPts + fundPts + budgetPts)))
  let label = 'Critique'
  let color = '#DC2626'
  if (score >= 80) { label = 'Excellent'; color = '#16A34A' }
  else if (score >= 60) { label = 'Bien'; color = '#2563EB' }
  else if (score >= 40) { label = 'À améliorer'; color = '#D97706' }
  else if (score >= 20) { label = 'Fragile'; color = '#EF4444' }

  return { score, label, color, details, complete: true }
}

export function urgencyFromScore(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 70) return 'low'
  if (score >= 45) return 'medium'
  if (score >= 25) return 'high'
  return 'critical'
}

// ─── Plan du Coach ────────────────────────────────────────────────────────────

export interface CoachPlan {
  totalIncome: number
  fixedCharges: number
  debtMinimums: number
  variableEstimate: number
  variableIsEstimate: boolean // true = 15 % du revenu faute d'historique
  freeMoney: number           // "marge du mois" prévisionnelle (≠ reste à vivre réel)
  snowballTarget: SnapDebt | null
  snowballSuggestion: number
  savingsSuggestion: number
  leisureSuggestion: number
  alerts: string[]
  debtsByPriority: SnapDebt[]
}

export function buildCoachPlan(s: MonthSnapshot, m: MonthSummary, today: Date = new Date()): CoachPlan {
  const owe = s.debts.filter(d => d.type === 'owe' && d.remaining > 0)

  const fixedCharges = m.billsPlanned
  const debtMinimums = m.debtDue

  const avg = averagePreviousExpenses(s)
  const observed = Math.max(avg ?? 0, m.expenses)
  const variableIsEstimate = observed <= 0
  const variableEstimate = variableIsEstimate ? m.income * 0.15 : observed

  const freeMoney = Math.max(0, m.income - fixedCharges - debtMinimums - variableEstimate)

  const debtsByPriority = owe
    .filter(d => !d.recurring && d.minimumPayment > 0)
    .sort((a, b) => a.remaining - b.remaining)
  const snowballTarget = debtsByPriority[0] ?? null
  const snowballSuggestion = Math.round(freeMoney * 0.5)
  const savingsSuggestion = Math.round(freeMoney * 0.3)
  const leisureSuggestion = Math.round(freeMoney * 0.2)

  const alerts: string[] = []
  const iso = isoDate(today)
  for (const d of debtsByPriority) {
    const monthsLeft = Math.ceil(d.remaining / d.minimumPayment)
    if (monthsLeft <= 3) alerts.push(`💡 "${d.person}" soldée dans ${monthsLeft} mois — prépare le snowball !`)
  }
  for (const d of owe.filter(x => !x.recurring)) {
    if (d.dueDate && d.dueDate.slice(0, 10) < iso) alerts.push(`⚠️ La dette "${d.person}" est en retard !`)
  }
  if (snowballTarget && snowballSuggestion > 0) {
    const before = Math.ceil(snowballTarget.remaining / snowballTarget.minimumPayment)
    const after = Math.ceil(snowballTarget.remaining / (snowballTarget.minimumPayment + snowballSuggestion))
    if (before - after > 0) {
      alerts.push(`🚀 +${formatAmount(snowballSuggestion)}/mois sur "${snowballTarget.person}" = ${before - after} mois gagnés !`)
    }
  }
  if (m.income === 0) alerts.push('📝 Ajoute tes revenus du mois pour que le Coach calcule ton plan.')

  return {
    totalIncome: m.income, fixedCharges, debtMinimums, variableEstimate, variableIsEstimate,
    freeMoney, snowballTarget, snowballSuggestion, savingsSuggestion, leisureSuggestion,
    alerts, debtsByPriority,
  }
}

// ─── Score initial de l'onboarding (règles, pas de LLM) ──────────────────────

export interface OnboardingAnswers {
  incomeType?: string
  expenseLevel?: string
  debtType?: string
  savingsLevel?: string
  stressLevel?: string
}

export function initialScoreFromAnswers(a: OnboardingAnswers): number {
  const pick = (table: Record<string, number>, key?: string) => (key && key in table ? table[key] : 0)
  const total =
    pick({ low: 30, medium: 22, high: 10, crisis: 0 }, a.expenseLevel) +
    pick({ none: 25, credit: 18, personal: 15, multiple: 8, overdue: 0 }, a.debtType) +
    pick({ none: 0, little: 8, medium: 18, good: 25 }, a.savingsLevel) +
    pick({ fixed: 10, mixed: 8, variable: 6, none: 0 }, a.incomeType) +
    pick({ none: 10, low: 8, medium: 4, high: 0 }, a.stressLevel)
  return Math.min(100, Math.max(0, total))
}
