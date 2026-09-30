// lib/budgetPeriods.ts
// Durées de plafond, cycle courant, sommes par catégorie. Fonctions PURES.
import { isoDate, budgetStatus } from './finance'
import type { BudgetStatus } from './finance'
import type { SpendingLine } from './data'

export const BUDGET_DURATIONS = [
  { months: 1,  label: '1 mois' },
  { months: 3,  label: '3 mois' },
  { months: 6,  label: '6 mois' },
  { months: 12, label: '1 an' },
  { months: 36, label: '3 ans' },
]

export function durationLabel(months: number): string {
  return BUDGET_DURATIONS.find(d => d.months === months)?.label ?? `${months} mois`
}

// Ajoute n mois en gardant le jour (borné au dernier jour du mois cible : 31 janv + 1 mois = 28/29 fév)
function addMonths(d: Date, n: number): Date {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  t.setDate(Math.min(d.getDate(), last))
  return t
}

/**
 * Cycle en cours d'un plafond : démarre à la date de création et se renouvelle
 * automatiquement tous les `months` mois. Retourne des dates 'YYYY-MM-DD' (bornes incluses).
 */
export function currentCycle(
  createdAt: string | undefined,
  months: number,
  today: Date = new Date(),
): { from: string; to: string } {
  const step = Math.max(1, Math.floor(months) || 1) // garde-fou : jamais de boucle infinie

  let base = createdAt ? new Date(createdAt) : null
  if (!base || isNaN(base.getTime())) base = new Date(today.getFullYear(), today.getMonth(), 1)

  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  // Plafond créé dans le futur (horloge décalée) : on le traite comme démarrant aujourd'hui
  if (start.getTime() > t.getTime()) start.setTime(t.getTime())

  let k = 0
  while (addMonths(start, (k + 1) * step).getTime() <= t.getTime()) k++

  const from = addMonths(start, k * step)
  const next = addMonths(start, (k + 1) * step)
  const last = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1)
  return { from: isoDate(from), to: isoDate(last) }
}

export function sumCategory(lines: SpendingLine[], category: string, from: string, to: string): number {
  let s = 0
  for (const l of lines) {
    if (l.category === category && l.date >= from && l.date <= to) s += l.amount
  }
  return s
}

export function sumByCategory(lines: SpendingLine[], from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of lines) {
    if (l.date >= from && l.date <= to) out[l.category] = (out[l.category] || 0) + l.amount
  }
  return out
}

// ─── Statut des plafonds (règle unique, utilisée par Budget, Dépenses, Accueil) ───

type BudgetLike = {
  id: string; name: string; limit: number; color: string
  periodMonths?: number; createdAt?: string
  startDate?: string | null; endDate?: string | null
}

/** Un plafond est « perso » quand il a une date de début ET de fin. */
export function isCustomBudget(b: Pick<BudgetLike, 'startDate' | 'endDate'>): boolean {
  return !!(b.startDate && b.endDate)
}

/**
 * Cycle d'un plafond : la plage perso si elle est définie (elle ne se renouvelle pas),
 * sinon le cycle récurrent en mois. Règle unique pour toute l'app.
 */
export function budgetCycle(
  b: Pick<BudgetLike, 'startDate' | 'endDate' | 'createdAt' | 'periodMonths'>,
  today: Date = new Date(),
): { from: string; to: string } {
  if (b.startDate && b.endDate) return { from: b.startDate, to: b.endDate }
  return currentCycle(b.createdAt, b.periodMonths ?? 1, today)
}

/** Début du plus ancien cycle : à partir de quand charger les dépenses. null = aucun plafond. */
export function earliestCycleStart(budgets: BudgetLike[], today: Date = new Date()): string | null {
  if (budgets.length === 0) return null
  return budgets.reduce((min, b) => {
    const f = budgetCycle(b, today).from
    return f < min ? f : min
  }, '9999-12-31')
}

/** Statut de chaque plafond sur SON cycle courant (ou sa plage perso). */
export function computeBudgetStatuses(
  budgets: BudgetLike[], lines: SpendingLine[], today: Date = new Date(),
): BudgetStatus[] {
  return budgets.map(b => {
    const cycle = budgetCycle(b, today)
    const spent = sumCategory(lines, b.name, cycle.from, cycle.to)
    return {
      id: b.id, name: b.name, limit: b.limit, color: b.color,
      spent, ...budgetStatus(spent, b.limit),
      periodMonths: b.periodMonths ?? 1, cycleFrom: cycle.from, cycleTo: cycle.to,
    }
  })
}
