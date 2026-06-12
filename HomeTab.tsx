'use client'
import { useState } from 'react'
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react'
import {
  Transaction, TransactionType, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  addTransaction, formatAmount, computeCoachPlan, currentYearMonth
} from '@/lib/storage'
import CoachTip from './CoachTip'

interface Props {
  transactions: Transaction[]
  onUpdate: () => void
}

const empty = {
  type: 'expense' as TransactionType,
  amount: '',
  category: EXPENSE_CATEGORIES[0],
  note: '',
  date: new Date().toISOString().slice(0, 10),
}

export default function HomeTab({ transactions, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)

  const now = new Date()
  const ym = currentYearMonth()
  const monthTxs = transactions.filter(t => t.date.startsWith(ym))
  const income   = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const balance  = income - expenses
  const recent   = transactions.slice(0, 5)

  const plan = computeCoachPlan(ym)
  const tip = plan.alerts[0] ?? (
    balance > 0
      ? `Tu as ${formatAmount(balance)} de solde ce mois. ${plan.freeMoney > 0 ? `Pense à mettre ${formatAmount(plan.savingsSuggestion)} de côté !` : ''}`
      : 'Ajoute tes revenus du mois pour que le Coach t\'aide.'
  )

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) return
    addTransaction({
      type: form.type,
      amount: Number(form.amount),
      category: form.category,
      note: form.note,
      date: form.date,
    })
    setForm(empty)
    setShowForm(false)
    onUpdate()
  }

  const monthName = now.toLocaleDateString('fr-FR', { month: 'long' })

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <div className={`card-lg text-white ${balance >= 0
        ? 'bg-gradient-to-br from-accent to-blue-700'
        : 'bg-gradient-to-br from-danger to-red-700'}`}>
        <p className="text-sm font-medium opacity-80 mb-1 capitalize">{monthName}</p>
        <p className="text-4xl font-bold font-mono mb-4">{formatAmount(balance)}</p>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="opacity-70" />
            <div>
              <p className="text-xs opacity-70">Revenus</p>
              <p className="text-sm font-bold font-mono">{formatAmount(income)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown size={16} className="opacity-70" />
            <div>
              <p className="text-xs opacity-70">Dépenses</p>
              <p className="text-sm font-bold font-mono">{formatAmount(expenses)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Coach tip */}
      <CoachTip message={tip} />

      {/* Bouton ajouter */}
      <button
        onClick={() => setShowForm(true)}
        className="btn-primary w-full gap-2 text-base py-4"
      >
        <Plus size={20} /> Ajouter une transaction
      </button>

      {/* Transactions récentes */}
      {recent.length > 0 && (
        <div className="card space-y-1">
          <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3">
            Récentes
          </p>
          {recent.map(tx => (
            <div key={tx.id}
              className="flex items-center justify-between py-3 border-b border-mist last:border-0">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0
                  ${tx.type === 'income' ? 'bg-positive' : 'bg-danger'}`} />
                <div>
                  <p className="text-sm font-semibold text-ink">{tx.note || tx.category}</p>
                  <p className="text-xs text-ink-soft">
                    {tx.category} · {new Date(tx.date).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
              <span className={`font-mono text-sm font-bold
                ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
                {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom sheet formulaire */}
      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvelle transaction</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Type toggle */}
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button
                className={`flex-1 py-3 text-sm font-bold transition-colors
                  ${form.type === 'expense' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({ ...f, type: 'expense', category: EXPENSE_CATEGORIES[0] }))}
              >💸 Dépense</button>
              <button
                className={`flex-1 py-3 text-sm font-bold transition-colors
                  ${form.type === 'income' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({ ...f, type: 'income', category: INCOME_CATEGORIES[0] }))}
              >💰 Revenu</button>
            </div>

            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input text-2xl font-bold" type="number"
                placeholder="0" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>

            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: Courses Jumbo"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>

            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>

            <button className="btn-primary w-full text-base py-4" onClick={handleSubmit}>
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
