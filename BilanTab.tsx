'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, X, Check, Pencil } from 'lucide-react'
import {
  Transaction, MonthlyIncome, ChecklistItem,
  getMonthlyIncomes, addMonthlyIncome, deleteMonthlyIncome,
  getMonthlyChecklist, addRecurringPayment, deleteRecurringPayment,
  toggleRecurringPayment, toggleDebtPayment,
  getDebts, computeCoachPlan, computeYearlyProjection,
  currentYearMonth, formatAmount,
  RecurringPayment, RECURRING_CATEGORIES, RECURRING_CATEGORY_EMOJI
} from '@/lib/storage'
import CoachTip from './CoachTip'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine
} from 'recharts'

interface Props { transactions: Transaction[] }

export default function BilanTab({ transactions }: Props) {
  const month = currentYearMonth()

  const [incomes,   setIncomes]   = useState<MonthlyIncome[]>([])
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [plan,      setPlan]      = useState(computeCoachPlan([], [], [], month))
  const [projection, setProjection] = useState(computeYearlyProjection(transactions, [], []))

  const [showIncomeForm, setShowIncomeForm] = useState(false)
  const [showRecForm,    setShowRecForm]    = useState(false)
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [editAmount,     setEditAmount]     = useState('')

  const [inf, setInf] = useState({ label: '', amount: '', isFixed: true })
  const [rf,  setRf]  = useState({
    name: '', defaultAmount: '',
    category: 'logement' as RecurringPayment['category'],
    frequency: 'monthly' as 'monthly' | 'yearly', note: ''
  })

  const reload = useCallback(async () => {
  const [inc, items, debts] = await Promise.all([
    getMonthlyIncomes(month),
    getMonthlyChecklist(month),
    getDebts(),
  ])
  setIncomes(inc)
  setChecklist(items)
  setPlan(computeCoachPlan(debts, [], inc, month))
  setProjection(computeYearlyProjection(transactions, [], inc))
}, [month, transactions])

  useEffect(() => { reload() }, [reload])

  // ── Checklist handlers (récurrents + dettes) ────────────────────────────────

  async function handleCheck(item: ChecklistItem) {
    if (item.source === 'recurring') {
      await toggleRecurringPayment(item.id, month)
    } else {
      const result = await toggleDebtPayment(item.id, month)
      if (result.deleted) {
        // dette soldée et supprimée
      }
    }
    reload()
  }

  function handleEditAmount(item: ChecklistItem) {
    setEditAmount(String(item.amount))
    setEditingId(item.id)
  }

  async function handleSaveEdit(item: ChecklistItem) {
    const amt = Number(editAmount)
    if (amt > 0) {
      if (item.source === 'recurring') {
        await toggleRecurringPayment(item.id, month, amt)
      } else {
        await toggleDebtPayment(item.id, month, amt)
      }
      reload()
    }
    setEditingId(null)
    setEditAmount('')
  }

  async function addRecurring() {
    if (!rf.name || !rf.defaultAmount) return
    await addRecurringPayment({
      name:          rf.name,
      defaultAmount: Number(rf.defaultAmount),
      category:      rf.category,
      frequency:     rf.frequency,
      note:          rf.note || undefined,
    })
    setRf({ name: '', defaultAmount: '', category: 'logement', frequency: 'monthly', note: '' })
    setShowRecForm(false)
    reload()
  }

  async function handleDeleteRecurring(id: string) {
    await deleteRecurringPayment(id)
    reload()
  }

  // ── Income handlers ─────────────────────────────────────────────────────────

  async function addIncome() {
    if (!inf.label || !inf.amount) return
    await addMonthlyIncome({
      label:   inf.label,
      amount:  Number(inf.amount),
      isFixed: inf.isFixed,
      month,
    })
    setInf({ label: '', amount: '', isFixed: true })
    setShowIncomeForm(false)
    reload()
  }

  async function handleDeleteIncome(id: string) {
    await deleteMonthlyIncome(id)
    reload()
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const tip = plan.alerts[0] ??
    (plan.freeMoney > 0
      ? `Ce mois tu as ${formatAmount(plan.freeMoney)} libres. Suggestion : ${formatAmount(plan.snowballSuggestion)} dettes · ${formatAmount(plan.savingsSuggestion)} épargne · ${formatAmount(plan.leisureSuggestion)} loisirs.`
      : `Ajoute tes revenus pour voir ton plan complet.`)

  const paidCount  = checklist.filter(i => i.paid).length
  const totalCount = checklist.length
  const endBalance = projection[projection.length - 1]?.projectedBalance ?? 0

  return (
    <div className="space-y-4">
      <CoachTip message={tip} />

      {/* ── Checklist récurrents + dettes ────────────────────────────────────── */}
      <div className="card-lg space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Paiements du mois</p>
            {totalCount > 0 && (
              <p className="text-xs text-ink-soft mt-0.5">{paidCount}/{totalCount} payés</p>
            )}
          </div>
          <button onClick={() => setShowRecForm(true)}
            className="w-9 h-9 rounded-xl bg-accent-light text-accent flex items-center justify-center">
            <Plus size={18}/>
          </button>
        </div>

        {totalCount > 0 && (
          <div className="w-full h-2 bg-mist-dark rounded-full overflow-hidden">
            <div className="h-full bg-positive rounded-full transition-all duration-500"
              style={{ width: `${(paidCount / totalCount) * 100}%` }}/>
          </div>
        )}

        {checklist.length === 0 ? (
          <p className="text-sm text-ink-soft text-center py-4">
            Ajoute tes charges récurrentes (loyer, assurances...) — les dettes avec un remboursement minimum apparaissent ici automatiquement.
          </p>
        ) : (
          <div className="space-y-2">
            {checklist.map(item => {
              const isEditing = editingId === item.id
              return (
                <div key={`${item.source}-${item.id}`}
                  className={`flex items-center gap-3 p-3 rounded-2xl transition-all
                    ${item.paid ? 'bg-positive-light' : 'bg-mist'}`}>

                  <button onClick={() => handleCheck(item)}
                    className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center
                                flex-shrink-0 transition-all active:scale-95
                                ${item.paid ? 'bg-positive border-positive' : 'bg-white border-mist-dark'}`}>
                    {item.paid && <Check size={14} className="text-white" strokeWidth={3}/>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate
                      ${item.paid ? 'text-positive line-through opacity-70' : 'text-ink'}`}>
                      {item.emoji} {item.name}
                      {item.source === 'debt' && (
                        <span className="ml-1 text-[10px] font-bold text-danger bg-danger-light px-1.5 py-0.5 rounded-full align-middle">
                          dette
                        </span>
                      )}
                    </p>
                    {isEditing ? (
                      <div className="flex gap-2 mt-1">
                        <input className="input py-1 text-sm flex-1" type="number"
                          value={editAmount} onChange={e => setEditAmount(e.target.value)} autoFocus/>
                        <button className="bg-accent text-white px-3 rounded-xl text-xs font-bold active:scale-95"
                          onClick={() => handleSaveEdit(item)}>OK</button>
                        <button className="bg-mist text-ink-soft px-3 rounded-xl text-xs font-bold"
                          onClick={() => setEditingId(null)}>✕</button>
                      </div>
                    ) : (
                      <p className="text-xs text-ink-soft font-mono">
                        {formatAmount(item.amount)}
                        {item.amount !== item.defaultAmount && (
                          <span className="ml-1 text-warning">(défaut: {formatAmount(item.defaultAmount)})</span>
                        )}
                        {item.source === 'debt' && !item.hasTotal && (
                          <span className="ml-1 text-ink-soft">(pas de montant total)</span>
                        )}
                      </p>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleEditAmount(item)}
                        className="w-8 h-8 rounded-xl bg-white text-ink-soft flex items-center justify-center active:scale-95">
                        <Pencil size={13}/>
                      </button>
                      {item.source === 'recurring' && (
                        <button onClick={() => handleDeleteRecurring(item.id)}
                          className="w-8 h-8 rounded-xl bg-white text-ink-soft hover:text-danger flex items-center justify-center active:scale-95">
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Plan du mois ─────────────────────────────────────────────────────── */}
      {plan.totalIncome > 0 && (
        <div className="card-lg space-y-3">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Plan du mois</p>
          {[
            { label: 'Revenus',         amount: plan.totalIncome,      sign: '+', color: 'text-positive' },
            { label: 'Charges fixes',   amount: plan.fixedCharges,     sign: '−', color: 'text-danger'  },
            { label: 'Minimums dettes', amount: plan.debtMinimums,     sign: '−', color: 'text-danger'  },
            { label: 'Variable (15%)',  amount: plan.variableEstimate, sign: '−', color: 'text-warning' },
          ].map((row, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-mist last:border-0">
              <span className="text-sm text-ink-soft">{row.label}</span>
              <span className={`font-mono text-sm font-bold ${row.color}`}>
                {row.sign} {formatAmount(row.amount)}
              </span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-1">
            <span className="font-bold text-ink">Argent libre</span>
            <span className={`font-mono font-bold text-xl ${plan.freeMoney > 0 ? 'text-positive' : 'text-danger'}`}>
              {formatAmount(plan.freeMoney)}
            </span>
          </div>
          {plan.freeMoney > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[
                { label: '🎯 Dettes',  amount: plan.snowballSuggestion, color: 'bg-danger-light text-danger' },
                { label: '🐖 Épargne', amount: plan.savingsSuggestion,  color: 'bg-accent-light text-accent' },
                { label: '🎉 Loisirs', amount: plan.leisureSuggestion,  color: 'bg-positive-light text-positive' },
              ].map((s, i) => (
                <div key={i} className={`${s.color} rounded-2xl p-3 text-center`}>
                  <p className="text-xs font-semibold">{s.label}</p>
                  <p className="font-mono font-bold text-sm mt-1">{formatAmount(s.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Projection annuelle ──────────────────────────────────────────────── */}
      <div className="card-lg space-y-3">
        <div>
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">
            Projection {new Date().getFullYear()}
          </p>
          <p className={`text-2xl font-bold font-mono mt-1 ${endBalance >= 0 ? 'text-positive' : 'text-danger'}`}>
            {formatAmount(endBalance)}
          </p>
          <p className="text-xs text-ink-soft">solde projeté en décembre</p>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={projection}>
            <defs>
              <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8EAF0"/>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${(v/1000).toFixed(0)}k`}/>
            <Tooltip formatter={(v: number) => formatAmount(v)}
              contentStyle={{ borderRadius: 12, border: '1px solid #E8EAF0', fontSize: 12 }}/>
            <ReferenceLine y={0} stroke="#DC2626" strokeDasharray="4 4"/>
            <Area type="monotone" dataKey="projectedBalance"
              stroke="#2563EB" strokeWidth={2} fill="url(#balGrad)" name="Solde projeté"/>
          </AreaChart>
        </ResponsiveContainer>

        <div className="space-y-1 max-h-48 overflow-y-auto">
          {projection.map((m, i) => {
            const now    = new Date()
            const isPast = i < now.getMonth()
            return (
              <div key={m.month}
                className={`flex items-center justify-between py-2 px-1 rounded-xl
                  ${m.month === currentYearMonth() ? 'bg-accent-light' : ''}`}>
                <span className={`text-sm font-semibold capitalize w-10 ${isPast ? 'text-ink-soft' : 'text-ink'}`}>
                  {m.label}
                </span>
                <div className="flex gap-4 text-xs font-mono">
                  <span className="text-positive">+{formatAmount(m.projectedIncome)}</span>
                  <span className="text-danger">−{formatAmount(m.projectedExpenses)}</span>
                  <span className={`font-bold ${m.projectedBalance >= 0 ? 'text-accent' : 'text-danger'}`}>
                    {formatAmount(m.projectedBalance)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Revenus du mois ──────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Revenus ce mois</p>
          <button onClick={() => setShowIncomeForm(true)}
            className="w-9 h-9 rounded-xl bg-accent-light text-accent flex items-center justify-center">
            <Plus size={18}/>
          </button>
        </div>
        {incomes.length === 0
          ? <p className="text-sm text-ink-soft text-center py-3">Aucun revenu saisi</p>
          : incomes.map(inc => (
            <div key={inc.id} className="flex items-center justify-between py-2 border-b border-mist last:border-0">
              <div>
                <p className="text-sm font-semibold text-ink">{inc.label}</p>
                <p className="text-xs text-ink-soft">{inc.isFixed ? 'Fixe' : 'Variable'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-positive">+{formatAmount(inc.amount)}</span>
                <button onClick={() => handleDeleteIncome(inc.id)}
                  className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))
        }
      </div>

      {/* ── Graphique 6 mois ─────────────────────────────────────────────────── */}
      {transactions.length > 0 && (
        <div className="card">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-4">
            Revenus vs Dépenses — 6 mois
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={(() => {
              const now = new Date()
              return Array.from({ length: 6 }, (_, i) => {
                const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
                const ym  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
                const txs = transactions.filter(t => t.date.startsWith(ym))
                return {
                  month:    d.toLocaleDateString('fr-FR', { month: 'short' }),
                  Revenus:  txs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0),
                  Dépenses: txs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0),
                }
              })
            })()} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EAF0"/>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`}/>
              <Tooltip formatter={(v: number) => formatAmount(v)}
                contentStyle={{ borderRadius: 12, border: '1px solid #E8EAF0', fontSize: 12 }}/>
              <Bar dataKey="Revenus"  fill="#16A34A" radius={[6,6,0,0]}/>
              <Bar dataKey="Dépenses" fill="#DC2626" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Modal : ajouter récurrent ─────────────────────────────────────────── */}
      {showRecForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Paiement récurrent</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowRecForm(false)}><X size={20}/></button>
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input" placeholder="Ex: Loyer, Internet..." value={rf.name}
                onChange={e => setRf(f => ({...f, name: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant par défaut (Rs)</label>
              <input className="input" type="number" placeholder="0" value={rf.defaultAmount}
                onChange={e => setRf(f => ({...f, defaultAmount: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={rf.category}
                onChange={e => setRf(f => ({...f, category: e.target.value as RecurringPayment['category']}))}>
                {RECURRING_CATEGORIES.map(c => (
                  <option key={c} value={c}>{RECURRING_CATEGORY_EMOJI[c]} {c}</option>
                ))}
              </select>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold
                ${rf.frequency === 'monthly' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setRf(f => ({...f, frequency: 'monthly'}))}>Mensuel</button>
              <button className={`flex-1 py-3 text-sm font-bold
                ${rf.frequency === 'yearly' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setRf(f => ({...f, frequency: 'yearly'}))}>Annuel</button>
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: Débit le 5 du mois" value={rf.note}
                onChange={e => setRf(f => ({...f, note: e.target.value}))}/>
            </div>
            <p className="text-xs text-ink-soft px-1">
              💡 Pour une dette avec remboursement mensuel, ajoute-la dans l'onglet Dettes — elle apparaîtra automatiquement ici.
            </p>
            <button className="btn-primary w-full py-4" onClick={addRecurring}>Enregistrer</button>
          </div>
        </div>
      )}

      {/* ── Modal : ajouter revenu ───────────────────────────────────────────── */}
      {showIncomeForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Ajouter un revenu</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowIncomeForm(false)}><X size={20}/></button>
            </div>
            <div>
              <label className="label">Source</label>
              <input className="input" placeholder="Ex: Salaire, Freelance..." value={inf.label}
                onChange={e => setInf(f => ({...f, label: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input" type="number" placeholder="0" value={inf.amount}
                onChange={e => setInf(f => ({...f, amount: e.target.value}))}/>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold
                ${inf.isFixed ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setInf(f => ({...f, isFixed: true}))}>Fixe</button>
              <button className={`flex-1 py-3 text-sm font-bold
                ${!inf.isFixed ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setInf(f => ({...f, isFixed: false}))}>Variable</button>
            </div>
            <button className="btn-primary w-full py-4" onClick={addIncome}>Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  )
}
