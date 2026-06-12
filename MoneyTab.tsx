'use client'
import { useState } from 'react'
import { Plus, Trash2, X, ChevronRight } from 'lucide-react'
import {
  Transaction, BudgetCategory, SavingsGoal, Debt,
  EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  addTransaction, deleteTransaction,
  getBudgets, saveBudgets,
  getSavings, saveSavings,
  getDebts, saveDebts,
  formatAmount, currentYearMonth, computeCoachPlan
} from '@/lib/storage'
import CoachTip from './CoachTip'

type SubTab = 'transactions' | 'budget' | 'dettes' | 'epargne'

interface Props {
  transactions: Transaction[]
  onUpdate: () => void
}

const COLORS = ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#10B981','#F97316']
const EMOJIS = ['🏖️','🚗','🏠','💻','📱','✈️','🎓','💍','💰','🎮','👶']

export default function MoneyTab({ transactions, onUpdate }: Props) {
  const [sub, setSub] = useState<SubTab>('transactions')

  return (
    <div className="space-y-4">
      {/* Sub tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {([
          { id: 'transactions', label: '💸 Transactions' },
          { id: 'budget',       label: '🎯 Budget' },
          { id: 'dettes',       label: '🤝 Dettes' },
          { id: 'epargne',      label: '🐖 Épargne' },
        ] as { id: SubTab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={`flex-shrink-0 px-4 py-2.5 rounded-2xl text-sm font-semibold
                        transition-colors min-h-[44px]
                        ${sub === t.id
                          ? 'bg-accent text-white'
                          : 'bg-white text-ink-soft border border-mist-dark'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'transactions' && <TransactionsSection transactions={transactions} onUpdate={onUpdate} />}
      {sub === 'budget'       && <BudgetSection transactions={transactions} />}
      {sub === 'dettes'       && <DettesSection />}
      {sub === 'epargne'      && <EpargneSection />}
    </div>
  )
}

// ─── Transactions ─────────────────────────────────────────────────────────────

function TransactionsSection({ transactions, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [form, setForm] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: '', category: EXPENSE_CATEGORIES[0], note: '',
    date: new Date().toISOString().slice(0, 10),
  })

  const filtered = transactions.filter(t => filter === 'all' || t.type === filter)
  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) return
    addTransaction({ ...form, amount: Number(form.amount) })
    setForm({ type: 'expense', amount: '', category: EXPENSE_CATEGORIES[0], note: '',
              date: new Date().toISOString().slice(0, 10) })
    setShowForm(false)
    onUpdate()
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['all','income','expense'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-colors
              ${filter === f ? 'bg-ink text-white' : 'bg-white text-ink-soft border border-mist-dark'}`}>
            {f === 'all' ? 'Tout' : f === 'income' ? 'Revenus' : 'Dépenses'}
          </button>
        ))}
      </div>

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2">
        <Plus size={18} /> Ajouter
      </button>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center py-10 text-ink-soft">
            <p className="text-3xl mb-2">💸</p>
            <p className="font-semibold">Aucune transaction</p>
          </div>
        ) : filtered.map(tx => (
          <div key={tx.id} className="card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0
                ${tx.type === 'income' ? 'bg-positive-light' : 'bg-danger-light'}`}>
                <span className="text-lg">{tx.type === 'income' ? '💰' : '💸'}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{tx.note || tx.category}</p>
                <p className="text-xs text-ink-soft">
                  {tx.category} · {new Date(tx.date).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`font-mono text-sm font-bold
                ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
                {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount)}
              </span>
              <button className="btn-icon bg-mist hover:bg-danger-light text-ink-soft hover:text-danger"
                onClick={() => { deleteTransaction(tx.id); onUpdate() }}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvelle transaction</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold
                ${form.type === 'expense' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'expense', category: EXPENSE_CATEGORIES[0]}))}>
                💸 Dépense</button>
              <button className={`flex-1 py-3 text-sm font-bold
                ${form.type === 'income' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'income', category: INCOME_CATEGORIES[0]}))}>
                💰 Revenu</button>
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input text-xl font-bold" type="number" placeholder="0"
                value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={form.category}
                onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: Courses Jumbo" value={form.note}
                onChange={e => setForm(f => ({...f, note: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm(f => ({...f, date: e.target.value}))}/>
            </div>
            <button className="btn-primary w-full py-4 text-base" onClick={handleSubmit}>
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Budget ───────────────────────────────────────────────────────────────────

function BudgetSection({ transactions }: { transactions: Transaction[] }) {
  const [budgets, setBudgets] = useState<BudgetCategory[]>(getBudgets)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', limit: '', color: COLORS[0] })

  const ym = currentYearMonth()
  const spending: Record<string, number> = {}
  transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym))
    .forEach(t => { spending[t.category] = (spending[t.category] || 0) + t.amount })

  const overBudget = budgets.filter(b => (spending[b.name] || 0) > b.limit)
  const tip = overBudget.length > 0
    ? `⚠️ Tu dépasses le budget en ${overBudget.map(b => b.name).join(', ')}.`
    : budgets.length > 0
    ? `✅ Tous tes budgets sont sous contrôle ce mois-ci.`
    : `Crée des plafonds par catégorie pour mieux contrôler tes dépenses.`

  function handleAdd() {
    if (!form.name || !form.limit) return
    const updated = [...budgets, {
      id: crypto.randomUUID(), name: form.name,
      limit: Number(form.limit), color: form.color
    }]
    setBudgets(updated); saveBudgets(updated)
    setForm({ name: '', limit: '', color: COLORS[0] }); setShowForm(false)
  }

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />
      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2">
        <Plus size={18}/> Nouvelle catégorie
      </button>

      {budgets.map(b => {
        const spent = spending[b.name] || 0
        const pct = Math.min(100, (spent / b.limit) * 100)
        const over = spent > b.limit
        return (
          <div key={b.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }}/>
                <span className="font-semibold text-sm text-ink">{b.name}</span>
                {over && <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-bold">Dépassé</span>}
              </div>
              <button className="btn-icon bg-mist hover:bg-danger-light text-ink-soft hover:text-danger"
                onClick={() => { const u = budgets.filter(x => x.id !== b.id); setBudgets(u); saveBudgets(u) }}>
                <Trash2 size={15}/>
              </button>
            </div>
            <div className="w-full h-3 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: over ? '#DC2626' : pct >= 80 ? '#D97706' : b.color }}/>
            </div>
            <div className="flex justify-between text-xs">
              <span className={`font-mono font-bold ${over ? 'text-danger' : 'text-ink'}`}>
                {formatAmount(spent)}
              </span>
              <span className="font-mono text-ink-soft">{formatAmount(b.limit)}</span>
            </div>
          </div>
        )
      })}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvelle catégorie</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input" placeholder="Ex: Restaurants" value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Plafond mensuel (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.limit}
                onChange={e => setForm(f => ({...f, limit: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Couleur</label>
              <div className="flex gap-3 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} style={{ backgroundColor: c }}
                    className={`w-10 h-10 rounded-2xl border-2 transition-transform
                      ${form.color === c ? 'border-ink scale-110' : 'border-transparent'}`}
                    onClick={() => setForm(f => ({...f, color: c}))}/>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleAdd}>Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Dettes ───────────────────────────────────────────────────────────────────

function DettesSection() {
  const [debts, setDebts] = useState<Debt[]>(getDebts)
  const [showForm, setShowForm] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [form, setForm] = useState({
    type: 'owe' as 'owe' | 'owed',
    person: '', amount: '', minimumPayment: '',
    interestRate: '', note: '', dueDate: '',
  })

  const plan = computeCoachPlan(currentYearMonth())
  const tip = plan.snowballTarget
    ? `🎯 Priorité : rembourse d'abord "${plan.snowballTarget.person}" (${formatAmount(plan.snowballTarget.remaining)} restant). Mets ${formatAmount(plan.snowballSuggestion)} de plus ce mois si possible !`
    : debts.length > 0
    ? `✅ Continue comme ça, tu avances bien !`
    : `Enregistre tes dettes pour que le Coach t'aide à les éliminer.`

  function handleAdd() {
    if (!form.person || !form.amount) return
    const updated = [...debts, {
      id: crypto.randomUUID(), type: form.type,
      person: form.person, amount: Number(form.amount),
      remaining: Number(form.amount),
      minimumPayment: Number(form.minimumPayment) || 0,
      interestRate: form.interestRate ? Number(form.interestRate) : undefined,
      note: form.note, dueDate: form.dueDate || undefined,
      createdAt: new Date().toISOString(),
    }]
    setDebts(updated); saveDebts(updated)
    setForm({ type:'owe', person:'', amount:'', minimumPayment:'', interestRate:'', note:'', dueDate:'' })
    setShowForm(false)
  }

  function handlePay(id: string) {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) return
    const updated = debts
      .map(d => d.id !== id ? d : { ...d, remaining: Math.max(0, d.remaining - amt) })
      .filter(d => d.remaining > 0)
    setDebts(updated); saveDebts(updated)
    setPayingId(null); setPayAmount('')
  }

  const totalOwe  = debts.filter(d => d.type === 'owe').reduce((s,d) => s + d.remaining, 0)
  const totalOwed = debts.filter(d => d.type === 'owed').reduce((s,d) => s + d.remaining, 0)

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />

      <div className="grid grid-cols-2 gap-3">
        <div className="card bg-danger-light">
          <p className="text-xs font-bold text-danger uppercase">Je dois</p>
          <p className="text-xl font-bold font-mono text-danger mt-1">{formatAmount(totalOwe)}</p>
        </div>
        <div className="card bg-positive-light">
          <p className="text-xs font-bold text-positive uppercase">On me doit</p>
          <p className="text-xl font-bold font-mono text-positive mt-1">{formatAmount(totalOwed)}</p>
        </div>
      </div>

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2">
        <Plus size={18}/> Ajouter
      </button>

      {debts.map(d => {
        const paidPct = Math.round(((d.amount - d.remaining) / d.amount) * 100)
        const monthsLeft = d.minimumPayment > 0 ? Math.ceil(d.remaining / d.minimumPayment) : null
        const isOverdue = d.dueDate && new Date(d.dueDate) < new Date()
        const isSnowball = plan.snowballTarget?.id === d.id

        return (
          <div key={d.id} className={`card space-y-3 border-l-4
            ${d.type === 'owe' ? 'border-l-danger' : 'border-l-positive'}
            ${isSnowball ? 'ring-2 ring-accent' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {isSnowball && <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full font-bold">🎯 Priorité</span>}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                    ${d.type === 'owe' ? 'bg-danger-light text-danger' : 'bg-positive-light text-positive'}`}>
                    {d.type === 'owe' ? 'Je dois à' : 'Me doit'}
                  </span>
                  <span className="font-bold text-sm text-ink">{d.person}</span>
                </div>
                {d.note && <p className="text-xs text-ink-soft mt-1">{d.note}</p>}
                {d.minimumPayment > 0 && (
                  <p className="text-xs text-ink-soft mt-1">
                    Min. {formatAmount(d.minimumPayment)}/mois
                    {monthsLeft && <span className="text-warning font-semibold"> · ~{monthsLeft} mois</span>}
                  </p>
                )}
                {isOverdue && <p className="text-xs text-danger font-bold mt-1">⚠️ En retard</p>}
              </div>
              <p className="font-mono font-bold text-ink">{formatAmount(d.remaining)}</p>
            </div>

            {paidPct > 0 && (
              <div className="w-full h-2 bg-mist-dark rounded-full">
                <div className="h-full bg-positive rounded-full" style={{ width: `${paidPct}%` }}/>
              </div>
            )}

            {payingId === d.id ? (
              <div className="flex gap-2">
                <input className="input flex-1" type="number" placeholder="Montant"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus/>
                <button className="btn-primary px-4" onClick={() => handlePay(d.id)}>OK</button>
                <button className="btn-ghost px-3" onClick={() => setPayingId(null)}>✕</button>
              </div>
            ) : (
              <button className="w-full py-3 text-sm font-semibold text-accent bg-accent-light
                                 rounded-2xl active:scale-95 transition-all"
                onClick={() => { setPayingId(d.id); setPayAmount('') }}>
                Enregistrer un remboursement
              </button>
            )}
          </div>
        )
      })}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvelle dette / prêt</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold
                ${form.type === 'owe' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'owe'}))}>Je dois</button>
              <button className={`flex-1 py-3 text-sm font-bold
                ${form.type === 'owed' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'owed'}))}>On me doit</button>
            </div>
            <div>
              <label className="label">{form.type === 'owe' ? 'À qui ?' : 'Qui ?'}</label>
              <input className="input" placeholder="Nom / institution" value={form.person}
                onChange={e => setForm(f => ({...f, person: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant total (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.amount}
                onChange={e => setForm(f => ({...f, amount: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Minimum mensuel (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.minimumPayment}
                onChange={e => setForm(f => ({...f, minimumPayment: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Taux intérêt % (optionnel)</label>
              <input className="input" type="number" placeholder="Ex: 12" value={form.interestRate}
                onChange={e => setForm(f => ({...f, interestRate: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Note</label>
              <input className="input" placeholder="Ex: Crédit voiture" value={form.note}
                onChange={e => setForm(f => ({...f, note: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Échéance (optionnel)</label>
              <input className="input" type="date" value={form.dueDate}
                onChange={e => setForm(f => ({...f, dueDate: e.target.value}))}/>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleAdd}>Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Épargne ──────────────────────────────────────────────────────────────────

function EpargneSection() {
  const [goals, setGoals] = useState<SavingsGoal[]>(getSavings)
  const [showForm, setShowForm] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [addAmount, setAddAmount] = useState('')
  const [form, setForm] = useState({ name: '', target: '', emoji: EMOJIS[0] })

  const plan = computeCoachPlan(currentYearMonth())
  const tip = plan.savingsSuggestion > 0
    ? `💰 Ce mois, mets ${formatAmount(plan.savingsSuggestion)} de côté — répartis sur tes objectifs !`
    : `Crée des objectifs d'épargne pour ta famille.`

  function handleAdd() {
    if (!form.name || !form.target) return
    const updated = [...goals, {
      id: crypto.randomUUID(), name: form.name,
      target: Number(form.target), saved: 0,
      emoji: form.emoji, createdAt: new Date().toISOString()
    }]
    setGoals(updated); saveSavings(updated)
    setForm({ name: '', target: '', emoji: EMOJIS[0] }); setShowForm(false)
  }

  function handleDeposit(id: string) {
    if (!addAmount || Number(addAmount) <= 0) return
    const updated = goals.map(g => g.id === id ? {...g, saved: g.saved + Number(addAmount)} : g)
    setGoals(updated); saveSavings(updated)
    setAddingTo(null); setAddAmount('')
  }

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />
      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2">
        <Plus size={18}/> Nouvel objectif
      </button>

      {goals.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-4xl mb-2">🐖</p>
          <p className="font-semibold text-ink-soft">Aucun objectif d'épargne</p>
        </div>
      ) : goals.map(g => {
        const pct = Math.min(100, (g.saved / g.target) * 100)
        const done = g.saved >= g.target
        return (
          <div key={g.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{g.emoji}</span>
                <div>
                  <p className="font-semibold text-ink">{g.name}</p>
                  {done && <p className="text-xs text-positive font-bold">✅ Objectif atteint !</p>}
                </div>
              </div>
              <button className="btn-icon bg-mist hover:bg-danger-light text-ink-soft hover:text-danger"
                onClick={() => { const u = goals.filter(x => x.id !== g.id); setGoals(u); saveSavings(u) }}>
                <Trash2 size={15}/>
              </button>
            </div>
            <div className="w-full h-3 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: done ? '#16A34A' : '#2563EB' }}/>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-mono font-bold text-accent">{formatAmount(g.saved)}</span>
              <span className="font-mono text-ink-soft">{pct.toFixed(0)}% · {formatAmount(g.target)}</span>
            </div>
            {addingTo === g.id ? (
              <div className="flex gap-2">
                <input className="input flex-1" type="number" placeholder="Montant"
                  value={addAmount} onChange={e => setAddAmount(e.target.value)} autoFocus/>
                <button className="btn-primary px-4" onClick={() => handleDeposit(g.id)}>OK</button>
                <button className="btn-ghost px-3" onClick={() => setAddingTo(null)}>✕</button>
              </div>
            ) : (
              <button className="w-full py-3 text-sm font-semibold text-accent bg-accent-light
                                 rounded-2xl active:scale-95 transition-all"
                onClick={() => { setAddingTo(g.id); setAddAmount('') }}>
                + Ajouter de l'argent
              </button>
            )}
          </div>
        )
      })}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvel objectif</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div>
              <label className="label">Emoji</label>
              <div className="flex gap-2 flex-wrap">
                {EMOJIS.map(e => (
                  <button key={e} className={`text-2xl p-2 rounded-2xl transition-colors
                    ${form.emoji === e ? 'bg-accent-light' : 'bg-mist'}`}
                    onClick={() => setForm(f => ({...f, emoji: e}))}>{e}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Nom de l'objectif</label>
              <input className="input" placeholder="Ex: Vacances" value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant cible (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.target}
                onChange={e => setForm(f => ({...f, target: e.target.value}))}/>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleAdd}>Créer l'objectif</button>
          </div>
        </div>
      )}
    </div>
  )
}
