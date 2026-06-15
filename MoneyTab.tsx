'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Info, Pencil, History, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Transaction, BudgetCategory, SavingsGoal, Debt,
  EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  addTransaction, deleteTransaction,
  getBudgets, addBudget, deleteBudget,
  getSavings, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
  getDebts, addDebt, updateDebt, deleteDebt,
  computeCoachPlan,
  formatAmount, currentYearMonth,
} from '@/lib/storage'
import CoachTip from './CoachTip'
import { supabase } from '@/lib/supabase'

type SubTab = 'transactions' | 'budget' | 'dettes' | 'epargne'

interface Props {
  transactions: Transaction[]
  onUpdate: () => void
}

interface DebtPaymentHistory {
  id: string
  debtId: string
  amount: number
  paidAt: string
}

const COLORS = ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#10B981','#F97316']
const EMOJIS = ['🏖️','🚗','🏠','💻','📱','✈️','🎓','💍','💰','🎮','👶']

const SUBTABS = [
  {
    id: 'transactions' as SubTab,
    emoji: '💸', label: 'Transactions', shortDesc: 'Mes dépenses & revenus',
    fullDesc: 'Enregistre chaque dépense ou revenu ponctuel. Courses, salaire, restaurant, essence... Tout ce qui entre ou sort de ta poche.',
    color: 'bg-blue-50 border-blue-200 text-blue-700', activeColor: 'bg-accent text-white',
  },
  {
    id: 'budget' as SubTab,
    emoji: '🎯', label: 'Budget', shortDesc: 'Mes plafonds par catégorie',
    fullDesc: 'Fixe des limites de dépenses par catégorie. Le système t\'alerte automatiquement quand tu approches ou dépasses la limite.',
    color: 'bg-purple-50 border-purple-200 text-purple-700', activeColor: 'bg-purple-600 text-white',
  },
  {
    id: 'dettes' as SubTab,
    emoji: '💳', label: 'Dettes', shortDesc: 'Ce que je dois / on me doit',
    fullDesc: 'Suis tes crédits et prêts. Le Coach calcule automatiquement l\'ordre de remboursement optimal.',
    color: 'bg-red-50 border-red-200 text-red-700', activeColor: 'bg-danger text-white',
  },
  {
    id: 'epargne' as SubTab,
    emoji: '🐖', label: 'Épargne', shortDesc: 'Mes objectifs d\'économies',
    fullDesc: 'Crée des objectifs d\'épargne avec un montant cible. Tu ajoutes de l\'argent quand tu peux.',
    color: 'bg-green-50 border-green-200 text-green-700', activeColor: 'bg-positive text-white',
  },
]

export default function MoneyTab({ transactions, onUpdate }: Props) {
  const [sub, setSub] = useState<SubTab>('transactions')
  const [showInfo, setShowInfo] = useState<SubTab | null>(null)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={`relative flex flex-col items-start p-3 rounded-2xl border-2 text-left transition-all active:scale-[0.98]
              ${sub === t.id ? t.activeColor + ' border-transparent shadow-sm' : 'bg-white border-mist-dark'}`}>
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-xl">{t.emoji}</span>
              <button onClick={e => { e.stopPropagation(); setShowInfo(showInfo === t.id ? null : t.id) }}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors
                  ${sub === t.id ? 'bg-white/20 text-white' : 'bg-mist text-ink-soft'}`}>
                <Info size={12}/>
              </button>
            </div>
            <p className={`text-sm font-bold ${sub === t.id ? 'text-white' : 'text-ink'}`}>{t.label}</p>
            <p className={`text-xs mt-0.5 leading-tight ${sub === t.id ? 'text-white/75' : 'text-ink-soft'}`}>{t.shortDesc}</p>
          </button>
        ))}
      </div>

      {showInfo && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border ${SUBTABS.find(t => t.id === showInfo)?.color}`}>
          <span className="text-xl flex-shrink-0">{SUBTABS.find(t => t.id === showInfo)?.emoji}</span>
          <div className="flex-1">
            <p className="font-bold text-sm mb-1">{SUBTABS.find(t => t.id === showInfo)?.label}</p>
            <p className="text-sm leading-relaxed">{SUBTABS.find(t => t.id === showInfo)?.fullDesc}</p>
          </div>
          <button onClick={() => setShowInfo(null)} className="flex-shrink-0 opacity-60"><X size={16}/></button>
        </div>
      )}

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
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [form, setForm] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: '', category: EXPENSE_CATEGORIES[0], note: '',
    date: new Date().toISOString().slice(0, 10),
  })

  const filtered = transactions.filter(t => filter === 'all' || t.type === filter)
  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const ym = currentYearMonth()
  const monthTxs = transactions.filter(t => t.date.startsWith(ym))
  const income   = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  async function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) return
    setLoading(true)
    await addTransaction({ ...form, amount: Number(form.amount) })
    setForm({ type: 'expense', amount: '', category: EXPENSE_CATEGORIES[0], note: '', date: new Date().toISOString().slice(0, 10) })
    setShowForm(false)
    onUpdate()
    setLoading(false)
  }

  async function handleDelete(id: string) {
    await deleteTransaction(id)
    onUpdate()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="card bg-positive-light">
          <p className="text-xs font-bold text-positive uppercase">Revenus ce mois</p>
          <p className="text-lg font-bold font-mono text-positive mt-1">{formatAmount(income)}</p>
        </div>
        <div className="card bg-danger-light">
          <p className="text-xs font-bold text-danger uppercase">Dépenses ce mois</p>
          <p className="text-lg font-bold font-mono text-danger mt-1">{formatAmount(expenses)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {([{ id: 'all', label: 'Tout' }, { id: 'income', label: '💰 Revenus' }, { id: 'expense', label: '💸 Dépenses' }] as const).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-colors
              ${filter === f.id ? 'bg-ink text-white' : 'bg-white text-ink-soft border border-mist-dark'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2">
        <Plus size={18}/> Ajouter une transaction
      </button>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-3xl mb-2">💸</p>
            <p className="font-semibold text-ink">Aucune transaction</p>
            <p className="text-sm text-ink-soft mt-1">Appuie sur "Ajouter" pour commencer</p>
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
                <p className="text-xs text-ink-soft">{tx.category} · {new Date(tx.date).toLocaleDateString('fr-FR')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`font-mono text-sm font-bold ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
                {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount)}
              </span>
              <button className="w-9 h-9 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center active:scale-95"
                onClick={() => handleDelete(tx.id)}>
                <Trash2 size={15}/>
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
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'expense' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'expense', category: EXPENSE_CATEGORIES[0]}))}>💸 Dépense</button>
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'income' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'income', category: INCOME_CATEGORIES[0]}))}>💰 Revenu</button>
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input text-xl font-bold" type="number" placeholder="0"
                value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: Courses Jumbo, Salaire avril..."
                value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))}/>
            </div>
            <button className="btn-primary w-full py-4 text-base" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Budget ───────────────────────────────────────────────────────────────────

function BudgetSection({ transactions }: { transactions: Transaction[] }) {
  const [budgets, setBudgets] = useState<BudgetCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', limit: '', color: COLORS[0] })

  useEffect(() => {
    getBudgets().then(setBudgets).finally(() => setLoading(false))
  }, [])

  const ym = currentYearMonth()
  const spending: Record<string, number> = {}
  transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym))
    .forEach(t => { spending[t.category] = (spending[t.category] || 0) + t.amount })

  const overBudget = budgets.filter(b => (spending[b.name] || 0) > b.limit)
  const tip = overBudget.length > 0
    ? `⚠️ Tu dépasses le plafond en : ${overBudget.map(b => b.name).join(', ')}. Réduis ces dépenses !`
    : budgets.length > 0 ? `✅ Tous tes budgets sont respectés ce mois-ci. Continue !`
    : `Crée un plafond par catégorie pour mieux contrôler où va ton argent.`

  async function handleAdd() {
    if (!form.name || !form.limit) return
    const newBudget = await addBudget({ name: form.name, limit: Number(form.limit), color: form.color })
    setBudgets(prev => [...prev, newBudget])
    setForm({ name: '', limit: '', color: COLORS[0] })
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    await deleteBudget(id)
    setBudgets(prev => prev.filter(b => b.id !== id))
  }

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />
      <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-2xl">
        <span className="text-lg">💡</span>
        <p className="text-xs text-purple-700 leading-relaxed">
          <strong>Comment ça marche :</strong> Tu fixes un plafond pour une catégorie. Chaque dépense enregistrée dans cette catégorie avance la barre automatiquement.
        </p>
      </div>
      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2" style={{ backgroundColor: '#7C3AED' }}>
        <Plus size={18}/> Nouveau plafond
      </button>

      {budgets.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🎯</p>
          <p className="font-semibold text-ink">Aucun budget défini</p>
          <p className="text-sm text-ink-soft mt-1">Commence par fixer un plafond pour l'alimentation ou le transport</p>
        </div>
      ) : budgets.map(b => {
        const spent = spending[b.name] || 0
        const pct   = Math.min(100, (spent / b.limit) * 100)
        const over  = spent > b.limit
        const near  = pct >= 80 && !over
        return (
          <div key={b.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }}/>
                <span className="font-semibold text-sm text-ink">{b.name}</span>
                {over && <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-bold">⚠️ Dépassé</span>}
                {near && <span className="text-xs bg-warning-light text-warning px-2 py-0.5 rounded-full font-bold">Attention</span>}
              </div>
              <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"
                onClick={() => handleDelete(b.id)}>
                <Trash2 size={14}/>
              </button>
            </div>
            <div className="w-full h-3 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: over ? '#DC2626' : near ? '#D97706' : b.color }}/>
            </div>
            <div className="flex justify-between text-xs">
              <span className={`font-mono font-bold ${over ? 'text-danger' : 'text-ink'}`}>{formatAmount(spent)} dépensés</span>
              <span className="font-mono text-ink-soft">plafond : {formatAmount(b.limit)}</span>
            </div>
          </div>
        )
      })}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouveau plafond</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div>
              <label className="label">Catégorie de dépense</label>
              <select className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}>
                <option value="">— Choisir —</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Plafond mensuel (Rs)</label>
              <input className="input" type="number" placeholder="Ex: 15000"
                value={form.limit} onChange={e => setForm(f => ({...f, limit: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Couleur</label>
              <div className="flex gap-3 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} style={{ backgroundColor: c }}
                    className={`w-10 h-10 rounded-2xl border-2 transition-transform ${form.color === c ? 'border-ink scale-110' : 'border-transparent'}`}
                    onClick={() => setForm(f => ({...f, color: c}))}/>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleAdd} style={{ backgroundColor: '#7C3AED' }}>
              Créer le plafond
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers dettes ───────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function projectedEndDate(remaining: number, minimumPayment: number): string | null {
  if (!minimumPayment || minimumPayment <= 0 || remaining <= 0) return null
  const months = Math.ceil(remaining / minimumPayment)
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

async function fetchHistory(debtId: string): Promise<DebtPaymentHistory[]> {
  const { data } = await supabase
    .from('debt_payment_history')
    .select('*')
    .eq('debt_id', debtId)
    .order('paid_at', { ascending: false })
  return (data ?? []).map(r => ({
    id: r.id,
    debtId: r.debt_id,
    amount: r.amount,
    paidAt: r.paid_at,
  }))
}

async function logPayment(debtId: string, amount: number): Promise<void> {
  await supabase.from('debt_payment_history').insert({
    debt_id: debtId,
    amount,
    paid_at: new Date().toISOString().slice(0, 10),
  })
}

// ─── Dettes ───────────────────────────────────────────────────────────────────

function DettesSection() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // Feature: history panel per debt
  const [historyDebtId, setHistoryDebtId] = useState<string | null>(null)
  const [history, setHistory] = useState<DebtPaymentHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [form, setForm] = useState({
    type: 'owe' as 'owe' | 'owed',
    person: '', amount: '', minimumPayment: '', interestRate: '', note: '', dueDate: '',
    recurring: false,
  })

  useEffect(() => {
    getDebts().then(setDebts).finally(() => setLoading(false))
  }, [])

  const plan = computeCoachPlan(debts, [], [], currentYearMonth())
  const tip  = plan.snowballTarget
    ? `🎯 Rembourse "${plan.snowballTarget.person}" en priorité (${formatAmount(plan.snowballTarget.remaining)} restant). Mets ${formatAmount(plan.snowballSuggestion)} de plus ce mois !`
    : debts.length > 0 ? `✅ Continue comme ça, tu avances bien !`
    : `Enregistre tes crédits et prêts pour que le Coach calcule le meilleur ordre de remboursement.`

  const totalOwe  = debts.filter(d => d.type === 'owe').reduce((s, d) => s + d.remaining, 0)
  const totalOwed = debts.filter(d => d.type === 'owed').reduce((s, d) => s + d.remaining, 0)

  function resetForm() {
    setForm({ type:'owe', person:'', amount:'', minimumPayment:'', interestRate:'', note:'', dueDate:'', recurring: false })
    setEditingId(null)
  }

  function openEdit(d: Debt) {
    setForm({
      type: d.type, person: d.person, amount: String(d.amount),
      minimumPayment: d.minimumPayment ? String(d.minimumPayment) : '',
      interestRate: d.interestRate !== undefined ? String(d.interestRate) : '',
      note: d.note || '', dueDate: d.dueDate || '',
      recurring: (d as any).recurring ?? false,
    })
    setEditingId(d.id)
    setShowForm(true)
  }

  async function openHistory(debtId: string) {
    if (historyDebtId === debtId) {
      setHistoryDebtId(null)
      return
    }
    setHistoryDebtId(debtId)
    setHistoryLoading(true)
    const h = await fetchHistory(debtId)
    setHistory(h)
    setHistoryLoading(false)
  }

  async function handleAdd() {
    if (!form.person) return
    if (editingId) {
      const existing = debts.find(d => d.id === editingId)!
      const newAmount    = Number(form.amount) || existing.amount
      const paidSoFar    = existing.amount - existing.remaining
      const newRemaining = Math.max(0, newAmount - paidSoFar)
      await updateDebt(editingId, {
        type: form.type, person: form.person, amount: newAmount, remaining: newRemaining,
        minimumPayment: Number(form.minimumPayment) || 0,
        interestRate: form.interestRate ? Number(form.interestRate) : undefined,
        note: form.note, dueDate: form.dueDate || undefined,
        ...(form.recurring !== undefined ? { recurring: form.recurring } : {}),
      } as any)
      setDebts(prev => prev.map(d => d.id !== editingId ? d : {
        ...d, type: form.type, person: form.person,
        amount: newAmount, remaining: newRemaining,
        minimumPayment: Number(form.minimumPayment) || 0,
        interestRate: form.interestRate ? Number(form.interestRate) : undefined,
        note: form.note, dueDate: form.dueDate || undefined,
        recurring: form.recurring,
      } as any))
    } else {
      const newDebt = await addDebt({
        type: form.type, person: form.person, amount: Number(form.amount) || 0,
        remaining: Number(form.amount) || 0, minimumPayment: Number(form.minimumPayment) || 0,
        interestRate: form.interestRate ? Number(form.interestRate) : undefined,
        note: form.note, dueDate: form.dueDate || undefined,
        ...(form.recurring !== undefined ? { recurring: form.recurring } : {}),
      } as any)
      setDebts(prev => [...prev, newDebt])
    }
    resetForm(); setShowForm(false)
  }

  async function handlePay(id: string) {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) return
    const debt = debts.find(d => d.id === id)!
    const isRecurring = (debt as any).recurring ?? false

    // Log to history
    await logPayment(id, amt)

    if (debt.amount === 0) {
      // No total defined — ask to delete
      setConfirmDeleteId(id)
      setPayingId(null); setPayAmount('')
      return
    }

    const newRemaining = Math.max(0, debt.remaining - amt)

    if (newRemaining === 0) {
      if (isRecurring) {
        // Reset remaining to amount for recurring debts
        await updateDebt(id, { remaining: debt.amount })
        setDebts(prev => prev.map(d => d.id !== id ? d : { ...d, remaining: debt.amount }))
      } else {
        // Non-recurring: ask if they want to delete
        setConfirmDeleteId(id)
      }
    } else {
      await updateDebt(id, { remaining: newRemaining })
      setDebts(prev => prev.map(d => d.id !== id ? d : { ...d, remaining: newRemaining }))
    }

    setPayingId(null); setPayAmount('')
  }

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />
      <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-2xl">
        <span className="text-lg">💡</span>
        <p className="text-xs text-red-700 leading-relaxed">
          <strong>Dette vs Dépense :</strong> Une dette c'est une somme totale à rembourser sur le temps. Le Coach utilise la méthode <strong>Snowball</strong> pour t'aider à les éliminer dans le bon ordre.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card bg-danger-light">
          <p className="text-xs font-bold text-danger uppercase">Je dois</p>
          <p className="text-xl font-bold font-mono text-danger mt-1">{formatAmount(totalOwe)}</p>
          <p className="text-xs text-danger/70 mt-1">total restant</p>
        </div>
        <div className="card bg-positive-light">
          <p className="text-xs font-bold text-positive uppercase">On me doit</p>
          <p className="text-xl font-bold font-mono text-positive mt-1">{formatAmount(totalOwed)}</p>
          <p className="text-xs text-positive/70 mt-1">à récupérer</p>
        </div>
      </div>

      <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary w-full gap-2" style={{ backgroundColor: '#DC2626' }}>
        <Plus size={18}/> Ajouter une dette / prêt
      </button>

      {debts.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🤝</p>
          <p className="font-semibold text-ink">Aucune dette enregistrée</p>
          <p className="text-sm text-ink-soft mt-1">Crédit voiture, prêt bancaire, argent dû à un ami...</p>
        </div>
      ) : debts.map(d => {
        const paidPct    = d.amount > 0 ? Math.round(((d.amount - d.remaining) / d.amount) * 100) : 0
        const monthsLeft = d.minimumPayment > 0 ? Math.ceil(d.remaining / d.minimumPayment) : null
        const isOverdue  = d.dueDate && new Date(d.dueDate) < new Date()
        const isSnowball = plan.snowballTarget?.id === d.id
        const isRecurring = (d as any).recurring ?? false
        const endDate    = projectedEndDate(d.remaining, d.minimumPayment)

        // Due date badge
        let dueBadge: React.ReactNode = null
        if (d.dueDate) {
          const days = daysUntil(d.dueDate)
          if (days < 0) {
            dueBadge = <span className="text-xs bg-danger text-white px-2 py-0.5 rounded-full font-bold">⚠️ En retard</span>
          } else if (days === 0) {
            dueBadge = <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-bold">🔴 Aujourd'hui !</span>
          } else if (days <= 7) {
            dueBadge = <span className="text-xs bg-warning-light text-warning px-2 py-0.5 rounded-full font-bold">⏰ Dans {days} jour{days > 1 ? 's' : ''}</span>
          } else if (days <= 30) {
            dueBadge = <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold">📅 Dans {days} jours</span>
          }
        }

        const showHistory = historyDebtId === d.id

        return (
          <div key={d.id} className={`card space-y-3 border-l-4
            ${d.type === 'owe' ? 'border-l-danger' : 'border-l-positive'}
            ${isSnowball ? 'ring-2 ring-accent' : ''}`}>

            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {isSnowball && <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full font-bold">🎯 Priorité snowball</span>}
                  {isRecurring && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">🔄 Récurrent</span>}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${d.type === 'owe' ? 'bg-danger-light text-danger' : 'bg-positive-light text-positive'}`}>
                    {d.type === 'owe' ? 'Je dois à' : 'Me doit'}
                  </span>
                  <span className="font-bold text-sm text-ink">{d.person}</span>
                </div>

                {d.note && <p className="text-xs text-ink-soft mt-1">{d.note}</p>}

                {d.minimumPayment > 0 && (
                  <p className="text-xs text-ink-soft mt-1">
                    Min. {formatAmount(d.minimumPayment)}/mois
                    {monthsLeft && !isRecurring && (
                      <span className="text-warning font-semibold"> · ~{monthsLeft} mois restants</span>
                    )}
                  </p>
                )}

                {/* Feature 3: Projected end date */}
                {endDate && !isRecurring && (
                  <p className="text-xs text-ink-soft mt-0.5">
                    📅 Terminé en <span className="font-semibold text-ink">{endDate}</span>
                  </p>
                )}

                {/* Feature 4: Due date badges */}
                {dueBadge && <div className="mt-1">{dueBadge}</div>}
              </div>

              <div className="text-right flex-shrink-0 flex flex-col items-end gap-1 ml-2">
                <p className="font-mono font-bold text-ink">{formatAmount(d.remaining)}</p>
                {paidPct > 0 && !isRecurring && <p className="text-xs text-positive font-semibold">{paidPct}% remboursé</p>}
                <div className="flex gap-1">
                  {/* Feature 5: History toggle */}
                  <button
                    className="w-8 h-8 rounded-xl bg-mist hover:bg-blue-50 text-ink-soft hover:text-blue-600 flex items-center justify-center"
                    onClick={() => openHistory(d.id)}
                    title="Historique des remboursements">
                    <History size={14}/>
                  </button>
                  <button className="w-8 h-8 rounded-xl bg-mist hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center" onClick={() => openEdit(d)}>
                    <Pencil size={14}/>
                  </button>
                  <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"
                    onClick={async () => { await deleteDebt(d.id); setDebts(prev => prev.filter(x => x.id !== d.id)) }}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </div>

            {paidPct > 0 && !isRecurring && (
              <div className="w-full h-2 bg-mist-dark rounded-full">
                <div className="h-full bg-positive rounded-full transition-all duration-500" style={{ width: `${paidPct}%` }}/>
              </div>
            )}

            {/* Feature 5: History panel */}
            {showHistory && (
              <div className="bg-mist rounded-2xl p-3 space-y-2">
                <p className="text-xs font-bold text-ink-soft uppercase">Historique des remboursements</p>
                {historyLoading ? (
                  <p className="text-xs text-ink-soft">Chargement...</p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-ink-soft italic">Aucun remboursement enregistré</p>
                ) : history.map(h => (
                  <div key={h.id} className="flex items-center justify-between">
                    <span className="text-xs text-ink-soft">
                      {new Date(h.paidAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-xs font-mono font-bold text-positive">−{formatAmount(h.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {payingId === d.id ? (
              <div className="flex gap-2">
                <input className="input flex-1" type="number" placeholder="Montant remboursé"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus/>
                <button className="btn-primary px-4" onClick={() => handlePay(d.id)}>OK</button>
                <button className="btn-ghost px-3" onClick={() => { setPayingId(null); setPayAmount('') }}>✕</button>
              </div>
            ) : (
              <button className="w-full py-3 text-sm font-bold text-danger bg-danger-light rounded-2xl active:scale-95 transition-all"
                onClick={() => { setPayingId(d.id); setPayAmount(String(d.minimumPayment || '')) }}>
                Enregistrer un remboursement
              </button>
            )}
          </div>
        )
      })}

      {/* Feature 2: Confirm delete after full repayment (non-recurring) */}
      {confirmDeleteId && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">🎉 Dette soldée !</h2>
              <button className="btn-icon bg-mist" onClick={() => setConfirmDeleteId(null)}><X size={20}/></button>
            </div>
            <p className="text-sm text-ink-soft">
              Tu as remboursé cette dette entièrement. Veux-tu la supprimer de ta liste ?
            </p>
            <div className="flex gap-2 mt-3">
              <button className="btn-ghost flex-1" onClick={() => setConfirmDeleteId(null)}>Garder</button>
              <button className="btn-primary flex-1" style={{ backgroundColor: '#DC2626' }}
                onClick={async () => {
                  await deleteDebt(confirmDeleteId)
                  setDebts(prev => prev.filter(d => d.id !== confirmDeleteId))
                  setConfirmDeleteId(null)
                }}>
                Oui, supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">{editingId ? 'Modifier la dette / prêt' : 'Nouvelle dette / prêt'}</h2>
              <button className="btn-icon bg-mist" onClick={() => { setShowForm(false); resetForm() }}><X size={20}/></button>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'owe' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'owe'}))}>💳 Je dois</button>
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'owed' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'owed'}))}>🤝 On me doit</button>
            </div>
            <div>
              <label className="label">{form.type === 'owe' ? 'À qui tu dois ?' : 'Qui te doit ?'}</label>
              <input className="input" placeholder="Ex: SBM Bank, MCB, Jean..."
                value={form.person} onChange={e => setForm(f => ({...f, person: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant total (Rs)</label>
              <input className="input" type="number" placeholder="Ex: 150000"
                value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Remboursement minimum / mois (Rs)</label>
              <input className="input" type="number" placeholder="Ex: 3000"
                value={form.minimumPayment} onChange={e => setForm(f => ({...f, minimumPayment: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Taux d'intérêt annuel % (optionnel)</label>
              <input className="input" type="number" placeholder="Ex: 12"
                value={form.interestRate} onChange={e => setForm(f => ({...f, interestRate: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Note</label>
              <input className="input" placeholder="Ex: Crédit voiture Honda"
                value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Échéance finale (optionnel)</label>
              <input className="input" type="date" value={form.dueDate} onChange={e => setForm(f => ({...f, dueDate: e.target.value}))}/>
            </div>

            {/* Feature 1: Recurring toggle */}
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-2xl border border-blue-200">
              <div>
                <p className="text-sm font-bold text-blue-800">🔄 Paiement récurrent</p>
                <p className="text-xs text-blue-600 mt-0.5">Le solde se remet à zéro chaque mois après paiement</p>
              </div>
              <button
                onClick={() => setForm(f => ({...f, recurring: !f.recurring}))}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${form.recurring ? 'bg-blue-600' : 'bg-mist-dark'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.recurring ? 'left-7' : 'left-1'}`}/>
              </button>
            </div>

            <button className="btn-primary w-full py-4" onClick={handleAdd} style={{ backgroundColor: '#DC2626' }}>
              {editingId ? 'Enregistrer les modifications' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Épargne ──────────────────────────────────────────────────────────────────

function EpargneSection() {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [addAmount, setAddAmount] = useState('')
  const [form, setForm] = useState({ name: '', target: '', emoji: EMOJIS[0] })

  useEffect(() => {
    getSavings().then(setGoals).finally(() => setLoading(false))
  }, [])

  const tip = goals.length > 0
    ? `💰 Continue à alimenter tes objectifs d'épargne !`
    : `Crée tes premiers objectifs d'épargne. Même 500 Rs/mois, ça compte !`

  const totalSaved = goals.reduce((s, g) => s + g.saved, 0)

  async function handleAdd() {
    if (!form.name || !form.target) return
    const newGoal = await addSavingsGoal({ name: form.name, target: Number(form.target), saved: 0, emoji: form.emoji })
    setGoals(prev => [...prev, newGoal])
    setForm({ name: '', target: '', emoji: EMOJIS[0] })
    setShowForm(false)
  }

  async function handleDeposit(id: string) {
    if (!addAmount || Number(addAmount) <= 0) return
    const goal = goals.find(g => g.id === id)!
    const newSaved = goal.saved + Number(addAmount)
    await updateSavingsGoal(id, newSaved)
    setGoals(prev => prev.map(g => g.id === id ? { ...g, saved: newSaved } : g))
    setAddingTo(null); setAddAmount('')
  }

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />
      <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-2xl">
        <span className="text-lg">💡</span>
        <p className="text-xs text-green-700 leading-relaxed">
          <strong>Épargne vs Budget :</strong> Le budget limite tes dépenses. L'épargne met de l'argent de côté pour un objectif futur. Règle d'or : épargne d'abord, dépense ensuite.
        </p>
      </div>

      {goals.length > 0 && (
        <div className="card bg-positive-light text-center">
          <p className="text-xs font-bold text-positive uppercase">Total épargné</p>
          <p className="text-2xl font-bold font-mono text-positive mt-1">{formatAmount(totalSaved)}</p>
          <p className="text-xs text-positive/70 mt-1">sur {goals.length} objectif{goals.length > 1 ? 's' : ''}</p>
        </div>
      )}

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2" style={{ backgroundColor: '#16A34A' }}>
        <Plus size={18}/> Nouvel objectif d'épargne
      </button>

      {goals.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🐖</p>
          <p className="font-semibold text-ink">Aucun objectif d'épargne</p>
          <p className="text-sm text-ink-soft mt-1">Fonds d'urgence, vacances, nouvelle télé, voiture...</p>
        </div>
      ) : goals.map(g => {
        const pct  = Math.min(100, (g.saved / g.target) * 100)
        const done = g.saved >= g.target
        return (
          <div key={g.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{g.emoji}</span>
                <div>
                  <p className="font-bold text-ink">{g.name}</p>
                  {done ? <p className="text-xs text-positive font-bold">✅ Objectif atteint !</p>
                        : <p className="text-xs text-ink-soft">{formatAmount(g.target - g.saved)} restant</p>}
                </div>
              </div>
              <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"
                onClick={async () => { await deleteSavingsGoal(g.id); setGoals(prev => prev.filter(x => x.id !== g.id)) }}>
                <Trash2 size={14}/>
              </button>
            </div>
            <div className="w-full h-3 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: done ? '#16A34A' : '#2563EB' }}/>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-mono font-bold text-accent">{formatAmount(g.saved)}</span>
              <span className="font-mono text-ink-soft">{pct.toFixed(0)}% · objectif {formatAmount(g.target)}</span>
            </div>
            {addingTo === g.id ? (
              <div className="flex gap-2">
                <input className="input flex-1" type="number" placeholder="Combien tu mets de côté ?"
                  value={addAmount} onChange={e => setAddAmount(e.target.value)} autoFocus/>
                <button className="btn-primary px-4" onClick={() => handleDeposit(g.id)}>OK</button>
                <button className="btn-ghost px-3" onClick={() => setAddingTo(null)}>✕</button>
              </div>
            ) : (
              <button className="w-full py-3 text-sm font-bold text-positive bg-positive-light rounded-2xl active:scale-95 transition-all"
                onClick={() => { setAddingTo(g.id); setAddAmount('') }}>
                + Mettre de l'argent de côté
              </button>
            )}
          </div>
        )
      })}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvel objectif d'épargne</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div>
              <label className="label">Icône</label>
              <div className="flex gap-2 flex-wrap">
                {EMOJIS.map(e => (
                  <button key={e} className={`text-2xl p-2 rounded-2xl transition-colors ${form.emoji === e ? 'bg-accent-light' : 'bg-mist'}`}
                    onClick={() => setForm(f => ({...f, emoji: e}))}>{e}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Nom de l'objectif</label>
              <input className="input" placeholder="Ex: Fonds d'urgence, Vacances..."
                value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant cible (Rs)</label>
              <input className="input" type="number" placeholder="Ex: 50000"
                value={form.target} onChange={e => setForm(f => ({...f, target: e.target.value}))}/>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleAdd} style={{ backgroundColor: '#16A34A' }}>
              Créer l'objectif
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
