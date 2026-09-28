// lib/budgetPeriods.ts
// Durées de plafond, cycle courant, sommes par catégorie. Fonctions PURES.
import { isoDate } from './finance'
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
