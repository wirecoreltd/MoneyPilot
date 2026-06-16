'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Info, Pencil, History, ChevronDown, Check, ChevronUp, ChevronRight, Minus } from 'lucide-react'
import {
  Transaction, BudgetCategory, SavingsGoal, Debt, RecurringPayment,
  EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  addTransaction, deleteTransaction,
  getBudgets, addBudget, deleteBudget,
  getSavings, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
  getDebts, addDebt, updateDebt, deleteDebt,
  getRecurringPayments, getPaymentForMonth,
  computeCoachPlan,
  formatAmount, currentYearMonth,
} from '@/lib/storage'
import CoachTip from './CoachTip'
import { supabase } from '@/lib/supabase'

type SubTab = 'transactions' | 'budget' | 'dettes' | 'epargne'
interface Props { transactions: Transaction[]; onUpdate: () => void }

interface DebtPaymentHistory {
  id: string
  debtId: string
  amount: number
  paidAt: string
  note?: string
  category?: string
}

interface SavingsDeposit {
  id: string
  goalId: string
  amount: number
  isWithdrawal: boolean
  note?: string
  depositedAt: string
}

interface Creditor { id: string; name: string }

const COLORS = ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#10B981','#F97316']
const EMOJIS = ['🏖️','🚗','🏠','💻','📱','✈️','🎓','💍','💰','🎮','👶']

const DEFAULT_CATEGORIES = [
  'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
  'Vêtements', 'Éducation', 'Factures', 'Restaurants', 'Épargne', 'Autre'
]

const CUSTOM_CATEGORIES_KEY = 'moneyapp_custom_categories'

function loadCustomCategories(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY) || '[]') }
  catch { return [] }
}
function saveCustomCategories(cats: string[]) {
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(cats))
}
function getAllCategories(custom: string[]): string[] {
  return [...DEFAULT_CATEGORIES, ...custom]
}

const SUBTAB_KEY = 'moneyapp_subtab'
function loadSubTab(): SubTab {
  if (typeof window === 'undefined') return 'transactions'
  const v = localStorage.getItem(SUBTAB_KEY)
  if (v === 'transactions' || v === 'budget' || v === 'dettes' || v === 'epargne') return v
  return 'transactions'
}

const RECURRING_TO_BUDGET: Record<string, string> = {
  logement: 'Logement', transport: 'Transport', alimentation: 'Alimentation',
  factures: 'Factures', assurance: 'Factures', école: 'Éducation', autre: 'Autre', dette: '',
}

const SUBTABS = [
  { id: 'transactions' as SubTab, emoji: '💸', label: 'Transactions', shortDesc: 'Mes dépenses & revenus', fullDesc: 'Enregistre chaque dépense ou revenu ponctuel.', color: 'bg-blue-50 border-blue-200 text-blue-700', activeColor: 'bg-accent text-white' },
  { id: 'budget' as SubTab, emoji: '🎯', label: 'Budget', shortDesc: 'Mes plafonds par catégorie', fullDesc: 'Fixe des limites de dépenses par catégorie.', color: 'bg-purple-50 border-purple-200 text-purple-700', activeColor: 'bg-purple-600 text-white' },
  { id: 'dettes' as SubTab, emoji: '💳', label: 'Dettes', shortDesc: 'Ce que je dois / on me doit', fullDesc: 'Suis tes crédits et prêts.', color: 'bg-red-50 border-red-200 text-red-700', activeColor: 'bg-danger text-white' },
  { id: 'epargne' as SubTab, emoji: '🐖', label: 'Épargne', shortDesc: 'Mes objectifs d\'économies', fullDesc: 'Crée des objectifs d\'épargne avec un montant cible.', color: 'bg-green-50 border-green-200 text-green-700', activeColor: 'bg-positive text-white' },
]

// ─── Confettis ────────────────────────────────────────────────────────────────
function Confetti({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000)
    return () => clearTimeout(timer)
  }, [onDone])
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    color: ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#10B981','#F97316'][i % 6],
    size: 6 + Math.random() * 8,
  }))
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: `${p.left}%`, top: '-20px',
          width: p.size, height: p.size, backgroundColor: p.color,
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          animation: `confettiFall 3s ${p.delay}s linear forwards`,
        }}/>
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

export default function MoneyTab({ transactions, onUpdate }: Props) {
  const [sub, setSub] = useState<SubTab>(loadSubTab)
  const [showInfo, setShowInfo] = useState<SubTab | null>(null)
  function handleSetSub(id: SubTab) { setSub(id); localStorage.setItem(SUBTAB_KEY, id) }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => handleSetSub(t.id)}
            className={`relative flex flex-col items-start p-3 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${sub === t.id ? t.activeColor + ' border-transparent shadow-sm' : 'bg-white border-mist-dark'}`}>
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-xl">{t.emoji}</span>
              <button onClick={e => { e.stopPropagation(); setShowInfo(showInfo === t.id ? null : t.id) }}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${sub === t.id ? 'bg-white/20 text-white' : 'bg-mist text-ink-soft'}`}>
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

// ─── Category Manager ─────────────────────────────────────────────────────────
type CategoryContext = 'transactions' | 'budget' | 'dettes' | 'epargne'

function CategoryManager({
  value, onChange, customCategories, onAddCustom, context = 'transactions'
}: {
  value: string
  onChange: (v: string) => void
  customCategories: string[]
  onAddCustom: (cat: string) => void
  context?: CategoryContext
}) {
  const [newCat, setNewCat] = useState('')
  const allCats = getAllCategories(customCategories)

  function handleAdd() {
    const trimmed = newCat.trim()
    if (!trimmed || allCats.includes(trimmed)) return
    onAddCustom(trimmed)
    onChange(trimmed)
    setNewCat('')
  }

  const contextMsg: Record<CategoryContext, string> = {
    transactions: '💡 Cette catégorie s\'affiche dans <strong>Dettes</strong> et <strong>Budget</strong>',
    budget:       '💡 Cette catégorie s\'affiche dans <strong>Dettes</strong> et <strong>Transactions</strong>',
    dettes:       '💡 Cette catégorie s\'affiche dans <strong>Budget</strong> et <strong>Transactions</strong>',
    epargne:      '💡 Cette catégorie s\'affiche dans <strong>Budget</strong> et <strong>Transactions</strong>',
  }

  return (
    <div className="space-y-2">
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        {allCats.map(c => <option key={c}>{c}</option>)}
      </select>
      <div className="flex gap-2">
        <input
          className="input flex-1 py-2 text-sm"
          placeholder="Nouvelle catégorie..."
          value={newCat}
          onChange={e => setNewCat(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd} disabled={!newCat.trim()}
          className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-40 flex-shrink-0">
          <Plus size={16}/>
        </button>
      </div>
      {customCategories.length > 0 && (
        <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2"
          dangerouslySetInnerHTML={{ __html: contextMsg[context] }}/>
      )}
    </div>
  )
}

// ─── Transactions ─────────────────────────────────────────────────────────────
function TransactionsSection({ transactions, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [search, setSearch] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth())
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [customCategories, setCustomCategories] = useState<string[]>(loadCustomCategories)
  const [form, setForm] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: '', category: EXPENSE_CATEGORIES[0] as any, note: '',
    date: new Date().toISOString().slice(0, 10),
  })

  const allCats = getAllCategories(customCategories)
  const categories = form.type === 'income' ? [...INCOME_CATEGORIES, ...customCategories] : allCats

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    return { ym, label }
  })

  const filtered = transactions
    .filter(t => t.date.startsWith(selectedMonth))
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return t.note?.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    })

  const monthTxs = transactions.filter(t => t.date.startsWith(selectedMonth))
  const income   = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const filteredTotal    = filtered.reduce((s, t) => t.type === 'income' ? s + t.amount : s - t.amount, 0)
  const filteredIncome   = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const filteredExpenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  function handleAddCustom(cat: string) {
    const updated = [...customCategories, cat]
    setCustomCategories(updated)
    saveCustomCategories(updated)
  }

  function openAdd() {
    setEditingTx(null)
    setForm({ type: 'expense', amount: '', category: EXPENSE_CATEGORIES[0] as any, note: '', date: new Date().toISOString().slice(0, 10) })
    setShowForm(true)
  }
  function openEdit(tx: Transaction) {
    setEditingTx(tx)
    setForm({ type: tx.type, amount: String(tx.amount), category: tx.category as any, note: tx.note, date: tx.date })
    setShowForm(true)
  }
  async function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) return
    setLoading(true)
    if (editingTx) {
      await supabase.from('transactions').update({ type: form.type, amount: Number(form.amount), category: form.category, note: form.note, date: form.date }).eq('id', editingTx.id)
    } else {
      await addTransaction({ ...form, amount: Number(form.amount) })
    }
    setShowForm(false); setEditingTx(null); onUpdate(); setLoading(false)
  }
  async function handleDelete(id: string) { await deleteTransaction(id); onUpdate() }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-2xl">
        <span className="text-base">💡</span>
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Transactions</strong> = mouvements ponctuels. Pour les paiements récurrents, utilise <strong>Bilan → Charges récurrentes</strong>.
        </p>
      </div>

      <select className="input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
        {monthOptions.map(m => <option key={m.ym} value={m.ym}>{m.label}</option>)}
      </select>

      <div className="grid grid-cols-2 gap-3">
        <div className="card bg-positive-light">
          <p className="text-xs font-bold text-positive uppercase tracking-wide">Revenus</p>
          <p className="text-lg font-bold font-mono text-positive mt-1">{formatAmount(income)}</p>
        </div>
        <div className="card bg-danger-light">
          <p className="text-xs font-bold text-danger uppercase tracking-wide">Dépenses</p>
          <p className="text-lg font-bold font-mono text-danger mt-1">{formatAmount(expenses)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {([{ id: 'all', label: 'Tout' }, { id: 'income', label: '💰 Revenus' }, { id: 'expense', label: '💸 Dépenses' }] as const).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${filter === f.id ? 'bg-ink text-white' : 'bg-white text-ink-soft border border-mist-dark'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <input className="input pl-9" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}/>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft text-sm">🔍</span>
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft text-xs font-bold">✕</button>}
      </div>

      <button onClick={openAdd} className="btn-primary w-full gap-2"><Plus size={18}/> Ajouter une transaction</button>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-3xl mb-2">💸</p>
            <p className="font-semibold text-ink">{search ? 'Aucun résultat' : 'Aucune transaction ce mois'}</p>
            <p className="text-sm text-ink-soft mt-1">{search ? `Rien pour "${search}"` : 'Appuie sur "Ajouter" pour commencer'}</p>
          </div>
        ) : filtered.map(tx => (
          <div key={tx.id} className="card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${tx.type === 'income' ? 'bg-positive-light' : 'bg-danger-light'}`}>
                <span className="text-lg">{tx.type === 'income' ? '💰' : '💸'}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{tx.note || tx.category}</p>
                <p className="text-xs text-ink-soft">{tx.category} · {new Date(tx.date).toLocaleDateString('fr-FR')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={`font-mono text-sm font-bold ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
                {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount)}
              </span>
              <button className="w-8 h-8 rounded-xl bg-mist hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center active:scale-95" onClick={() => openEdit(tx)}><Pencil size={13}/></button>
              <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center active:scale-95" onClick={() => handleDelete(tx.id)}><Trash2 size={13}/></button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length > 0 && (
        <div className="card bg-mist flex items-center justify-between py-3 px-4">
          <span className="text-xs text-ink-soft font-semibold">{filtered.length} transaction{filtered.length > 1 ? 's' : ''}</span>
          {filter === 'all' && <span className={`font-mono text-sm font-bold ${filteredTotal >= 0 ? 'text-positive' : 'text-danger'}`}>{filteredTotal >= 0 ? '+' : ''}{formatAmount(Math.abs(filteredTotal))}</span>}
          {filter === 'income' && <span className="font-mono text-sm font-bold text-positive">+{formatAmount(filteredIncome)}</span>}
          {filter === 'expense' && <span className="font-mono text-sm font-bold text-danger">−{formatAmount(filteredExpenses)}</span>}
        </div>
      )}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">{editingTx ? 'Modifier la transaction' : 'Nouvelle transaction'}</h2>
              <button className="btn-icon bg-mist" onClick={() => { setShowForm(false); setEditingTx(null) }}><X size={20}/></button>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'expense' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`} onClick={() => setForm(f => ({...f, type:'expense', category: EXPENSE_CATEGORIES[0] as any}))}>💸 Dépense</button>
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'income' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`} onClick={() => setForm(f => ({...f, type:'income', category: INCOME_CATEGORIES[0] as any}))}>💰 Revenu</button>
            </div>
            <div><label className="label">Montant (Rs)</label><input className="input text-xl font-bold" type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}/></div>
            <div>
              <label className="label">Catégorie</label>
              <CategoryManager value={form.category} onChange={v => setForm(f => ({...f, category: v as any}))} customCategories={customCategories} onAddCustom={handleAddCustom} context="transactions"/>
            </div>
            <div><label className="label">Note (optionnel)</label><input className="input" placeholder="Ex: Courses Jumbo..." value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))}/></div>
            <div><label className="label">Date</label><input className="input" type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))}/></div>
            <button className="btn-primary w-full py-4 text-base" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Enregistrement...' : editingTx ? 'Enregistrer les modifications' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Budget ───────────────────────────────────────────────────────────────────
async function updateBudget(id: string, fields: { name?: string; limit?: number; color?: string }): Promise<void> {
  await supabase.from('budget_categories').update(fields).eq('id', id)
}

function BudgetSection({ transactions }: { transactions: Transaction[] }) {
  const [budgets, setBudgets] = useState<BudgetCategory[]>([])
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([])
  const [debtPayments, setDebtPayments] = useState<{ category: string; amount: number }[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingBudget, setEditingBudget] = useState<BudgetCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [customCategories, setCustomCategories] = useState<string[]>(loadCustomCategories)
  const [expandedBudgets, setExpandedBudgets] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({ name: '', limit: '', color: COLORS[0] })
  const ym = currentYearMonth()

  useEffect(() => {
    async function load() {
      const [b, r] = await Promise.all([getBudgets(), getRecurringPayments()])
      setBudgets(b); setRecurringPayments(r)
      const { data: { user } } = await supabase.auth.getUser()
      const { data: userDebts } = await supabase.from('debts').select('id').eq('user_id', user!.id)
      const debtIds = (userDebts ?? []).map(d => d.id)
      const [year, month] = ym.split('-').map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      const lastDate = `${ym}-${String(lastDay).padStart(2, '0')}`
      const { data: dh } = await supabase.from('debt_payment_history').select('amount, category, debt_id, paid_at, note')
        .in('debt_id', debtIds.length > 0 ? debtIds : ['00000000-0000-0000-0000-000000000000'])
        .gte('paid_at', `${ym}-01`).lte('paid_at', lastDate)
      setDebtPayments((dh ?? []).map(r => ({ category: r.category ?? 'Autre', amount: Number(r.amount), debtId: r.debt_id, paidAt: r.paid_at, note: r.note })))
    }
    load().finally(() => setLoading(false))
  }, [ym])

  const spending: Record<string, number> = {}
  transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym)).forEach(t => { spending[t.category] = (spending[t.category] || 0) + t.amount })
  recurringPayments.forEach(r => {
    const pay = getPaymentForMonth(r, ym)
    if (!pay.paid) return
    const cat = RECURRING_TO_BUDGET[r.category]
    if (!cat) return
    spending[cat] = (spending[cat] || 0) + pay.amount
  })
  debtPayments.forEach(dp => {
    if (!dp.category) return
    spending[dp.category] = (spending[dp.category] || 0) + dp.amount
  })

  const overBudget = budgets.filter(b => (spending[b.name] || 0) > b.limit)
  const tip = overBudget.length > 0
    ? `⚠️ Tu dépasses le plafond en : ${overBudget.map(b => b.name).join(', ')}. Réduis ces dépenses !`
    : budgets.length > 0 ? `✅ Tous tes budgets sont respectés ce mois-ci. Continue !`
    : `Crée un plafond par catégorie pour mieux contrôler où va ton argent.`

  const usedCategories = budgets.filter(b => !editingBudget || b.id !== editingBudget.id).map(b => b.name)
  const allCats = getAllCategories(customCategories).filter(c => !usedCategories.includes(c))

  function handleAddCustom(cat: string) {
    const updated = [...customCategories, cat]
    setCustomCategories(updated); saveCustomCategories(updated)
  }
  function toggleExpanded(id: string) {
    setExpandedBudgets(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function openAdd() { setEditingBudget(null); setForm({ name: '', limit: '', color: COLORS[0] }); setShowForm(true) }
  function openEdit(b: BudgetCategory) { setEditingBudget(b); setForm({ name: b.name, limit: String(b.limit), color: b.color }); setShowForm(true) }

  async function handleSave() {
    if (!form.name || !form.limit) return
    const isDuplicate = budgets.some(b => b.name === form.name && (!editingBudget || b.id !== editingBudget.id))
    if (isDuplicate) return
    if (editingBudget) {
      await updateBudget(editingBudget.id, { name: form.name, limit: Number(form.limit), color: form.color })
      setBudgets(prev => prev.map(b => b.id === editingBudget.id ? { ...b, name: form.name, limit: Number(form.limit), color: form.color } : b))
    } else {
      const newBudget = await addBudget({ name: form.name, limit: Number(form.limit), color: form.color })
      setBudgets(prev => [...prev, newBudget])
    }
    setForm({ name: '', limit: '', color: COLORS[0] }); setShowForm(false); setEditingBudget(null)
  }

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />
      <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-2xl">
        <span className="text-lg">💡</span>
        <p className="text-xs text-purple-700 leading-relaxed">
          <strong>Comment ça marche :</strong> Les dépenses ponctuelles, les charges récurrentes payées <strong>et les remboursements de dettes</strong> s'ajoutent automatiquement.
        </p>
      </div>
      <button onClick={openAdd} className="btn-primary w-full gap-2" style={{ backgroundColor: '#7C3AED' }}><Plus size={18}/> Nouveau plafond</button>

      {budgets.length === 0 ? (
        <div className="card text-center py-10"><p className="text-3xl mb-2">🎯</p><p className="font-semibold text-ink">Aucun budget défini</p></div>
      ) : budgets.map(b => {
        const spent = spending[b.name] || 0
        const pct   = Math.min(100, (spent / b.limit) * 100)
        const over  = spent > b.limit
        const near  = pct >= 80 && !over
        const isExpanded = expandedBudgets.has(b.id)
        const recurringContrib = recurringPayments.filter(r => { const pay = getPaymentForMonth(r, ym); return pay.paid && RECURRING_TO_BUDGET[r.category] === b.name })
        const debtContrib = (debtPayments as any[]).filter(dp => dp.category === b.name)
        const txContrib = transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym) && t.category === b.name)
        const hasDetails = recurringContrib.length > 0 || debtContrib.length > 0 || txContrib.length > 0

        return (
          <div key={b.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }}/>
                <span className="font-semibold text-sm text-ink">{b.name}</span>
                {over && <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-bold">⚠️ Dépassé</span>}
                {near && <span className="text-xs bg-warning-light text-warning px-2 py-0.5 rounded-full font-bold">Attention</span>}
              </div>
              <div className="flex gap-1">
                <button className="w-8 h-8 rounded-xl bg-mist hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center" onClick={() => openEdit(b)}><Pencil size={14}/></button>
                <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center" onClick={() => { deleteBudget(b.id); setBudgets(prev => prev.filter(x => x.id !== b.id)) }}><Trash2 size={14}/></button>
              </div>
            </div>
            <div className="w-full h-2.5 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: over ? '#DC2626' : near ? '#D97706' : b.color }}/>
            </div>
            <div className="flex justify-between text-xs">
              <span className={`font-mono font-bold ${over ? 'text-danger' : 'text-ink'}`}>{formatAmount(spent)} dépensés</span>
              <span className="font-mono text-ink-soft">plafond : {formatAmount(b.limit)}</span>
            </div>
            {hasDetails && (
              <button onClick={() => toggleExpanded(b.id)} className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink transition-colors">
                {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                {isExpanded ? 'Voir moins' : 'Voir plus'}
              </button>
            )}
            {isExpanded && hasDetails && (
              <div className="pt-1 border-t border-mist-dark space-y-1">
                {txContrib.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs text-ink-soft">
                    <span>💸 {t.note || t.category} <span className="text-mist-dark">· {new Date(t.date).toLocaleDateString('fr-FR')}</span></span>
                    <span className="font-mono">{formatAmount(t.amount)}</span>
                  </div>
                ))}
                {recurringContrib.map(r => {
                  const pay = getPaymentForMonth(r, ym)
                  return <div key={r.id} className="flex items-center justify-between text-xs text-ink-soft"><span>🔄 {r.name}</span><span className="font-mono">{formatAmount(pay.amount)}</span></div>
                })}
                {debtContrib.map((dp: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs text-ink-soft">
                    <span>💳 Remboursement{dp.note && <span className="italic"> · {dp.note}</span>}{dp.paidAt && <span className="text-mist-dark"> · {new Date(dp.paidAt).toLocaleDateString('fr-FR')}</span>}</span>
                    <span className="font-mono">{formatAmount(dp.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">{editingBudget ? 'Modifier le plafond' : 'Nouveau plafond'}</h2>
              <button className="btn-icon bg-mist" onClick={() => { setShowForm(false); setEditingBudget(null) }}><X size={20}/></button>
            </div>
            <div>
              <label className="label">Catégorie de dépense</label>
              {editingBudget ? (
                <select className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}>
                  {getAllCategories(customCategories).map(c => <option key={c}>{c}</option>)}
                </select>
              ) : (
                <>
                  <CategoryManager value={form.name} onChange={v => setForm(f => ({...f, name: v}))} customCategories={customCategories} onAddCustom={handleAddCustom} context="budget"/>
                  {form.name && budgets.some(b => b.name === form.name) && (
                    <p className="text-xs text-danger mt-1 font-semibold">⚠️ Un plafond existe déjà pour cette catégorie</p>
                  )}
                </>
              )}
            </div>
            <div><label className="label">Plafond mensuel (Rs)</label><input className="input" type="number" placeholder="Ex: 15000" value={form.limit} onChange={e => setForm(f => ({...f, limit: e.target.value}))}/></div>
            <div>
              <label className="label">Couleur</label>
              <div className="flex gap-3 flex-wrap">
                {COLORS.map(c => <button key={c} style={{ backgroundColor: c }} className={`w-10 h-10 rounded-2xl border-2 transition-transform ${form.color === c ? 'border-ink scale-110' : 'border-transparent'}`} onClick={() => setForm(f => ({...f, color: c}))}/>)}
              </div>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleSave} style={{ backgroundColor: '#7C3AED' }} disabled={!editingBudget && budgets.some(b => b.name === form.name)}>
              {editingBudget ? 'Enregistrer les modifications' : 'Créer le plafond'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers dettes ───────────────────────────────────────────────────────────
function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0,0,0,0)
  const target = new Date(dateStr); target.setHours(0,0,0,0)
  return Math.round((target.getTime() - now.getTime()) / 86400000)
}
function projectedEndDate(remaining: number, minimumPayment: number): string | null {
  if (!minimumPayment || minimumPayment <= 0 || remaining <= 0) return null
  const months = Math.ceil(remaining / minimumPayment)
  const d = new Date(); d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}
async function fetchHistory(debtId: string): Promise<DebtPaymentHistory[]> {
  const { data } = await supabase.from('debt_payment_history').select('*').eq('debt_id', debtId).order('paid_at', { ascending: false })
  return (data ?? []).map(r => ({ id: r.id, debtId: r.debt_id, amount: Number(r.amount), paidAt: r.paid_at, note: r.note ?? undefined, category: r.category ?? undefined }))
}
async function logPayment(debtId: string, amount: number, date: string, category: string, note?: string): Promise<void> {
  await supabase.from('debt_payment_history').insert({ debt_id: debtId, amount, paid_at: date, category, note: note || null })
}
async function updatePayment(id: string, amount: number, date: string, note?: string): Promise<void> {
  await supabase.from('debt_payment_history').update({ amount, paid_at: date, note: note || null }).eq('id', id)
}
async function deletePayment(id: string): Promise<void> {
  await supabase.from('debt_payment_history').delete().eq('id', id)
}
async function fetchCreditors(): Promise<Creditor[]> {
  const { data } = await supabase.from('debt_creditors').select('*').order('name')
  return (data ?? []).map(r => ({ id: r.id, name: r.name }))
}
async function saveCreditor(name: string): Promise<Creditor> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('debt_creditors').insert({ name, user_id: user!.id }).select().single()
  if (error) throw error
  return { id: data.id, name: data.name }
}
async function deleteCreditor(id: string): Promise<void> {
  await supabase.from('debt_creditors').delete().eq('id', id)
}

// ─── Creditor Picker ──────────────────────────────────────────────────────────
function CreditorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [creditors, setCreditors] = useState<Creditor[]>([])
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchCreditors().then(setCreditors) }, [])
  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    const c = await saveCreditor(newName.trim())
    setCreditors(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
    onChange(c.name); setNewName(''); setOpen(false); setAdding(false)
  }
  async function handleDelete(c: Creditor, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteCreditor(c.id)
    setCreditors(prev => prev.filter(x => x.id !== c.id))
    if (value === c.name) onChange('')
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className="input flex items-center justify-between text-left">
        <span className={value ? 'text-ink' : 'text-gray-400'}>{value || 'Choisir ou saisir...'}</span>
        <ChevronDown size={16} className={`text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-mist-dark rounded-2xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-mist-dark">
            <div className="flex gap-2">
              <input className="input flex-1 py-2 text-sm" placeholder="Nouveau créancier..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}/>
              <button onClick={handleAdd} disabled={adding || !newName.trim()} className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-40"><Plus size={16}/></button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {creditors.length === 0 ? (
              <p className="text-xs text-ink-soft text-center py-4">Aucun créancier enregistré</p>
            ) : creditors.map(c => (
              <div key={c.id} onClick={() => { onChange(c.name); setOpen(false) }}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-mist transition-colors ${value === c.name ? 'bg-accent-light' : ''}`}>
                <div className="flex items-center gap-2">
                  {value === c.name && <Check size={14} className="text-accent"/>}
                  <span className="text-sm text-ink">{c.name}</span>
                </div>
                <button onClick={e => handleDelete(c, e)} className="w-6 h-6 rounded-lg hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"><X size={12}/></button>
              </div>
            ))}
          </div>
          {newName.trim() && (
            <div onClick={() => { onChange(newName.trim()); setOpen(false); setNewName('') }} className="px-4 py-3 border-t border-mist-dark cursor-pointer hover:bg-mist transition-colors">
              <span className="text-sm text-ink-soft">Utiliser "<strong className="text-ink">{newName}</strong>" sans sauvegarder</span>
            </div>
          )}
        </div>
      )}
      {!open && <input className="sr-only" value={value} onChange={e => onChange(e.target.value)} tabIndex={-1}/>}
    </div>
  )
}

// ─── Dettes ───────────────────────────────────────────────────────────────────
function DettesSection() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNote, setPayNote] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null)
  const [historyMap, setHistoryMap] = useState<Record<string, DebtPaymentHistory[]>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editingPayment, setEditingPayment] = useState<DebtPaymentHistory | null>(null)
  const [editPayAmount, setEditPayAmount] = useState('')
  const [editPayDate, setEditPayDate] = useState('')
  const [editPayNote, setEditPayNote] = useState('')
  const [customCategories, setCustomCategories] = useState<string[]>(loadCustomCategories)
  // Grouped creditors: track which creditor groups are expanded
  const [expandedCreditors, setExpandedCreditors] = useState<Set<string>>(new Set())
  // Monthly payments tracking
  const [monthlyPaid, setMonthlyPaid] = useState<Record<string, number>>({})

  const ym = currentYearMonth()

  const [form, setForm] = useState({
    type: 'owe' as 'owe' | 'owed',
    person: '', amount: '', minimumPayment: '', interestRate: '',
    note: '', dueDate: '', recurring: false, category: 'Autre',
  })

  useEffect(() => {
    async function load() {
      const fetchedDebts = await getDebts()
      setDebts(fetchedDebts)

      // Load monthly payment totals
      const { data: { user } } = await supabase.auth.getUser()
      const { data: userDebts } = await supabase.from('debts').select('id').eq('user_id', user!.id)
      const debtIds = (userDebts ?? []).map(d => d.id)
      if (debtIds.length > 0) {
        const [year, month] = ym.split('-').map(Number)
        const lastDay = new Date(year, month, 0).getDate()
        const { data: dh } = await supabase.from('debt_payment_history').select('debt_id, amount')
          .in('debt_id', debtIds).gte('paid_at', `${ym}-01`).lte('paid_at', `${ym}-${String(lastDay).padStart(2,'0')}`)
        const paid: Record<string, number> = {}
        ;(dh ?? []).forEach(r => { paid[r.debt_id] = (paid[r.debt_id] || 0) + Number(r.amount) })
        setMonthlyPaid(paid)
      }
    }
    load().finally(() => setLoading(false))
  }, [ym])

  function handleAddCustom(cat: string) {
    const updated = [...customCategories, cat]
    setCustomCategories(updated); saveCustomCategories(updated)
  }

  const plan      = computeCoachPlan(debts, [], [], currentYearMonth())
  const totalOwe  = debts.filter(d => d.type === 'owe').reduce((s, d) => s + d.remaining, 0)
  const totalOwed = debts.filter(d => d.type === 'owed').reduce((s, d) => s + d.remaining, 0)

  // Monthly summary card
  const oweDebts = debts.filter(d => d.type === 'owe')
  const totalMonthlyMin = oweDebts.reduce((s, d) => s + (d.minimumPayment || 0), 0)
  const totalMonthlyPaid = Object.values(monthlyPaid).reduce((s, v) => s + v, 0)
  const debtsPaidThisMonth = oweDebts.filter(d => (monthlyPaid[d.id] || 0) >= (d.minimumPayment || 0)).length
  const debtsStillDue = oweDebts.filter(d => (monthlyPaid[d.id] || 0) < (d.minimumPayment || 0)).length

  const tip = plan.snowballTarget
    ? `🎯 Rembourse "${plan.snowballTarget.person}" en priorité (${formatAmount(plan.snowballTarget.remaining)} restant). Mets ${formatAmount(plan.snowballSuggestion)} de plus ce mois !`
    : debts.length > 0 ? `✅ Continue comme ça, tu avances bien !`
    : `Enregistre tes crédits et prêts pour que le Coach calcule le meilleur ordre de remboursement.`

  // Group debts by creditor name
  const groupedDebts = debts.reduce((acc, d) => {
    if (!acc[d.person]) acc[d.person] = []
    acc[d.person].push(d)
    return acc
  }, {} as Record<string, Debt[]>)

  function resetForm() {
    setForm({ type:'owe', person:'', amount:'', minimumPayment:'', interestRate:'', note:'', dueDate:'', recurring: false, category: 'Autre' })
    setEditingId(null)
  }
  function openEdit(d: Debt) {
    setForm({
      type: d.type, person: d.person, amount: String(d.amount),
      minimumPayment: d.minimumPayment ? String(d.minimumPayment) : '',
      interestRate: d.interestRate !== undefined ? String(d.interestRate) : '',
      note: d.note || '', dueDate: d.dueDate || '',
      recurring: (d as any).recurring ?? false,
      category: (d as any).category ?? 'Autre',
    })
    setEditingId(d.id); setShowForm(true)
  }

  async function toggleHistory(debtId: string) {
    if (openHistoryId === debtId) { setOpenHistoryId(null); return }
    setOpenHistoryId(debtId)
    if (!historyMap[debtId]) {
      setHistoryLoading(true)
      const h = await fetchHistory(debtId)
      setHistoryMap(prev => ({ ...prev, [debtId]: h }))
      setHistoryLoading(false)
    }
  }
  function invalidateHistory(debtId: string) { setHistoryMap(prev => { const n = { ...prev }; delete n[debtId]; return n }) }
  async function reloadHistory(debtId: string) {
    const h = await fetchHistory(debtId)
    setHistoryMap(prev => ({ ...prev, [debtId]: h }))
  }

  async function handleAdd() {
    if (!form.person) return
    const debtData = {
      type: form.type, person: form.person, amount: Number(form.amount) || 0,
      minimumPayment: Number(form.minimumPayment) || 0,
      interestRate: form.interestRate ? Number(form.interestRate) : undefined,
      note: form.note, dueDate: form.dueDate || undefined,
      recurring: form.recurring, category: form.category,
    } as any

    if (editingId) {
      const existing = debts.find(d => d.id === editingId)!
      const newAmount    = Number(form.amount) || existing.amount
      const paidSoFar    = existing.amount - existing.remaining
      const newRemaining = Math.max(0, newAmount - paidSoFar)
      await updateDebt(editingId, { ...debtData, remaining: newRemaining })
      setDebts(prev => prev.map(d => d.id !== editingId ? d : { ...d, ...debtData, amount: newAmount, remaining: newRemaining }))
    } else {
      const newDebt = await addDebt({ ...debtData, remaining: Number(form.amount) || 0 })
      setDebts(prev => [...prev, newDebt])
    }
    resetForm(); setShowForm(false)
  }

  async function handlePay(id: string) {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) return
    const debt = debts.find(d => d.id === id)!
    const isRecurring = (debt as any).recurring ?? false
    const debtCategory = (debt as any).category ?? 'Autre'

    await logPayment(id, amt, payDate, debtCategory, payNote)
    invalidateHistory(id)

    // Update monthly paid tracking
    setMonthlyPaid(prev => ({ ...prev, [id]: (prev[id] || 0) + amt }))

    if (debt.amount === 0) {
      setConfirmDeleteId(id); setPayingId(null); setPayAmount(''); setPayDate(new Date().toISOString().slice(0, 10)); setPayNote(''); return
    }
    const newRemaining = Math.max(0, debt.remaining - amt)
    if (newRemaining === 0) {
      if (isRecurring) {
        await updateDebt(id, { remaining: debt.amount })
        setDebts(prev => prev.map(d => d.id !== id ? d : { ...d, remaining: debt.amount }))
      } else {
        await updateDebt(id, { remaining: 0 })
        setDebts(prev => prev.map(d => d.id !== id ? d : { ...d, remaining: 0 }))
        setConfirmDeleteId(id)
      }
    } else {
      await updateDebt(id, { remaining: newRemaining })
      setDebts(prev => prev.map(d => d.id !== id ? d : { ...d, remaining: newRemaining }))
    }
    setPayingId(null); setPayAmount(''); setPayDate(new Date().toISOString().slice(0, 10)); setPayNote('')
  }

  async function handleEditPayment() {
    if (!editingPayment) return
    const newAmt = Number(editPayAmount)
    if (!newAmt || newAmt <= 0) return
    const oldAmt = editingPayment.amount
    const diff = newAmt - oldAmt
    await updatePayment(editingPayment.id, newAmt, editPayDate, editPayNote)
    const debt = debts.find(d => d.id === editingPayment.debtId)
    if (debt && debt.amount > 0) {
      const newRemaining = Math.max(0, debt.remaining - diff)
      await updateDebt(debt.id, { remaining: newRemaining })
      setDebts(prev => prev.map(d => d.id === debt.id ? { ...d, remaining: newRemaining } : d))
    }
    await reloadHistory(editingPayment.debtId)
    setEditingPayment(null)
  }

  async function handleDeletePayment(h: DebtPaymentHistory) {
    const debt = debts.find(d => d.id === h.debtId)
    if (debt && debt.amount > 0) {
      const newRemaining = Math.min(debt.amount, debt.remaining + h.amount)
      await updateDebt(debt.id, { remaining: newRemaining })
      setDebts(prev => prev.map(d => d.id === debt.id ? { ...d, remaining: newRemaining } : d))
    }
    // Update monthly paid tracking
    setMonthlyPaid(prev => ({ ...prev, [h.debtId]: Math.max(0, (prev[h.debtId] || 0) - h.amount) }))
    await deletePayment(h.id)
    await reloadHistory(h.debtId)
  }

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card border border-danger/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-danger-light flex items-center justify-center"><span className="text-sm">💳</span></div>
            <p className="text-xs font-bold text-danger uppercase tracking-wide">Je dois</p>
          </div>
          <p className="text-xl font-bold font-mono text-danger">{formatAmount(totalOwe)}</p>
          <p className="text-xs text-ink-soft mt-1">total restant</p>
        </div>
        <div className="card border border-positive/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-positive-light flex items-center justify-center"><span className="text-sm">🤝</span></div>
            <p className="text-xs font-bold text-positive uppercase tracking-wide">On me doit</p>
          </div>
          <p className="text-xl font-bold font-mono text-positive">{formatAmount(totalOwed)}</p>
          <p className="text-xs text-ink-soft mt-1">à récupérer</p>
        </div>
      </div>

      {/* Monthly payment card */}
      {oweDebts.length > 0 && (
        <div className="card border-2 border-orange-200 bg-orange-50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📅</span>
              <p className="text-sm font-bold text-orange-700">Ce mois-ci</p>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${debtsStillDue === 0 ? 'bg-positive-light text-positive' : 'bg-danger-light text-danger'}`}>
              {debtsStillDue === 0 ? '✅ Tout payé !' : `${debtsStillDue} restant${debtsStillDue > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-bold font-mono text-orange-800">{formatAmount(totalMonthlyPaid)}</p>
              <p className="text-xs text-orange-600">remboursés sur {formatAmount(totalMonthlyMin)} prévus</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-orange-700">{debtsPaidThisMonth}/{oweDebts.length}</p>
              <p className="text-xs text-orange-500">dettes payées</p>
            </div>
          </div>
          {totalMonthlyMin > 0 && (
            <div className="w-full h-2 bg-orange-200 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (totalMonthlyPaid / totalMonthlyMin) * 100)}%` }}/>
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-2xl">
        <span className="text-base">💡</span>
        <p className="text-xs text-red-700 leading-relaxed"><strong>Snowball :</strong> Rembourse la plus petite dette en premier pour créer de l'élan.</p>
      </div>

      <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary w-full gap-2" style={{ backgroundColor: '#DC2626' }}><Plus size={18}/> Ajouter une dette / prêt</button>

      {debts.length === 0 ? (
        <div className="card text-center py-10"><p className="text-3xl mb-2">🤝</p><p className="font-semibold text-ink">Aucune dette enregistrée</p><p className="text-sm text-ink-soft mt-1">Crédit voiture, prêt bancaire, argent dû à un ami...</p></div>
      ) : Object.entries(groupedDebts).map(([personName, personDebts]) => {
        const isGrouped = personDebts.length > 1
        const isExpanded = expandedCreditors.has(personName)
        const groupTotal = personDebts.reduce((s, d) => s + d.remaining, 0)
        const groupPaid  = personDebts.reduce((s, d) => s + (monthlyPaid[d.id] || 0), 0)

        return (
          <div key={personName}>
            {/* Group header for multiple debts to same person */}
            {isGrouped && (
              <button
                onClick={() => setExpandedCreditors(prev => {
                  const next = new Set(prev)
                  next.has(personName) ? next.delete(personName) : next.add(personName)
                  return next
                })}
                className="w-full flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-2xl mb-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">👤</span>
                  <div className="text-left">
                    <p className="text-sm font-bold text-orange-800">{personName}</p>
                    <p className="text-xs text-orange-600">{personDebts.length} dettes · {formatAmount(groupTotal)} restant</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {groupPaid > 0 && <span className="text-xs text-positive font-bold">{formatAmount(groupPaid)} payés ce mois</span>}
                  <ChevronRight size={16} className={`text-orange-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}/>
                </div>
              </button>
            )}

            {/* Show debts: always show if single, show if expanded if grouped */}
            {(!isGrouped || isExpanded) && personDebts.map(d => {
              const paidPct      = d.amount > 0 ? Math.round(((d.amount - d.remaining) / d.amount) * 100) : 0
              const monthsLeft   = d.minimumPayment > 0 ? Math.ceil(d.remaining / d.minimumPayment) : null
              const isSnowball   = plan.snowballTarget?.id === d.id
              const isRecurring  = (d as any).recurring ?? false
              const debtCategory = (d as any).category ?? 'Autre'
              const endDate      = projectedEndDate(d.remaining, d.minimumPayment)
              const showHistory  = openHistoryId === d.id
              const debtHistory  = historyMap[d.id] ?? []
              const paidThisMonth = monthlyPaid[d.id] || 0
              const stillDue = Math.max(0, (d.minimumPayment || 0) - paidThisMonth)

              let dueBadge: React.ReactNode = null
              if (d.dueDate) {
                const days = daysUntil(d.dueDate)
                if (days < 0)        dueBadge = <span className="inline-flex items-center gap-1 text-xs bg-danger text-white px-2 py-0.5 rounded-full font-bold">⚠️ En retard de {Math.abs(days)}j</span>
                else if (days === 0) dueBadge = <span className="inline-flex items-center gap-1 text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-bold">🔴 Aujourd'hui !</span>
                else if (days <= 7)  dueBadge = <span className="inline-flex items-center gap-1 text-xs bg-warning-light text-warning px-2 py-0.5 rounded-full font-bold">⏰ Dans {days}j</span>
                else if (days <= 30) dueBadge = <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-accent px-2 py-0.5 rounded-full font-medium">📅 Dans {days}j</span>
              }

              return (
                <div key={d.id} className={`card space-y-3 border-l-4 mb-2 ${isGrouped ? 'ml-4' : ''} ${d.type === 'owe' ? 'border-l-danger' : 'border-l-positive'} ${isSnowball ? 'ring-2 ring-accent ring-offset-1' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {isSnowball && <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full font-bold">🎯 Priorité</span>}
                        {isRecurring && <span className="text-xs bg-blue-50 text-accent border border-blue-100 px-2 py-0.5 rounded-full font-medium">🔄 Récurrent</span>}
                        {/* ── Catégorie en orange ── */}
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF7ED', color: '#C2410C', border: '1px solid #FDBA74' }}>{debtCategory}</span>
                        <span className="text-xs font-medium text-ink-soft">{d.type === 'owe' ? 'Je dois à' : 'Me doit'}</span>
                      </div>
                      <p className="font-bold text-base text-ink">{d.person}</p>
                      {d.note && <p className="text-xs text-blue-500 mt-0.5">{d.note}</p>}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                        {d.minimumPayment > 0 && (
                          <span className="text-xs text-ink-soft">
                            Min. <span className="font-semibold text-ink">{formatAmount(d.minimumPayment)}</span>/mois
                            {monthsLeft && !isRecurring && <span className="text-warning font-medium"> · ~{monthsLeft} mois</span>}
                          </span>
                        )}
                        {endDate && !isRecurring && <span className="text-xs text-ink-soft">Fin : <span className="font-semibold text-ink">{endDate}</span></span>}
                      </div>
                      {/* Monthly payment status */}
                      {d.type === 'owe' && d.minimumPayment > 0 && (
                        <div className="mt-1.5">
                          {paidThisMonth >= d.minimumPayment ? (
                            <span className="text-xs bg-positive-light text-positive px-2 py-0.5 rounded-full font-semibold">✅ Payé ce mois</span>
                          ) : paidThisMonth > 0 ? (
                            <span className="text-xs bg-warning-light text-warning px-2 py-0.5 rounded-full font-semibold">⚡ {formatAmount(stillDue)} restant ce mois</span>
                          ) : (
                            <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-semibold">⏳ À payer ce mois</span>
                          )}
                        </div>
                      )}
                      {dueBadge && <div className="mt-1.5">{dueBadge}</div>}
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <p className="font-mono font-bold text-lg text-ink">{formatAmount(d.remaining)}</p>
                      {paidPct > 0 && !isRecurring && <span className="text-xs font-semibold text-positive bg-positive-light px-2 py-0.5 rounded-full">{paidPct}% remboursé</span>}
                      <div className="flex gap-1 mt-0.5">
                        <button className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${showHistory ? 'bg-accent text-white' : 'bg-mist hover:bg-accent-light text-ink-soft hover:text-accent'}`} onClick={() => toggleHistory(d.id)}><History size={14}/></button>
                        <button className="w-8 h-8 rounded-xl bg-mist hover:bg-mist-dark text-ink-soft hover:text-ink flex items-center justify-center" onClick={() => openEdit(d)}><Pencil size={14}/></button>
                        <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center" onClick={async () => { await deleteDebt(d.id); setDebts(prev => prev.filter(x => x.id !== d.id)) }}><Trash2 size={14}/></button>
                      </div>
                    </div>
                  </div>

                  {paidPct > 0 && !isRecurring && (
                    <div className="space-y-1">
                      <div className="w-full h-2 bg-mist-dark rounded-full overflow-hidden">
                        <div className="h-full bg-positive rounded-full transition-all duration-500" style={{ width: `${paidPct}%` }}/>
                      </div>
                      <div className="flex justify-between text-xs text-ink-soft">
                        <span className="font-mono">{formatAmount(d.amount - d.remaining)} remboursés</span>
                        <span className="font-mono">sur {formatAmount(d.amount)}</span>
                      </div>
                    </div>
                  )}

                  {showHistory && (
                    <div className="bg-mist rounded-2xl overflow-hidden">
                      <div className="px-3 py-2.5 border-b border-mist-dark flex items-center justify-between">
                        <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Historique</p>
                        {debtHistory.length > 0 && <span className="text-xs font-mono font-bold text-positive">Total : {formatAmount(debtHistory.reduce((s, h) => s + h.amount, 0))}</span>}
                      </div>
                      {historyLoading && !historyMap[d.id] ? (
                        <p className="text-xs text-ink-soft text-center py-4">Chargement...</p>
                      ) : debtHistory.length === 0 ? (
                        <p className="text-xs text-ink-soft text-center italic py-4">Aucun remboursement enregistré</p>
                      ) : debtHistory.map(h => (
                        <div key={h.id} className="flex items-center justify-between px-3 py-2.5 border-b border-mist-dark last:border-0 hover:bg-white transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono font-bold text-positive">−{formatAmount(h.amount)}</p>
                            <p className="text-xs text-ink-soft">{new Date(h.paidAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            {h.note && <p className="text-xs text-ink-soft italic truncate">{h.note}</p>}
                          </div>
                          <div className="flex gap-1 ml-2 flex-shrink-0">
                            <button onClick={() => { setEditingPayment(h); setEditPayAmount(String(h.amount)); setEditPayDate(h.paidAt); setEditPayNote(h.note || '') }} className="w-7 h-7 rounded-lg bg-white hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center"><Pencil size={12}/></button>
                            <button onClick={() => handleDeletePayment(h)} className="w-7 h-7 rounded-lg bg-white hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"><Trash2 size={12}/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {payingId === d.id ? (
                    <div className="space-y-2 p-3 bg-danger-light rounded-2xl">
                      <p className="text-xs font-bold text-danger uppercase tracking-wide">Enregistrer un remboursement</p>
                      <p className="text-xs text-ink-soft">Catégorie : <strong className="text-ink">{debtCategory}</strong></p>
                      <input className="input bg-white" type="number" placeholder="Montant (Rs)" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus/>
                      <input className="input bg-white" type="date" value={payDate} onChange={e => setPayDate(e.target.value)}/>
                      <input className="input bg-white" placeholder="📝 Note (optionnel)" value={payNote} onChange={e => setPayNote(e.target.value)}/>
                      <div className="flex gap-2">
                        <button className="btn-ghost flex-1 bg-white" onClick={() => { setPayingId(null); setPayAmount(''); setPayDate(new Date().toISOString().slice(0, 10)); setPayNote('') }}>Annuler</button>
                        <button className="btn-primary flex-1" style={{ backgroundColor: '#DC2626' }} onClick={() => handlePay(d.id)}>Enregistrer</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <button
                        className="px-6 py-2.5 text-sm font-bold text-white rounded-2xl active:scale-95 transition-all"
                        style={{ backgroundColor: '#DC2626' }}
                        onClick={() => { setPayingId(d.id); setPayAmount(String(d.minimumPayment || '')); setPayDate(new Date().toISOString().slice(0, 10)); setPayNote('') }}
                      >
                        + Enregistrer un remboursement
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {confirmDeleteId && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2"><h2 className="text-lg font-bold text-ink">🎉 Dette soldée !</h2><button className="btn-icon bg-mist" onClick={() => setConfirmDeleteId(null)}><X size={20}/></button></div>
            <p className="text-sm text-ink-soft">Tu as remboursé cette dette entièrement. Veux-tu la supprimer ?</p>
            <div className="flex gap-2 mt-3">
              <button className="btn-ghost flex-1" onClick={() => setConfirmDeleteId(null)}>Garder</button>
              <button className="btn-primary flex-1" style={{ backgroundColor: '#DC2626' }} onClick={async () => { await deleteDebt(confirmDeleteId); setDebts(prev => prev.filter(d => d.id !== confirmDeleteId)); setConfirmDeleteId(null) }}>Oui, supprimer</button>
            </div>
          </div>
        </div>
      )}

      {editingPayment && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2"><h2 className="text-lg font-bold text-ink">Modifier le remboursement</h2><button className="btn-icon bg-mist" onClick={() => setEditingPayment(null)}><X size={20}/></button></div>
            <div><label className="label">Montant (Rs)</label><input className="input" type="number" value={editPayAmount} onChange={e => setEditPayAmount(e.target.value)}/></div>
            <div><label className="label">Date</label><input className="input" type="date" value={editPayDate} onChange={e => setEditPayDate(e.target.value)}/></div>
            <div><label className="label">Note (optionnel)</label><input className="input" placeholder="Ex: Virement avril..." value={editPayNote} onChange={e => setEditPayNote(e.target.value)}/></div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setEditingPayment(null)}>Annuler</button>
              <button className="btn-primary flex-1" style={{ backgroundColor: '#DC2626' }} onClick={handleEditPayment}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">{editingId ? 'Modifier' : 'Nouvelle dette / prêt'}</h2>
              <button className="btn-icon bg-mist" onClick={() => { setShowForm(false); resetForm() }}><X size={20}/></button>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'owe' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`} onClick={() => setForm(f => ({...f, type:'owe'}))}>💳 Je dois</button>
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'owed' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`} onClick={() => setForm(f => ({...f, type:'owed'}))}>🤝 On me doit</button>
            </div>
            <div>
              <label className="label">{form.type === 'owe' ? 'À qui tu dois ?' : 'Qui te doit ?'}</label>
              <CreditorPicker value={form.person} onChange={v => setForm(f => ({...f, person: v}))}/>
            </div>
            <div>
              <label className="label">Catégorie <span className="text-danger">*</span></label>
              <CategoryManager value={form.category} onChange={v => setForm(f => ({...f, category: v}))} customCategories={customCategories} onAddCustom={handleAddCustom} context="dettes"/>
              <p className="text-xs text-ink-soft mt-1">Les remboursements s'ajouteront au budget de cette catégorie</p>
            </div>
            <div><label className="label">Montant total (Rs)</label><input className="input" type="number" placeholder="Ex: 150000" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}/></div>
            <div><label className="label">Remboursement minimum / mois (Rs)</label><input className="input" type="number" placeholder="Ex: 3000" value={form.minimumPayment} onChange={e => setForm(f => ({...f, minimumPayment: e.target.value}))}/></div>
            <div><label className="label">Taux d'intérêt annuel % (optionnel)</label><input className="input" type="number" placeholder="Ex: 12" value={form.interestRate} onChange={e => setForm(f => ({...f, interestRate: e.target.value}))}/></div>
            <div><label className="label">Note</label><input className="input" placeholder="Ex: Crédit voiture Honda" value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))}/></div>
            <div><label className="label">Échéance finale (optionnel)</label><input className="input" type="date" value={form.dueDate} onChange={e => setForm(f => ({...f, dueDate: e.target.value}))}/></div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-2xl border border-blue-100">
              <div>
                <p className="text-sm font-bold text-accent">🔄 Paiement récurrent</p>
                <p className="text-xs text-blue-500 mt-0.5">Le solde se remet à zéro après paiement</p>
              </div>
              <button onClick={() => setForm(f => ({...f, recurring: !f.recurring}))}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${form.recurring ? 'bg-accent' : 'bg-mist-dark'}`}>
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

// ─── Savings helpers ──────────────────────────────────────────────────────────
async function fetchSavingsDeposits(goalId: string): Promise<SavingsDeposit[]> {
  const { data } = await supabase.from('savings_deposits').select('*').eq('goal_id', goalId).order('deposited_at', { ascending: false })
  return (data ?? []).map(r => ({
    id: r.id, goalId: r.goal_id, amount: Number(r.amount),
    isWithdrawal: r.is_withdrawal ?? false, note: r.note ?? undefined,
    depositedAt: r.deposited_at,
  }))
}
async function addSavingsDeposit(goalId: string, amount: number, isWithdrawal: boolean, note: string, date: string): Promise<void> {
  await supabase.from('savings_deposits').insert({ goal_id: goalId, amount, is_withdrawal: isWithdrawal, note: note || null, deposited_at: date })
}
async function updateSavingsDeposit(id: string, amount: number, note: string, date: string): Promise<void> {
  await supabase.from('savings_deposits').update({ amount, note: note || null, deposited_at: date }).eq('id', id)
}
async function deleteSavingsDeposit(id: string): Promise<void> {
  await supabase.from('savings_deposits').delete().eq('id', id)
}

function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()))
}
function suggestedMonthly(remaining: number, targetDate: string): number | null {
  if (!targetDate || remaining <= 0) return null
  const months = monthsBetween(new Date(), new Date(targetDate))
  if (months <= 0) return null
  return Math.ceil(remaining / months)
}

// ─── Épargne ──────────────────────────────────────────────────────────────────
function EpargneSection() {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [celebratedGoals, setCelebratedGoals] = useState<Set<string>>(new Set())

  // Deposit modal state
  const [depositGoalId, setDepositGoalId] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositNote, setDepositNote] = useState('')
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10))
  const [isWithdrawal, setIsWithdrawal] = useState(false)

  // History state
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null)
  const [depositsMap, setDepositsMap] = useState<Record<string, SavingsDeposit[]>>({})
  const [historyLoading, setHistoryLoading] = useState(false)

  // Edit deposit
  const [editingDeposit, setEditingDeposit] = useState<SavingsDeposit | null>(null)
  const [editDepAmount, setEditDepAmount] = useState('')
  const [editDepNote, setEditDepNote] = useState('')
  const [editDepDate, setEditDepDate] = useState('')

  const [form, setForm] = useState({
    name: '', target: '', emoji: EMOJIS[0], targetDate: '',
  })

  useEffect(() => { getSavings().then(setGoals).finally(() => setLoading(false)) }, [])

  // Sort goals: closest to completion first
  const sortedGoals = [...goals].sort((a, b) => {
    const pctA = a.target > 0 ? a.saved / a.target : 0
    const pctB = b.target > 0 ? b.saved / b.target : 0
    return pctB - pctA
  })

  const tip = goals.length > 0 ? `💰 Continue à alimenter tes objectifs d'épargne !` : `Crée tes premiers objectifs. Même 500 Rs/mois, ça compte !`
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0)

  async function handleAdd() {
    if (!form.name || !form.target) return
    const newGoal = await addSavingsGoal({
      name: form.name, target: Number(form.target), saved: 0, emoji: form.emoji,
      ...({ targetDate: form.targetDate || null } as any)
    })
    setGoals(prev => [...prev, newGoal])
    setForm({ name: '', target: '', emoji: EMOJIS[0], targetDate: '' })
    setShowForm(false)
  }

  async function handleDeposit() {
    if (!depositGoalId || !depositAmount || Number(depositAmount) <= 0) return
    const goal = goals.find(g => g.id === depositGoalId)!
    const amt = Number(depositAmount)
    const delta = isWithdrawal ? -amt : amt
    const newSaved = Math.max(0, goal.saved + delta)

    await addSavingsDeposit(depositGoalId, amt, isWithdrawal, depositNote, depositDate)
    await updateSavingsGoal(depositGoalId, newSaved)
    setGoals(prev => prev.map(g => g.id === depositGoalId ? { ...g, saved: newSaved } : g))

    // Confetti if just reached target
    if (!isWithdrawal && newSaved >= goal.target && goal.saved < goal.target && !celebratedGoals.has(depositGoalId)) {
      setShowConfetti(true)
      setCelebratedGoals(prev => new Set([...prev, depositGoalId]))
    }

    // Invalidate history cache
    setDepositsMap(prev => { const n = { ...prev }; delete n[depositGoalId]; return n })

    setDepositGoalId(null); setDepositAmount(''); setDepositNote(''); setDepositDate(new Date().toISOString().slice(0, 10)); setIsWithdrawal(false)
  }

  async function toggleHistory(goalId: string) {
    if (openHistoryId === goalId) { setOpenHistoryId(null); return }
    setOpenHistoryId(goalId)
    if (!depositsMap[goalId]) {
      setHistoryLoading(true)
      const d = await fetchSavingsDeposits(goalId)
      setDepositsMap(prev => ({ ...prev, [goalId]: d }))
      setHistoryLoading(false)
    }
  }
  async function reloadDeposits(goalId: string) {
    const d = await fetchSavingsDeposits(goalId)
    setDepositsMap(prev => ({ ...prev, [goalId]: d }))
  }

  async function handleEditDeposit() {
    if (!editingDeposit) return
    const newAmt = Number(editDepAmount)
    if (!newAmt || newAmt <= 0) return
    const oldAmt = editingDeposit.amount
    const diff = editingDeposit.isWithdrawal ? (oldAmt - newAmt) : (newAmt - oldAmt)
    await updateSavingsDeposit(editingDeposit.id, newAmt, editDepNote, editDepDate)
    const goal = goals.find(g => g.id === editingDeposit.goalId)
    if (goal) {
      const newSaved = Math.max(0, goal.saved + diff)
      await updateSavingsGoal(goal.id, newSaved)
      setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, saved: newSaved } : g))
    }
    await reloadDeposits(editingDeposit.goalId)
    setEditingDeposit(null)
  }

  async function handleDeleteDeposit(d: SavingsDeposit) {
    const goal = goals.find(g => g.id === d.goalId)
    if (goal) {
      const delta = d.isWithdrawal ? d.amount : -d.amount
      const newSaved = Math.max(0, goal.saved + delta)
      await updateSavingsGoal(goal.id, newSaved)
      setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, saved: newSaved } : g))
    }
    await deleteSavingsDeposit(d.id)
    await reloadDeposits(d.goalId)
  }

  // Per-goal stats
  function getGoalStats(g: SavingsGoal, deposits: SavingsDeposit[]) {
    if (!deposits || deposits.length === 0) return { avgMonthly: 0, lastDeposit: null, monthsActive: 0 }
    const contributions = deposits.filter(d => !d.isWithdrawal)
    if (contributions.length === 0) return { avgMonthly: 0, lastDeposit: deposits[0] ?? null, monthsActive: 0 }
    const oldest = new Date(contributions[contributions.length - 1].depositedAt)
    const monthsActive = Math.max(1, monthsBetween(oldest, new Date()) + 1)
    const totalContributed = contributions.reduce((s, d) => s + d.amount, 0)
    return {
      avgMonthly: Math.round(totalContributed / monthsActive),
      lastDeposit: deposits[0] ?? null,
      monthsActive,
    }
  }

  function getPaceBadge(g: SavingsGoal): React.ReactNode {
    const targetDate = (g as any).targetDate
    if (!targetDate || g.target <= 0) return null
    const monthsLeft = monthsBetween(new Date(), new Date(targetDate))
    if (monthsLeft <= 0) return <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-bold">⚠️ Date dépassée</span>
    const needed = (g.target - g.saved) / monthsLeft
    const deposits = depositsMap[g.id]
    if (!deposits || deposits.length === 0) return null
    const { avgMonthly } = getGoalStats(g, deposits)
    if (avgMonthly === 0) return null
    if (avgMonthly >= needed) return <span className="text-xs bg-positive-light text-positive px-2 py-0.5 rounded-full font-bold">🔥 En avance !</span>
    return <span className="text-xs bg-warning-light text-warning px-2 py-0.5 rounded-full font-bold">⚠️ En retard</span>
  }

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>

  return (
    <div className="space-y-3">
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)}/>}

      <CoachTip message={tip} />
      <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-2xl">
        <span className="text-base">💡</span>
        <p className="text-xs text-green-700 leading-relaxed"><strong>Règle d'or :</strong> Épargne d'abord, dépense ensuite. Les objectifs sont triés par avancement.</p>
      </div>

      {goals.length > 0 && (
        <div className="card border border-positive/20 text-center">
          <p className="text-xs font-bold text-positive uppercase tracking-wide">Total épargné</p>
          <p className="text-2xl font-bold font-mono text-positive mt-1">{formatAmount(totalSaved)}</p>
          <p className="text-xs text-ink-soft mt-1">sur {goals.length} objectif{goals.length > 1 ? 's' : ''}</p>
        </div>
      )}

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2" style={{ backgroundColor: '#16A34A' }}><Plus size={18}/> Nouvel objectif d'épargne</button>

      {goals.length === 0 ? (
        <div className="card text-center py-10"><p className="text-3xl mb-2">🐖</p><p className="font-semibold text-ink">Aucun objectif d'épargne</p><p className="text-sm text-ink-soft mt-1">Fonds d'urgence, vacances, voiture...</p></div>
      ) : sortedGoals.map(g => {
        const pct  = Math.min(100, g.target > 0 ? (g.saved / g.target) * 100 : 0)
        const done = g.saved >= g.target
        const targetDate = (g as any).targetDate
        const suggested = suggestedMonthly(g.target - g.saved, targetDate)
        const showHistory = openHistoryId === g.id
        const deposits = depositsMap[g.id] ?? []
        const { avgMonthly, lastDeposit } = getGoalStats(g, deposits)
        const paceBadge = getPaceBadge(g)

        return (
          <div key={g.id} className={`card space-y-3 ${done ? 'border-2 border-positive/40' : ''}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-3xl flex-shrink-0">{g.emoji}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    {done && <span className="text-xs bg-positive text-white px-2 py-0.5 rounded-full font-bold">✅ Objectif atteint !</span>}
                    {!done && paceBadge}
                  </div>
                  <p className="font-bold text-ink leading-tight">{g.name}</p>
                  {targetDate && <p className="text-xs text-ink-soft mt-0.5">🎯 Objectif : {new Date(targetDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>}
                  {!done && <p className="text-xs text-ink-soft">{formatAmount(g.target - g.saved)} restant</p>}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0 ml-2">
                <button className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${showHistory ? 'bg-positive text-white' : 'bg-mist hover:bg-positive-light text-ink-soft hover:text-positive'}`} onClick={() => toggleHistory(g.id)}><History size={14}/></button>
                <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center" onClick={() => setConfirmDeleteId(g.id)}><Trash2 size={14}/></button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-3 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: done ? '#16A34A' : pct >= 80 ? '#2563EB' : '#2563EB', opacity: done ? 1 : 0.7 + pct * 0.003 }}/>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-mono font-bold text-accent">{formatAmount(g.saved)}</span>
              <span className="font-mono text-ink-soft">{pct.toFixed(0)}% · objectif {formatAmount(g.target)}</span>
            </div>

            {/* Stats row */}
            {depositsMap[g.id] && depositsMap[g.id].length > 0 && (
              <div className="flex gap-3 text-xs text-ink-soft bg-mist rounded-xl px-3 py-2">
                {avgMonthly > 0 && <span>📊 Moy. <strong className="text-ink">{formatAmount(avgMonthly)}</strong>/mois</span>}
                {lastDeposit && <span>🕐 Dernier : <strong className="text-ink">{new Date(lastDeposit.depositedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</strong></span>}
              </div>
            )}

            {/* Suggested amount */}
            {suggested && !done && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                <span className="text-sm">💡</span>
                <p className="text-xs text-blue-700">Mets de côté <strong>{formatAmount(suggested)}/mois</strong> pour atteindre ton objectif à temps</p>
              </div>
            )}

            {/* History */}
            {showHistory && (
              <div className="bg-mist rounded-2xl overflow-hidden">
                <div className="px-3 py-2.5 border-b border-mist-dark flex items-center justify-between">
                  <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Historique</p>
                  {deposits.length > 0 && <span className="text-xs font-mono font-bold text-positive">+{formatAmount(deposits.filter(d => !d.isWithdrawal).reduce((s, d) => s + d.amount, 0))}</span>}
                </div>
                {historyLoading && !depositsMap[g.id] ? (
                  <p className="text-xs text-ink-soft text-center py-4">Chargement...</p>
                ) : deposits.length === 0 ? (
                  <p className="text-xs text-ink-soft text-center italic py-4">Aucun versement enregistré</p>
                ) : deposits.map(dep => (
                  <div key={dep.id} className="flex items-center justify-between px-3 py-2.5 border-b border-mist-dark last:border-0 hover:bg-white transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-mono font-bold ${dep.isWithdrawal ? 'text-danger' : 'text-positive'}`}>
                        {dep.isWithdrawal ? '−' : '+'}{formatAmount(dep.amount)}
                        {dep.isWithdrawal && <span className="ml-1 text-xs font-normal text-ink-soft">(retrait)</span>}
                      </p>
                      <p className="text-xs text-ink-soft">{new Date(dep.depositedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      {dep.note && <p className="text-xs text-ink-soft italic truncate">{dep.note}</p>}
                    </div>
                    <div className="flex gap-1 ml-2 flex-shrink-0">
                      <button onClick={() => { setEditingDeposit(dep); setEditDepAmount(String(dep.amount)); setEditDepNote(dep.note || ''); setEditDepDate(dep.depositedAt) }} className="w-7 h-7 rounded-lg bg-white hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center"><Pencil size={12}/></button>
                      <button onClick={() => handleDeleteDeposit(dep)} className="w-7 h-7 rounded-lg bg-white hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"><Trash2 size={12}/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Deposit / Withdraw buttons */}
            {depositGoalId === g.id ? (
              <div className="space-y-2 p-3 rounded-2xl" style={{ backgroundColor: isWithdrawal ? '#FEF2F2' : '#F0FDF4' }}>
                <div className="flex rounded-xl overflow-hidden border-2 border-mist-dark">
                  <button className={`flex-1 py-2 text-xs font-bold ${!isWithdrawal ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`} onClick={() => setIsWithdrawal(false)}>+ Dépôt</button>
                  <button className={`flex-1 py-2 text-xs font-bold ${isWithdrawal ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`} onClick={() => setIsWithdrawal(true)}>− Retrait</button>
                </div>
                <input className="input bg-white" type="number" placeholder="Montant (Rs)" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} autoFocus/>
                <input className="input bg-white" type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)}/>
                <input className="input bg-white" placeholder="📝 Note (optionnel, ex: Bonus janvier)" value={depositNote} onChange={e => setDepositNote(e.target.value)}/>
                <div className="flex gap-2">
                  <button className="btn-ghost flex-1 bg-white" onClick={() => { setDepositGoalId(null); setDepositAmount(''); setDepositNote(''); setIsWithdrawal(false) }}>Annuler</button>
                  <button className="btn-primary flex-1" style={{ backgroundColor: isWithdrawal ? '#DC2626' : '#16A34A' }} onClick={handleDeposit}>Enregistrer</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button className="flex-1 py-3 text-sm font-bold text-positive bg-positive-light hover:bg-green-100 rounded-2xl active:scale-95 transition-all" onClick={() => { setDepositGoalId(g.id); setDepositAmount(''); setDepositNote(''); setIsWithdrawal(false); setDepositDate(new Date().toISOString().slice(0, 10)) }}>
                  + Mettre de côté
                </button>
                <button className="w-12 py-3 text-sm font-bold text-danger bg-danger-light hover:bg-red-100 rounded-2xl active:scale-95 transition-all flex items-center justify-center" onClick={() => { setDepositGoalId(g.id); setDepositAmount(''); setDepositNote(''); setIsWithdrawal(true); setDepositDate(new Date().toISOString().slice(0, 10)) }}>
                  <Minus size={16}/>
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Confirm delete */}
      {confirmDeleteId && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Supprimer l'objectif ?</h2>
              <button className="btn-icon bg-mist" onClick={() => setConfirmDeleteId(null)}><X size={20}/></button>
            </div>
            <p className="text-sm text-ink-soft">Cette action est irréversible. Tout l'historique sera perdu.</p>
            <div className="flex gap-2 mt-3">
              <button className="btn-ghost flex-1" onClick={() => setConfirmDeleteId(null)}>Annuler</button>
              <button className="btn-primary flex-1" style={{ backgroundColor: '#DC2626' }} onClick={async () => { await deleteSavingsGoal(confirmDeleteId); setGoals(prev => prev.filter(g => g.id !== confirmDeleteId)); setConfirmDeleteId(null) }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit deposit modal */}
      {editingDeposit && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Modifier le versement</h2>
              <button className="btn-icon bg-mist" onClick={() => setEditingDeposit(null)}><X size={20}/></button>
            </div>
            <div><label className="label">Montant (Rs)</label><input className="input" type="number" value={editDepAmount} onChange={e => setEditDepAmount(e.target.value)}/></div>
            <div><label className="label">Date</label><input className="input" type="date" value={editDepDate} onChange={e => setEditDepDate(e.target.value)}/></div>
            <div><label className="label">Note (optionnel)</label><input className="input" placeholder="Ex: Bonus janvier..." value={editDepNote} onChange={e => setEditDepNote(e.target.value)}/></div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setEditingDeposit(null)}>Annuler</button>
              <button className="btn-primary flex-1" style={{ backgroundColor: '#16A34A' }} onClick={handleEditDeposit}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* New goal form */}
      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvel objectif d'épargne</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div><label className="label">Icône</label><div className="flex gap-2 flex-wrap">{EMOJIS.map(e => (<button key={e} className={`text-2xl p-2 rounded-2xl transition-colors ${form.emoji === e ? 'bg-accent-light' : 'bg-mist'}`} onClick={() => setForm(f => ({...f, emoji: e}))}>{e}</button>))}</div></div>
            <div><label className="label">Nom de l'objectif</label><input className="input" placeholder="Ex: Fonds d'urgence, Vacances..." value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}/></div>
            <div><label className="label">Montant cible (Rs)</label><input className="input" type="number" placeholder="Ex: 50000" value={form.target} onChange={e => setForm(f => ({...f, target: e.target.value}))}/></div>
            <div>
              <label className="label">Date cible (optionnel)</label>
              <input className="input" type="date" value={form.targetDate} onChange={e => setForm(f => ({...f, targetDate: e.target.value}))}/>
              {form.targetDate && form.target && (
                <p className="text-xs text-blue-600 mt-1">
                  💡 Tu devras mettre de côté environ <strong>{formatAmount(suggestedMonthly(Number(form.target), form.targetDate) ?? 0)}/mois</strong>
                </p>
              )}
            </div>
            <button className="btn-primary w-full py-4" onClick={handleAdd} style={{ backgroundColor: '#16A34A' }}>Créer l'objectif</button>
          </div>
        </div>
      )}
    </div>
  )
}
