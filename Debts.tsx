'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Debt, getDebts, saveDebts, formatAmount } from '@/lib/storage'

export default function Debts() {
  const [debts, setDebts] = useState<Debt[]>(getDebts)
  const [showForm, setShowForm] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [form, setForm] = useState({
    type: 'owe' as 'owe' | 'owed',
    person: '',
    amount: '',
    minimumPayment: '',
    interestRate: '',
    note: '',
    dueDate: '',
  })

  function handleAdd() {
    if (!form.person || !form.amount) return
    const debt: Debt = {
      id: crypto.randomUUID(),
      type: form.type,
      person: form.person,
      amount: Number(form.amount),
      remaining: Number(form.amount),
      minimumPayment: Number(form.minimumPayment) || 0,
      interestRate: form.interestRate ? Number(form.interestRate) : undefined,
      note: form.note,
      dueDate: form.dueDate || undefined,
      createdAt: new Date().toISOString(),
    }
    const updated = [...debts, debt]
    setDebts(updated)
    saveDebts(updated)
    setForm({ type: 'owe', person: '', amount: '', minimumPayment: '', interestRate: '', note: '', dueDate: '' })
    setShowForm(false)
  }

  function handlePayment(id: string) {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) return
    const updated = debts
      .map(d => d.id !== id ? d : { ...d, remaining: Math.max(0, d.remaining - amt) })
      .filter(d => d.remaining > 0)
    setDebts(updated)
    saveDebts(updated)
    setPayingId(null)
    setPayAmount('')
  }

  const owe = debts.filter(d => d.type === 'owe')
  const owed = debts.filter(d => d.type === 'owed')
  const totalOwe = owe.reduce((s, d) => s + d.remaining, 0)
  const totalOwed = owed.reduce((s, d) => s + d.remaining, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Dettes & Prêts</h1>
          <p className="text-sm text-ink-soft mt-1">Ce que tu dois et ce qu'on te doit</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card bg-danger-light border-red-200">
          <p className="text-xs text-danger uppercase tracking-wide font-medium">Je dois</p>
          <p className="text-xl font-bold font-mono text-danger mt-1">{formatAmount(totalOwe)}</p>
        </div>
        <div className="card bg-positive-light border-green-200">
          <p className="text-xs text-positive uppercase tracking-wide font-medium">On me doit</p>
          <p className="text-xl font-bold font-mono text-positive mt-1">{formatAmount(totalOwed)}</p>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Nouvelle dette / prêt</h2>
              <button onClick={() => setShowForm(false)} className="text-ink-soft"><X size={20} /></button>
            </div>

            <div className="flex rounded-xl overflow-hidden border border-mist-dark">
              <button
                className={`flex-1 py-2 text-sm font-medium ${form.type === 'owe' ? 'bg-danger text-white' : 'text-ink-soft bg-white'}`}
                onClick={() => setForm(f => ({ ...f, type: 'owe' }))}
              >Je dois</button>
              <button
                className={`flex-1 py-2 text-sm font-medium ${form.type === 'owed' ? 'bg-positive text-white' : 'text-ink-soft bg-white'}`}
                onClick={() => setForm(f => ({ ...f, type: 'owed' }))}
              >On me doit</button>
            </div>

            <div>
              <label className="label">{form.type === 'owe' ? 'À qui je dois ?' : 'Qui me doit ?'}</label>
              <input className="input" placeholder="Nom / institution" value={form.person}
                onChange={e => setForm(f => ({ ...f, person: e.target.value }))} />
            </div>
            <div>
              <label className="label">Montant total (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Minimum mensuel obligatoire (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.minimumPayment}
                onChange={e => setForm(f => ({ ...f, minimumPayment: e.target.value }))} />
            </div>
            <div>
              <label className="label">Taux d'intérêt annuel % (optionnel)</label>
              <input className="input" type="number" placeholder="Ex: 12" value={form.interestRate}
                onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Note</label>
              <input className="input" placeholder="Ex: Crédit voiture" value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <div>
              <label className="label">Échéance (optionnel)</label>
              <input className="input" type="date" value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <button className="btn-primary w-full py-3" onClick={handleAdd}>Enregistrer</button>
          </div>
        </div>
      )}

      {debts.length === 0 ? (
        <div className="card text-center py-12 text-ink-soft">
          <p className="text-4xl mb-3">🤝</p>
          <p className="font-medium">Aucune dette ou prêt</p>
          <p className="text-sm mt-1">Super, vous êtes quitte !</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...owe, ...owed].map(d => {
            const isOverdue = d.dueDate && new Date(d.dueDate) < new Date()
            const paidPct = Math.round(((d.amount - d.remaining) / d.amount) * 100)
            const monthsLeft = d.minimumPayment > 0 ? Math.ceil(d.remaining / d.minimumPayment) : null

            return (
              <div key={d.id} className={`card space-y-3 border-l-4 ${d.type === 'owe' ? 'border-l-danger' : 'border-l-positive'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${d.type === 'owe' ? 'bg-danger-light text-danger' : 'bg-positive-light text-positive'}`}>
                        {d.type === 'owe' ? '→ Je dois à' : '← Doit à moi'}
                      </span>
                      <span className="font-medium text-sm text-ink">{d.person}</span>
                    </div>
                    {d.note && <p className="text-xs text-ink-soft mt-1">{d.note}</p>}
                    {d.minimumPayment > 0 && (
                      <p className="text-xs text-ink-soft mt-1">
                        Min. {formatAmount(d.minimumPayment)}/mois
                        {monthsLeft && <span className="ml-2 text-warning font-medium">· ~{monthsLeft} mois restants</span>}
                      </p>
                    )}
                    {d.dueDate && (
                      <p className={`text-xs mt-1 font-medium ${isOverdue ? 'text-danger' : 'text-ink-soft'}`}>
                        {isOverdue ? '⚠️ En retard · ' : 'Échéance : '}
                        {new Date(d.dueDate).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-bold text-sm text-ink">{formatAmount(d.remaining)}</p>
                    {paidPct > 0 && <p className="text-xs text-ink-soft">{paidPct}% remboursé</p>}
                  </div>
                </div>

                {d.remaining < d.amount && (
                  <div className="w-full h-1.5 bg-mist-dark rounded-full">
                    <div className="h-full bg-positive rounded-full" style={{ width: `${paidPct}%` }} />
                  </div>
                )}

                {payingId === d.id ? (
                  <div className="flex gap-2">
                    <input className="input flex-1" type="number" placeholder="Montant remboursé"
                      value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus />
                    <button className="btn-primary px-3" onClick={() => handlePayment(d.id)}>OK</button>
                    <button className="btn-ghost px-3" onClick={() => setPayingId(null)}>✕</button>
                  </div>
                ) : (
                  <button
                    className="w-full py-1.5 text-sm font-medium text-ink-soft bg-mist rounded-lg hover:bg-mist-dark transition-colors"
                    onClick={() => { setPayingId(d.id); setPayAmount('') }}
                  >
                    Enregistrer un remboursement
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
