'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { SavingsGoal, getSavings, saveSavings, formatAmount } from '@/lib/storage'

const EMOJIS = ['🏖️', '🚗', '🏠', '💻', '📱', '✈️', '🎓', '💍', '🐕', '💰', '🎮', '👶']

export default function Savings() {
  const [goals, setGoals] = useState<SavingsGoal[]>(getSavings)
  const [showForm, setShowForm] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [addAmount, setAddAmount] = useState('')
  const [form, setForm] = useState({ name: '', target: '', emoji: EMOJIS[0] })

  function handleAdd() {
    if (!form.name || !form.target) return
    const goal: SavingsGoal = {
      id: crypto.randomUUID(),
      name: form.name,
      target: Number(form.target),
      saved: 0,
      emoji: form.emoji,
      createdAt: new Date().toISOString(),
    }
    const updated = [...goals, goal]
    setGoals(updated)
    saveSavings(updated)
    setForm({ name: '', target: '', emoji: EMOJIS[0] })
    setShowForm(false)
  }

  function handleDeposit(id: string) {
    if (!addAmount || Number(addAmount) <= 0) return
    const updated = goals.map(g => g.id === id ? { ...g, saved: g.saved + Number(addAmount) } : g)
    setGoals(updated)
    saveSavings(updated)
    setAddingTo(null)
    setAddAmount('')
  }

  function handleDelete(id: string) {
    const updated = goals.filter(g => g.id !== id)
    setGoals(updated)
    saveSavings(updated)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Épargne</h1>
          <p className="text-sm text-ink-soft mt-1">Vos objectifs financiers</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Objectif
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Nouvel objectif</h2>
              <button onClick={() => setShowForm(false)} className="text-ink-soft"><X size={20} /></button>
            </div>

            <div>
              <label className="label">Emoji</label>
              <div className="flex gap-2 flex-wrap">
                {EMOJIS.map(e => (
                  <button key={e}
                    className={`text-xl p-1.5 rounded-lg transition-colors ${form.emoji === e ? 'bg-accent-light' : 'hover:bg-mist'}`}
                    onClick={() => setForm(f => ({ ...f, emoji: e }))}
                  >{e}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Nom de l'objectif</label>
              <input className="input" placeholder="Ex: Vacances à Paris" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div>
              <label className="label">Montant cible (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.target}
                onChange={e => setForm(f => ({ ...f, target: e.target.value }))} />
            </div>

            <button className="btn-primary w-full py-3" onClick={handleAdd}>Créer l'objectif</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {goals.length === 0 ? (
          <div className="card text-center py-12 text-ink-soft col-span-2">
            <p className="text-4xl mb-3">🐖</p>
            <p className="font-medium">Aucun objectif d'épargne</p>
            <p className="text-sm mt-1">Créez un objectif pour commencer à épargner</p>
          </div>
        ) : (
          goals.map(g => {
            const pct = Math.min(100, (g.saved / g.target) * 100)
            const done = g.saved >= g.target

            return (
              <div key={g.id} className="card space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{g.emoji}</span>
                    <div>
                      <p className="font-medium text-ink text-sm">{g.name}</p>
                      {done && <span className="text-xs text-positive font-medium">✓ Atteint !</span>}
                    </div>
                  </div>
                  <button className="text-ink-soft hover:text-danger text-xs" onClick={() => handleDelete(g.id)}>✕</button>
                </div>

                <div className="space-y-1">
                  <div className="w-full h-2.5 bg-mist-dark rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: done ? '#16A34A' : '#2563EB' }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-ink-soft">
                    <span className="font-mono font-medium text-accent">{formatAmount(g.saved)}</span>
                    <span className="font-mono">{formatAmount(g.target)}</span>
                  </div>
                  <p className="text-xs text-ink-soft text-right">{pct.toFixed(0)}% atteint</p>
                </div>

                {addingTo === g.id ? (
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      type="number"
                      placeholder="Montant à ajouter"
                      value={addAmount}
                      onChange={e => setAddAmount(e.target.value)}
                      autoFocus
                    />
                    <button className="btn-primary px-3" onClick={() => handleDeposit(g.id)}>OK</button>
                    <button className="btn-ghost px-3" onClick={() => setAddingTo(null)}>✕</button>
                  </div>
                ) : (
                  <button
                    className="w-full py-2 text-sm font-medium text-accent bg-accent-light rounded-xl hover:bg-blue-200 transition-colors"
                    onClick={() => { setAddingTo(g.id); setAddAmount('') }}
                  >
                    + Ajouter de l'argent
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
