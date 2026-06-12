'use client'

import { useState, useEffect } from 'react'
import { Plus, X, Trash2, Brain, TrendingUp, AlertTriangle, Target } from 'lucide-react'
import {
  computeCoachPlan, CoachPlan,
  getRecurringCharges, saveRecurringCharges, RecurringCharge,
  getMonthlyIncomes, saveMonthlyIncomes, MonthlyIncome,
  currentYearMonth, getMonthLabel, formatAmount,
  RECURRING_CATEGORIES
} from '@/lib/storage'

const CATEGORY_EMOJI: Record<string, string> = {
  logement: '🏠', transport: '🚗', assurance: '🛡️',
  école: '🎓', alimentation: '🛒', factures: '⚡', autre: '📦'
}

export default function Coach() {
  const month = currentYearMonth()
  const [plan, setPlan] = useState<CoachPlan | null>(null)
  const [charges, setCharges] = useState<RecurringCharge[]>([])
  const [incomes, setIncomes] = useState<MonthlyIncome[]>([])
  const [showChargeForm, setShowChargeForm] = useState(false)
  const [showIncomeForm, setShowIncomeForm] = useState(false)

  const [chargeForm, setChargeForm] = useState({
    name: '', amount: '', type: 'fixed' as 'fixed' | 'variable',
    category: 'logement' as RecurringCharge['category'],
    frequency: 'monthly' as 'monthly' | 'yearly' | 'once',
    note: ''
  })

  const [incomeForm, setIncomeForm] = useState({
    label: '', amount: '', isFixed: true
  })

  function reload() {
    setCharges(getRecurringCharges())
    setIncomes(getMonthlyIncomes().filter(i => i.month === month))
    setPlan(computeCoachPlan(month))
  }

  useEffect(() => { reload() }, [])

  function handleAddCharge() {
    if (!chargeForm.name || !chargeForm.amount) return
    const charge: RecurringCharge = {
      id: crypto.randomUUID(),
      name: chargeForm.name,
      amount: Number(chargeForm.amount),
      type: chargeForm.type,
      category: chargeForm.category,
      frequency: chargeForm.frequency,
      note: chargeForm.note || undefined,
    }
    const updated = [...getRecurringCharges(), charge]
    saveRecurringCharges(updated)
    setChargeForm({ name: '', amount: '', type: 'fixed', category: 'logement', frequency: 'monthly', note: '' })
    setShowChargeForm(false)
    reload()
  }

  function handleDeleteCharge(id: string) {
    saveRecurringCharges(getRecurringCharges().filter(c => c.id !== id))
    reload()
  }

  function handleAddIncome() {
    if (!incomeForm.label || !incomeForm.amount) return
    const income: MonthlyIncome = {
      id: crypto.randomUUID(),
      label: incomeForm.label,
      amount: Number(incomeForm.amount),
      isFixed: incomeForm.isFixed,
      month,
    }
    const all = getMonthlyIncomes()
    saveMonthlyIncomes([...all, income])
    setIncomeForm({ label: '', amount: '', isFixed: true })
    setShowIncomeForm(false)
    reload()
  }

  function handleDeleteIncome(id: string) {
    saveMonthlyIncomes(getMonthlyIncomes().filter(i => i.id !== id))
    reload()
  }

  const monthLabel = getMonthLabel(month)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-accent-light text-accent">
          <Brain size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">Coach Financier</h1>
          <p className="text-sm text-ink-soft mt-0.5 capitalize">{monthLabel}</p>
        </div>
      </div>

      {/* Alertes */}
      {plan && plan.alerts.length > 0 && (
        <div className="space-y-2">
          {plan.alerts.map((alert, i) => (
            <div key={i} className="flex items-start gap-3 p-4 bg-warning-light border border-yellow-200 rounded-2xl">
              <AlertTriangle size={16} className="text-warning mt-0.5 flex-shrink-0" />
              <p className="text-sm text-ink">{alert}</p>
            </div>
          ))}
        </div>
      )}

      {/* Plan du mois */}
      {plan && plan.totalIncome > 0 && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <TrendingUp size={16} className="text-accent" /> Plan du mois
          </h2>

          {[
            { label: 'Revenus totaux', amount: plan.totalIncome, color: 'text-positive' },
            { label: '− Charges fixes', amount: -plan.fixedCharges, color: 'text-danger' },
            { label: '− Minimums dettes', amount: -plan.debtMinimums, color: 'text-danger' },
            { label: '− Variable estimé (15%)', amount: -plan.variableEstimate, color: 'text-warning' },
          ].map((row, i) => (
            <div key={i} className="flex justify-between items-center py-1 border-b border-mist last:border-0">
              <span className="text-sm text-ink-soft">{row.label}</span>
              <span className={`font-mono text-sm font-semibold ${row.color}`}>
                {row.amount < 0 ? '−' : '+'}{formatAmount(Math.abs(row.amount))}
              </span>
            </div>
          ))}

          <div className="flex justify-between items-center pt-2">
            <span className="font-semibold text-ink">= Argent libre</span>
            <span className={`font-mono font-bold text-lg ${plan.freeMoney > 0 ? 'text-positive' : 'text-danger'}`}>
              {formatAmount(plan.freeMoney)}
            </span>
          </div>

          {plan.freeMoney > 0 && (
            <div className="bg-mist rounded-xl p-4 space-y-2 mt-2">
              <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3">
                💡 Suggestion d'utilisation
              </p>
              {[
                { label: `🎯 Snowball dette (${plan.snowballTarget?.person || '—'})`, amount: plan.snowballSuggestion, color: 'text-danger' },
                { label: '🐖 Épargne famille', amount: plan.savingsSuggestion, color: 'text-accent' },
                { label: '🎉 Toi / loisirs', amount: plan.leisureSuggestion, color: 'text-positive' },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-sm text-ink">{row.label}</span>
                  <span className={`font-mono text-sm font-bold ${row.color}`}>{formatAmount(row.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Snowball tracker */}
      {plan && plan.debtsByPriority.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <Target size={16} className="text-danger" /> Ordre Snowball (petite → grande)
          </h2>
          {plan.debtsByPriority.map((d, i) => {
            const monthsLeft = d.minimumPayment > 0 ? Math.ceil(d.remaining / d.minimumPayment) : null
            const monthsWithExtra = (d.minimumPayment + (i === 0 ? plan.snowballSuggestion : 0)) > 0
              ? Math.ceil(d.remaining / (d.minimumPayment + (i === 0 ? plan.snowballSuggestion : 0)))
              : null

            return (
              <div key={d.id} className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? 'bg-danger-light border border-red-200' : 'bg-mist'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-danger text-white' : 'bg-mist-dark text-ink-soft'}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{d.person}</p>
                  <p className="text-xs text-ink-soft">
                    {formatAmount(d.remaining)} restant
                    {monthsLeft && ` · ${monthsLeft} mois`}
                    {i === 0 && monthsWithExtra && monthsWithExtra < (monthsLeft || 999) && (
                      <span className="text-positive font-medium"> → {monthsWithExtra} mois avec snowball ✓</span>
                    )}
                  </p>
                </div>
                {i === 0 && <span className="text-xs bg-danger text-white px-2 py-0.5 rounded-full font-medium">Priorité</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Revenus du mois */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Revenus de {monthLabel}</h2>
          <button className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3"
            onClick={() => setShowIncomeForm(true)}>
            <Plus size={14} /> Ajouter
          </button>
        </div>

        {incomes.length === 0 ? (
          <p className="text-sm text-ink-soft text-center py-4">Aucun revenu saisi ce mois-ci</p>
        ) : (
          incomes.map(inc => (
            <div key={inc.id} className="flex items-center justify-between py-1.5 border-b border-mist last:border-0">
              <div>
                <p className="text-sm font-medium text-ink">{inc.label}</p>
                <p className="text-xs text-ink-soft">{inc.isFixed ? 'Fixe' : 'Variable'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-positive">+{formatAmount(inc.amount)}</span>
                <button className="text-ink-soft hover:text-danger" onClick={() => handleDeleteIncome(inc.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Charges récurrentes */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Charges récurrentes</h2>
          <button className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3"
            onClick={() => setShowChargeForm(true)}>
            <Plus size={14} /> Ajouter
          </button>
        </div>

        {charges.length === 0 ? (
          <p className="text-sm text-ink-soft text-center py-4">Aucune charge enregistrée</p>
        ) : (
          charges.map(c => (
            <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-mist last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">{CATEGORY_EMOJI[c.category]}</span>
                <div>
                  <p className="text-sm font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-ink-soft capitalize">
                    {c.category} · {c.frequency === 'monthly' ? 'mensuel' : c.frequency === 'yearly' ? 'annuel' : 'unique'}
                    {c.type === 'variable' && ' · variable'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-danger">
                  −{formatAmount(c.frequency === 'yearly' ? c.amount / 12 : c.amount)}
                  {c.frequency === 'yearly' && <span className="text-xs text-ink-soft">/mois</span>}
                </span>
                <button className="text-ink-soft hover:text-danger" onClick={() => handleDeleteCharge(c.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal : ajouter revenu */}
      {showIncomeForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Ajouter un revenu</h2>
              <button onClick={() => setShowIncomeForm(false)}><X size={20} /></button>
            </div>
            <div>
              <label className="label">Source</label>
              <input className="input" placeholder="Ex: Salaire, Freelance..." value={incomeForm.label}
                onChange={e => setIncomeForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input" type="number" placeholder="0" value={incomeForm.amount}
                onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="flex rounded-xl overflow-hidden border border-mist-dark">
              <button
                className={`flex-1 py-2 text-sm font-medium ${incomeForm.isFixed ? 'bg-accent text-white' : 'text-ink-soft bg-white'}`}
                onClick={() => setIncomeForm(f => ({ ...f, isFixed: true }))}
              >Fixe</button>
              <button
                className={`flex-1 py-2 text-sm font-medium ${!incomeForm.isFixed ? 'bg-accent text-white' : 'text-ink-soft bg-white'}`}
                onClick={() => setIncomeForm(f => ({ ...f, isFixed: false }))}
              >Variable</button>
            </div>
            <button className="btn-primary w-full py-3" onClick={handleAddIncome}>Enregistrer</button>
          </div>
        </div>
      )}

      {/* Modal : ajouter charge */}
      {showChargeForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Nouvelle charge récurrente</h2>
              <button onClick={() => setShowChargeForm(false)}><X size={20} /></button>
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input" placeholder="Ex: Loyer, Assurance auto..." value={chargeForm.name}
                onChange={e => setChargeForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input" type="number" placeholder="0" value={chargeForm.amount}
                onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={chargeForm.category}
                onChange={e => setChargeForm(f => ({ ...f, category: e.target.value as RecurringCharge['category'] }))}>
                {RECURRING_CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fréquence</label>
              <div className="flex rounded-xl overflow-hidden border border-mist-dark">
                {(['monthly', 'yearly', 'once'] as const).map(f => (
                  <button key={f}
                    className={`flex-1 py-2 text-xs font-medium ${chargeForm.frequency === f ? 'bg-accent text-white' : 'text-ink-soft bg-white'}`}
                    onClick={() => setChargeForm(cf => ({ ...cf, frequency: f }))}>
                    {f === 'monthly' ? 'Mensuel' : f === 'yearly' ? 'Annuel' : 'Unique'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Type</label>
              <div className="flex rounded-xl overflow-hidden border border-mist-dark">
                <button
                  className={`flex-1 py-2 text-sm font-medium ${chargeForm.type === 'fixed' ? 'bg-accent text-white' : 'text-ink-soft bg-white'}`}
                  onClick={() => setChargeForm(f => ({ ...f, type: 'fixed' }))}>Fixe</button>
                <button
                  className={`flex-1 py-2 text-sm font-medium ${chargeForm.type === 'variable' ? 'bg-accent text-white' : 'text-ink-soft bg-white'}`}
                  onClick={() => setChargeForm(f => ({ ...f, type: 'variable' }))}>Variable</button>
              </div>
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: Renouvellement en janvier" value={chargeForm.note}
                onChange={e => setChargeForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <button className="btn-primary w-full py-3" onClick={handleAddCharge}>Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  )
}
