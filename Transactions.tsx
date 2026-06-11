'use client'

import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import {
  Transaction, TransactionType, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  addTransaction, deleteTransaction, formatAmount
} from '@/lib/storage'

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

export default function Transactions({ transactions, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  function handleTypeChange(type: TransactionType) {
    setForm(f => ({
      ...f,
      type,
      category: type === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]
    }))
  }

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

  function handleDelete(id: string) {
    deleteTransaction(id)
    onUpdate()
  }

  const filtered = transactions.filter(t => filter === 'all' || t.type === filter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Transactions</h1>
          <p className="text-sm text-ink-soft mt-1">{transactions.length} entrée(s)</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'income', 'expense'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-accent text-white' : 'bg-white text-ink-soft border border-mist-dark hover:bg-mist'
            }`}
          >
            {f === 'all' ? 'Tout' : f === 'income' ? 'Revenus' : 'Dépenses'}
          </button>
        ))}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Nouvelle transaction</h2>
              <button onClick={() => setShowForm(false)} className="text-ink-soft hover:text-ink">
                <X size={20} />
              </button>
            </div>

            <div className="flex rounded-xl overflow-hidden border border-mist-dark">
              <button
                className={`flex-1 py-2 text-sm font-medium transition-colors ${form.type === 'expense' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => handleTypeChange('expense')}
              >Dépense</button>
              <button
                className={`flex-1 py-2 text-sm font-medium transition-colors ${form.type === 'income' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => handleTypeChange('income')}
              >Revenu</button>
            </div>

            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.amount}
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
              <input className="input" placeholder="Ex: Courses Jumbo" value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>

            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>

            <button className="btn-primary w-full py-3" onClick={handleSubmit}>
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center py-12 text-ink-soft">
            <p className="text-4xl mb-3">💸</p>
            <p className="font-medium">Aucune transaction</p>
            <p className="text-sm mt-1">Cliquez sur "Ajouter" pour commencer</p>
          </div>
        ) : (
          filtered.map(tx => (
            <div key={tx.id} className="card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.type === 'income' ? 'bg-positive' : 'bg-danger'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{tx.note || tx.category}</p>
                  <p className="text-xs text-ink-soft">{tx.category} · {new Date(tx.date).toLocaleDateString('fr-FR')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`font-mono text-sm font-semibold ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}
                </span>
                <button className="text-ink-soft hover:text-danger transition-colors" onClick={() => handleDelete(tx.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
