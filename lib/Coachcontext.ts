// lib/coachContext.ts — construit CÔTÉ SERVEUR le contexte envoyé au LLM, à partir des mêmes chiffres que l'écran.
import { debtEndLabel, formatAmount, isoDate, monthLabel, shiftMonth } from './finance'
import type { CoachPlan, HealthScore, MonthSnapshot, MonthSummary } from './finance'
import type { ProfileLite } from './data'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function buildChatContext(p: ProfileLite, m: MonthSummary, h: HealthScore, plan: CoachPlan): string {
  const f = (n: number) => formatAmount(n, p.currency || 'MUR')
  return [
    `Profil : ${p.firstName}, ${p.situation}, ${p.children} enfant(s), revenu déclaré ${f(p.monthlyIncome)} (${p.incomeType}), objectif : ${p.mainGoal}.`,
    `Ce mois : revenus ${f(m.income)}, dépenses ${f(m.expenses)}, factures payées ${f(m.billsPaid)} sur ${f(m.billsPlanned)}, mensualités de dettes payées ${f(m.debtPaid)} sur ${f(m.debtDue)}, épargne du mois ${f(m.savedNet)}.`,
    `Reste à vivre : ${f(m.remainingToLive)}. Épargne totale : ${f(m.totalSavings)}. Capital de dettes restant : ${f(m.totalDebtOwed)} (contexte, pas une charge mensuelle).`,
    `Score santé : ${h.score}/100 (${h.label}). Marge du mois selon le plan : ${f(plan.freeMoney)}.`,
  ].join('\n')
}

export function buildCoachContext(
  p: ProfileLite, s: MonthSnapshot, m: MonthSummary, plan: CoachPlan, h: HealthScore,
): string {
  const cur = p.currency || 'MUR'
  const f = (n: number) => formatAmount(n, cur)

  const profile = [
    `Prénom : ${p.firstName}`,
    `Revenu mensuel déclaré dans le profil : ${f(p.monthlyIncome)}`,
    `Situation familiale : ${p.situation}${p.children > 0 ? ` avec ${p.children} enfant(s)` : ''}`,
    `Type de revenu : ${p.incomeType}`,
    `Objectif principal : ${p.mainGoal}`,
  ].join('\n')

  const score = [
    `Score de santé financière : ${h.score}/100 (${h.label}) — calculé par l'application, ne pas le modifier.`,
    ...h.details.map(d => `  ${d}`),
  ].join('\n')

  const thisMonth = [
    `Revenus du mois : ${f(m.income)}`,
    `Dépenses ponctuelles : ${f(m.expenses)}`,
    `Factures : ${f(m.billsPaid)} payées sur ${f(m.billsPlanned)} (reste ${f(m.billsRemaining)})`,
    `Mensualités de dettes : ${f(m.debtPaid)} payées sur ${f(m.debtDue)} (reste ${f(m.debtRemaining)})`,
    `Épargne nette du mois : ${f(m.savedNet)}`,
    `💰 Reste à vivre réel (après factures et mensualités restantes) : ${f(m.remainingToLive)}`,
  ].join('\n')

  const planBlock = [
    `Charges fixes prévues (factures du mois + récurrents) : ${f(plan.fixedCharges)}`,
    `Total mensualités dettes (MENSUALITÉS, pas capitaux) : ${f(plan.debtMinimums)}`,
    `Dépenses variables estimées : ${f(plan.variableEstimate)}${plan.variableIsEstimate ? ' (estimation 15 % du revenu, pas d\'historique)' : ''}`,
    `Marge du mois (prévisionnelle) : ${f(plan.freeMoney)}`,
    plan.snowballTarget
      ? `Cible snowball : "${plan.snowballTarget.person}" (capital restant ${f(plan.snowballTarget.remaining)}, mensualité ${f(plan.snowballTarget.minimumPayment)}) — suggestion : +${f(plan.snowballSuggestion)}/mois`
      : 'Aucune cible snowball identifiée.',
    `Suggestion épargne/mois : ${f(plan.savingsSuggestion)}`,
    `Suggestion loisirs/mois : ${f(plan.leisureSuggestion)}`,
    plan.alerts.length ? `Alertes :\n${plan.alerts.map(a => `  ${a}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')

  const owe = s.debts.filter(d => d.type === 'owe' && (d.remaining > 0 || d.amount === 0))
  const debtsBlock = owe.length === 0 ? 'Aucune dette en cours.' : owe.map(d => {
    const ratio = m.income > 0 ? Math.round((d.minimumPayment / m.income) * 100) : 0
    const monthsLeft = d.minimumPayment > 0 ? Math.ceil(d.remaining / d.minimumPayment) : null
    return [
      `- "${d.person}" (catégorie: ${d.category})`,
      `  ⚠️ MENSUALITÉ = ${f(d.minimumPayment)} par mois (${ratio}% du revenu du mois)`,
      `  Capital restant : ${f(d.remaining)} — contexte uniquement, NE PAS comparer au revenu`,
      d.interestRate ? `  Taux d'intérêt : ${d.interestRate}%` : null,
      monthsLeft !== null ? `  Durée restante au rythme actuel : ${monthsLeft} mois${debtEndLabel(d) ? ` (${debtEndLabel(d)})` : ''}` : null,
      d.dueDate ? `  Échéance : ${d.dueDate}` : null,
      d.recurring ? '  Type : récurrente' : null,
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  const savingsBlock = s.goals.length === 0 ? 'Aucune épargne en cours.' : s.goals.map(g => {
    const pct = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0
    return `- "${g.name}" : ${f(g.saved)} / ${f(g.target)} (${pct}%)`
  }).join('\n')

  const projectsBlock = s.projects.length === 0 ? 'Aucun projet en cours.' : s.projects.map(pr =>
    `- ${pr.emoji} "${pr.name}" (${pr.type}) : ${f(pr.savedAmount)} / ${f(pr.targetAmount)}, contribution mensuelle : ${f(pr.monthlyContribution)}`,
  ).join('\n')

  const history = [1, 2, 3].map(i => {
    const ym = shiftMonth(s.month, -i)
    const txs = s.transactions.filter(t => t.date.slice(0, 7) === ym)
    const inc = sum(s.incomes.filter(x => x.month === ym).map(x => x.amount)) +
      sum(txs.filter(t => t.type === 'income').map(t => t.amount))
    const exp = sum(txs.filter(t => t.type === 'expense').map(t => t.amount))
    const byCat: Record<string, number> = {}
    txs.filter(t => t.type === 'expense').forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount })
    const lines = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, a]) => `    • ${c}: ${f(a)}`).join('\n')
    if (inc === 0 && exp === 0) return `${monthLabel(ym)} :\n  Aucune donnée saisie ce mois-là (ne pas l'interpréter comme un revenu nul).`
    return [
      `${monthLabel(ym)} :`,
      `  Revenus : ${f(inc)} | Dépenses ponctuelles : ${f(exp)}`,
      lines ? `  Détail :\n${lines}` : '  Aucune dépense ponctuelle enregistrée',
    ].join('\n')
  }).join('\n\n')

  const since = new Date(); since.setDate(since.getDate() - 30)
  const sinceIso = isoDate(since)
  const recent: Record<string, number> = {}
  s.transactions.filter(t => t.type === 'expense' && t.date.slice(0, 10) >= sinceIso)
    .forEach(t => { recent[t.category] = (recent[t.category] || 0) + t.amount })
  const recentBlock = Object.keys(recent).length === 0
    ? 'Pas de dépenses ponctuelles sur les 30 derniers jours.'
    : Object.entries(recent).sort((a, b) => b[1] - a[1]).map(([c, a]) => `- ${c}: ${f(a)}`).join('\n')

  return [
    `PROFIL UTILISATEUR :\n${profile}`,
    `═══ SCORE (fiable) ═══\n${score}`,
    `═══ CE MOIS-CI (${monthLabel(s.month)}) ═══\n${thisMonth}`,
    `═══ PLAN PRÉ-CALCULÉ (fiable, ne pas recalculer) ═══\n${planBlock}`,
    `═══ DETTES ═══\nIMPORTANT : la charge d'une dette = sa MENSUALITÉ.\n${debtsBlock}`,
    `═══ ÉPARGNES ═══\n${savingsBlock}`,
    `═══ PROJETS ═══\n${projectsBlock}`,
    `═══ HISTORIQUE 3 DERNIERS MOIS ═══\n${history}`,
    `═══ DÉPENSES PONCTUELLES DES 30 DERNIERS JOURS ═══\n${recentBlock}`,
  ].join('\n\n')
}
