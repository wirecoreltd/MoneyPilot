'use client'

import { useState, useMemo } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Transaction, BudgetCategory, getBudgets, saveBudgets, formatAmount } from '@/lib/storage'

interface Props {
  transactions: Transaction[]
}

const COLORS = ['#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444', '#10B981', '#F97316', '#EC4899', '#6366F1']

export default function Budget({ transactions }: Props) {
  const [budgets, setBudgets] = useState<BudgetCategory[]>(getBudgets)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', limit: '', color: COLORS[0] })

  // Current month spending per category
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const spendingByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(currentYM))
      .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount })
    return map
  }, [transactions, currentYM])

  function handleAdd() {
    if (!form.name || !form.limit) return
    const newBudget: BudgetCategory = {
      id: crypto.randomUUID(),
      name: form.name,
      limit: Number(form.limit),
      color: form.color,
    }
    const updated = [...budgets, newBudget]
    setBudgets(updated)
    saveBudgets(updated)
    setForm({ name: '', limit: '', color: COLORS[0] })
    setShowForm(false)
  }

  function handleDelete(id: string) {
    const updated = budgets.filter(b => b.id !== id)
    setBudgets(updated)
    saveBudgets(updated)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Budget</h1>
          <p className="text-sm text-ink-soft mt-1">Plafonds par catégorie ce mois-ci</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Catégorie
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Nouvelle catégorie</h2>
              <button onClick={() => setShowForm(false)} className="text-ink-soft"><X size={20} /></button>
            </div>

            <div>
              <label className="label">Nom</label>
              <input className="input" placeholder="Ex: Restaurants" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div>
              <label className="label">Plafond mensuel (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.limit}
                onChange={e => setForm(f => ({ ...f, limit: e.target.value }))} />
            </div>

            <div>
              <label className="label">Couleur</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c}
                    style={{ backgroundColor: c }}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c ? 'border-ink scale-110' : 'border-transparent'}`}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </div>

            <button className="btn-primary w-full py-3" onClick={handleAdd}>Enregistrer</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {budgets.length === 0 ? (
          <div className="card text-center py-12 text-ink-soft">
            <p className="text-4xl mb-3">🎯</p>
            <p className="font-medium">Aucun budget défini</p>
            <p className="text-sm mt-1">Ajoutez des plafonds pour contrôler vos dépenses</p>
          </div>
        ) : (
          budgets.map(b => {
            const spent = spendingByCategory[b.name] || 0
            const pct = Math.min(100, (spent / b.limit) * 100)
            const over = spent > b.limit
            const nearLimit = pct >= 80

            return (
              <div key={b.id} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="font-medium text-sm text-ink">{b.name}</span>
                    {over && <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-medium">Dépassé !</span>}
                  </div>
                  <button className="text-ink-soft hover:text-danger" onClick={() => handleDelete(b.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="w-full h-2 bg-mist-dark rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: over ? '#DC2626' : nearLimit ? '#D97706' : b.color
                    }}
                  />
                </div>

                <div className="flex justify-between text-xs text-ink-soft">
                  <span className={`font-mono font-medium ${over ? 'text-danger' : ''}`}>{formatAmount(spent)} dépensés</span>
                  <span className="font-mono">{formatAmount(b.limit)} plafond</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
