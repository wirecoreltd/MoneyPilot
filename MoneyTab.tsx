'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Pencil, History, ChevronDown, Check, ChevronUp, ChevronRight, Minus } from 'lucide-react'
import {
  Transaction, BudgetCategory, SavingsGoal, Debt,
  EXPENSE_CATEGORIES,
  addTransaction, deleteTransaction,
  getBudgets, addBudget, updateBudget, deleteBudget,
  getSavings, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
  getDebts, addDebt, updateDebt, deleteDebt,
  formatAmount, currentYearMonth, hasStarted,
} from '@/lib/storage'
import CoachTip from './CoachTip'
import { supabase } from '@/lib/supabase'
import { MoneySubTab } from '@/app/page'
import { budgetStatus, debtEndLabel, isoDate, estimateVariableAmount } from '@/lib/finance'
import { useSpendingLines } from '@/lib/useSpendingLines'
import {
  sumByCategory, sumCategory, durationLabel, BUDGET_DURATIONS,
  computeBudgetStatuses, earliestCycleStart, budgetCycle, isCustomBudget,
} from '@/lib/budgetPeriods'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './components/money/PeriodFilter'
import { DEFAULT_CATEGORIES, useCustomCategories, CategoryManager } from './components/money/categories'
import { TransactionsSection } from './components/money/TransactionsSection'
import { RevenusSection } from './components/money/RevenusSection'
import { FacturesSection } from './components/money/FacturesSection'
import { BudgetSection } from './components/money/BudgetSection'
import { DettesSection } from './components/money/DettesSection'

type SubTab = MoneySubTab

interface Props {
  transactions: Transaction[]
  onUpdate: () => void
  initialSubTab?: SubTab
  onSubTabChange?: (sub: SubTab) => void
}

interface SavingsDeposit {
  id: string
  goalId: string
  amount: number
  isWithdrawal: boolean
  note?: string
  depositedAt: string
}

const EMOJIS = ['🏖️','🚗','🏠','💻','📱','✈️','🎓','💍','💰','🎮','👶']

const SUBTAB_KEY = 'moneyapp_subtab'
function loadSubTab(): SubTab {
  if (typeof window === 'undefined') return 'transactions'
  const v = localStorage.getItem(SUBTAB_KEY)
  if (v === 'transactions' || v === 'budget' || v === 'dettes' || v === 'epargne' || v === 'factures' || v === 'revenus') return v
  return 'transactions'
}

const SUBTABS = [
  {
    id: 'transactions' as SubTab,
    emoji: '🛒', label: 'Dépense',
    shortDesc: 'Mes dépenses du mois',
    fullDesc: 'Enregistre chaque dépense ponctuelle. Les revenus se gèrent dans la carte "Revenus".',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    activeColor: 'bg-accent text-white'
  },
  {
    id: 'revenus' as SubTab,
    emoji: '💰', label: 'Revenus',
    shortDesc: 'Mes sources de revenus',
    fullDesc: 'Ajoute tes sources de revenus du mois : salaire, freelance, loyer perçu... Le total est calculé automatiquement.',
    color: 'bg-green-50 border-green-200 text-green-700',
    activeColor: 'bg-positive text-white'
  },
  {
    id: 'factures' as SubTab,
    emoji: '🧾', label: 'Factures',
    shortDesc: 'Factures à payer ce mois',
    fullDesc: 'Suis tes factures récurrentes (eau, élec, internet) et ponctuelles reçues.',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    activeColor: 'bg-yellow-500 text-white'
  },
  {
    id: 'budget' as SubTab,
    emoji: '🎯', label: 'Budget',
    shortDesc: 'Mes plafonds par catégorie',
    fullDesc: 'Fixe des limites de dépenses par catégorie pour mieux contrôler ton argent.',
    color: 'bg-orange-50 border-orange-200 text-orange-700',
    activeColor: 'bg-orange-500 text-white'
  },
  {
    id: 'dettes' as SubTab,
    emoji: '💳', label: 'Dettes',
    shortDesc: 'Ce que je dois / on me doit',
    fullDesc: 'Suis tes crédits et prêts. Différent d\'une facture : une dette se rembourse progressivement sur plusieurs mois/années.',
    color: 'bg-red-50 border-red-200 text-red-700',
    activeColor: 'bg-danger text-white'
  },
  {
    id: 'epargne' as SubTab,
    emoji: '🪙', label: 'Épargne',
    shortDesc: 'Mes objectifs d\'économies',
    fullDesc: 'Crée des objectifs d\'épargne avec un montant cible. Règle d\'or : épargne d\'abord, dépense ensuite.',
    color: 'bg-green-50 border-green-200 text-green-700',
    activeColor: 'bg-positive text-white'
  },
]

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

export default function MoneyTab({ transactions, onUpdate, initialSubTab, onSubTabChange }: Props) {
  const [sub, setSub] = useState<SubTab>(initialSubTab ?? loadSubTab())
  const [showInfo, setShowInfo] = useState<SubTab | null>(null)

  useEffect(() => {
    if (initialSubTab && initialSubTab !== sub) {
      setSub(initialSubTab)
      localStorage.setItem(SUBTAB_KEY, initialSubTab)
    }
  }, [initialSubTab])

  function handleSetSub(id: SubTab) {
    setSub(id)
    localStorage.setItem(SUBTAB_KEY, id)
    onSubTabChange?.(id)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => handleSetSub(t.id)}
            className={`relative flex flex-col items-start p-3 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${sub === t.id ? t.activeColor + ' border-transparent shadow-sm' : 'bg-white border-mist-dark'}`}>
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-lg">{t.emoji}</span>
              <button onClick={e => { e.stopPropagation(); setShowInfo(showInfo === t.id ? null : t.id) }}
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors text-[10px] ${sub === t.id ? 'bg-white/20 text-white' : 'bg-mist text-ink-soft'}`}>
                i
              </button>
            </div>
            <p className={`text-xs font-bold ${sub === t.id ? 'text-white' : 'text-ink'}`}>{t.label}</p>
            <p className={`text-[10px] mt-0.5 leading-tight ${sub === t.id ? 'text-white/75' : 'text-ink-soft'}`}>{t.shortDesc}</p>
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
      {sub === 'revenus'      && <RevenusSection />}
      {sub === 'factures'     && <FacturesSection />}
      {sub === 'budget'       && <BudgetSection transactions={transactions} />}
      {sub === 'dettes'       && <DettesSection />}
      {sub === 'epargne'      && <EpargneSection />}
    </div>
  )
}

// ─── Savings helpers ──────────────────────────────────────────────────────────
async function fetchSavingsDeposits(goalId: string): Promise<SavingsDeposit[]> {
  const { data, error } = await supabase.from('savings_deposits').select('*').eq('goal_id', goalId).order('deposited_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, goalId: r.goal_id, amount: Number(r.amount),
    isWithdrawal: r.is_withdrawal ?? false, note: r.note ?? undefined,
    depositedAt: r.deposited_at,
  }))
}
async function addSavingsDeposit(goalId: string, amount: number, isWithdrawal: boolean, note: string, date: string): Promise<void> {
  const { error } = await supabase.from('savings_deposits').insert({ goal_id: goalId, amount, is_withdrawal: isWithdrawal, note: note || null, deposited_at: date })
  if (error) throw error
}
async function updateSavingsDeposit(id: string, amount: number, note: string, date: string): Promise<void> {
  const { error } = await supabase.from('savings_deposits').update({ amount, note: note || null, deposited_at: date }).eq('id', id)
  if (error) throw error
}
async function deleteSavingsDeposit(id: string): Promise<void> {
  const { error } = await supabase.from('savings_deposits').delete().eq('id', id)
  if (error) throw error
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

function EpargneSection() {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [celebratedGoals, setCelebratedGoals] = useState<Set<string>>(new Set())
  const [depositGoalId, setDepositGoalId] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositNote, setDepositNote] = useState('')
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10))
  const [isWithdrawal, setIsWithdrawal] = useState(false)
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null)
  const [depositsMap, setDepositsMap] = useState<Record<string, SavingsDeposit[]>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editingDeposit, setEditingDeposit] = useState<SavingsDeposit | null>(null)
  const [editDepAmount, setEditDepAmount] = useState('')
  const [editDepNote, setEditDepNote] = useState('')
  const [editDepDate, setEditDepDate] = useState('')
  const [form, setForm] = useState({ name: '', target: '', emoji: EMOJIS[0], targetDate: '' })

  function loadGoals() {
    setLoading(true); setLoadError(null)
    getSavings()
      .then(setGoals)
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadGoals() }, [])

  const sortedGoals = [...goals].sort((a, b) => {
    const pctA = a.target > 0 ? a.saved / a.target : 0
    const pctB = b.target > 0 ? b.saved / b.target : 0
    return pctB - pctA
  })

  const tip = goals.length > 0 ? `💰 Continue à alimenter tes objectifs d'épargne !` : `Crée tes premiers objectifs. Même 500 Rs/mois, ça compte !`
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0)

  async function handleAdd() {
    if (!form.name || !form.target) return
    try {
      const newGoal = await addSavingsGoal({
        name: form.name, target: Number(form.target), saved: 0, emoji: form.emoji,
        category: 'Épargne',
        ...({ targetDate: form.targetDate || null } as any)
      })
      setGoals(prev => [...prev, newGoal])
      setForm({ name: '', target: '', emoji: EMOJIS[0], targetDate: '' })
      setShowForm(false)
    } catch {
      window.alert("Impossible de créer l'objectif. Réessaie.")
    }
  }

  async function handleDeposit() {
    if (!depositGoalId || !depositAmount || Number(depositAmount) <= 0) return
    const goal = goals.find(g => g.id === depositGoalId)!
    const amt = Number(depositAmount)
    const delta = isWithdrawal ? -amt : amt
    const newSaved = Math.max(0, goal.saved + delta)
    try {
      await addSavingsDeposit(depositGoalId, amt, isWithdrawal, depositNote, depositDate)
      await updateSavingsGoal(depositGoalId, newSaved)
    } catch {
      window.alert("Impossible d'enregistrer le mouvement. Réessaie.")
      return
    }
    setGoals(prev => prev.map(g => g.id === depositGoalId ? { ...g, saved: newSaved } : g))
    if (!isWithdrawal && newSaved >= goal.target && goal.saved < goal.target && !celebratedGoals.has(depositGoalId)) {
      setShowConfetti(true)
      setCelebratedGoals(prev => new Set([...prev, depositGoalId]))
    }
    setDepositsMap(prev => { const n = { ...prev }; delete n[depositGoalId]; return n })
    setDepositGoalId(null); setDepositAmount(''); setDepositNote(''); setDepositDate(new Date().toISOString().slice(0, 10)); setIsWithdrawal(false)
  }

  async function toggleHistory(goalId: string) {
    if (openHistoryId === goalId) { setOpenHistoryId(null); return }
    setOpenHistoryId(goalId)
    if (!depositsMap[goalId]) {
      setHistoryLoading(true)
      try {
        const d = await fetchSavingsDeposits(goalId)
        setDepositsMap(prev => ({ ...prev, [goalId]: d }))
      } catch {
        window.alert("Impossible de charger l'historique. Réessaie.")
        setOpenHistoryId(null)
      }
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
    try {
      await updateSavingsDeposit(editingDeposit.id, newAmt, editDepNote, editDepDate)
      const goal = goals.find(g => g.id === editingDeposit.goalId)
      if (goal) {
        const newSaved = Math.max(0, goal.saved + diff)
        await updateSavingsGoal(goal.id, newSaved)
        setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, saved: newSaved } : g))
      }
      await reloadDeposits(editingDeposit.goalId)
      setEditingDeposit(null)
    } catch {
      window.alert('Impossible de modifier le mouvement. Réessaie.')
    }
  }

  async function handleDeleteDeposit(d: SavingsDeposit) {
    try {
      // On supprime d'abord le mouvement : si ça échoue, le solde n'est pas touché
      await deleteSavingsDeposit(d.id)
      const goal = goals.find(g => g.id === d.goalId)
      if (goal) {
        const delta = d.isWithdrawal ? d.amount : -d.amount
        const newSaved = Math.max(0, goal.saved + delta)
        await updateSavingsGoal(goal.id, newSaved)
        setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, saved: newSaved } : g))
      }
      await reloadDeposits(d.goalId)
    } catch {
      window.alert('Impossible de supprimer le mouvement. Réessaie.')
    }
  }

  async function handleDeleteGoal(id: string) {
    try {
      await deleteSavingsGoal(id)
      setGoals(prev => prev.filter(g => g.id !== id))
      setConfirmDeleteId(null)
    } catch {
      window.alert("Impossible de supprimer l'objectif. Réessaie.")
    }
  }

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>
  if (loadError) {
    return (
      <div className="card text-center py-8 space-y-3">
        <p className="text-sm text-danger">Impossible de charger tes objectifs : {loadError}</p>
        <button className="btn-ghost" onClick={loadGoals}>Réessayer</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)}/>}
      <CoachTip message={tip} />
      <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-2xl">
        <span className="text-base">💡</span>
        <p className="text-xs text-green-700 leading-relaxed">
          <strong>Objectifs d'épargne à long terme.</strong> Règle d'or : épargne d'abord, dépense ensuite.
        </p>
      </div>

      {goals.length > 0 && (
        <div className="card border border-positive/20 text-center">
          <p className="text-xs font-bold text-positive uppercase tracking-wide">Total épargné</p>
          <p className="text-2xl font-bold font-mono text-positive mt-1">{formatAmount(totalSaved)}</p>
        </div>
      )}

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2" style={{ backgroundColor: '#16A34A' }}><Plus size={18}/> Nouvel objectif d'épargne</button>

      {goals.length === 0 ? (
        <div className="card text-center py-10"><p className="text-3xl mb-2">🐖</p><p className="font-semibold text-ink">Aucun objectif d'épargne</p></div>
      ) : sortedGoals.map(g => {
        const pct  = Math.min(100, g.target > 0 ? (g.saved / g.target) * 100 : 0)
        const done = g.saved >= g.target
        const targetDate = (g as any).targetDate
        const suggested = suggestedMonthly(g.target - g.saved, targetDate)
        const showHistory = openHistoryId === g.id
        const deposits = depositsMap[g.id] ?? []

        return (
          <div key={g.id} className={`card space-y-3 ${done ? 'border-2 border-positive/40' : ''}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-3xl flex-shrink-0">{g.emoji}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    {done && <span className="text-xs bg-positive text-white px-2 py-0.5 rounded-full font-bold">✅ Objectif atteint !</span>}
                  </div>
                  <p className="font-bold text-ink leading-tight">{g.name}</p>
                  {targetDate && <p className="text-xs text-ink-soft mt-0.5">🎯 {new Date(targetDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>}
                  {!done && <p className="text-xs text-ink-soft">{formatAmount(g.target - g.saved)} restant</p>}
                  {!done && targetDate && (
                    suggested
                      ? <p className="text-xs text-accent font-semibold mt-0.5">💡 Mets {formatAmount(suggested)}/mois pour atteindre ton objectif à temps</p>
                      : <p className="text-xs text-danger font-semibold mt-0.5">⏰ Date cible dépassée — objectif toujours actif</p>
                  )}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0 ml-2">
                <button className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${showHistory ? 'bg-positive text-white' : 'bg-mist hover:bg-positive-light text-ink-soft hover:text-positive'}`} onClick={() => toggleHistory(g.id)}><History size={14}/></button>
                <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center" onClick={() => setConfirmDeleteId(g.id)}><Trash2 size={14}/></button>
              </div>
            </div>

            <div className="w-full h-3 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: done ? '#16A34A' : '#2563EB' }}/>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-mono font-bold text-accent">{formatAmount(g.saved)}</span>
              <span className="font-mono text-ink-soft">{pct.toFixed(0)}% · objectif {formatAmount(g.target)}</span>
            </div>

            {showHistory && (
              <div className="bg-mist rounded-2xl overflow-hidden">
                <div className="px-3 py-2.5 border-b border-mist-dark flex items-center justify-between">
                  <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Historique</p>
                  {deposits.length > 0 && <span className="text-xs font-mono font-bold text-positive">Total : {formatAmount(deposits.filter(d => !d.isWithdrawal).reduce((s, d) => s + d.amount, 0))}</span>}
                </div>
                {historyLoading && !depositsMap[g.id] ? (
                  <p className="text-xs text-ink-soft text-center py-4">Chargement...</p>
                ) : deposits.length === 0 ? (
                  <p className="text-xs text-ink-soft text-center italic py-4">Aucun mouvement enregistré</p>
                ) : deposits.map(dep => (
                  <div key={dep.id} className="flex items-center justify-between px-3 py-2.5 border-b border-mist-dark last:border-0 hover:bg-white transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-mono font-bold ${dep.isWithdrawal ? 'text-danger' : 'text-positive'}`}>
                        {dep.isWithdrawal ? '−' : '+'}{formatAmount(dep.amount)}
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

            {depositGoalId === g.id ? (
              <div className="space-y-2 p-3 rounded-2xl" style={{ backgroundColor: isWithdrawal ? '#FEF2F2' : '#F0FDF4' }}>
                <div className="flex rounded-xl overflow-hidden border-2 border-mist-dark">
                  <button className={`flex-1 py-2 text-xs font-bold ${!isWithdrawal ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`} onClick={() => setIsWithdrawal(false)}>+ Dépôt</button>
                  <button className={`flex-1 py-2 text-xs font-bold ${isWithdrawal ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`} onClick={() => setIsWithdrawal(true)}>− Retrait</button>
                </div>
                <input className="input bg-white" type="number" placeholder="Montant (Rs)" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} autoFocus/>
                <input className="input bg-white" type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)}/>
                <input className="input bg-white" placeholder="📝 Note (optionnel)" value={depositNote} onChange={e => setDepositNote(e.target.value)}/>
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

      {confirmDeleteId && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Supprimer l'objectif ?</h2>
              <button className="btn-icon bg-mist" onClick={() => setConfirmDeleteId(null)}><X size={20}/></button>
            </div>
            <p className="text-sm text-ink-soft">Cette action est irréversible.</p>
            <div className="flex gap-2 mt-3">
              <button className="btn-ghost flex-1" onClick={() => setConfirmDeleteId(null)}>Annuler</button>
              <button className="btn-primary flex-1" style={{ backgroundColor: '#DC2626' }} onClick={() => handleDeleteGoal(confirmDeleteId)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {editingDeposit && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Modifier le mouvement</h2>
              <button className="btn-icon bg-mist" onClick={() => setEditingDeposit(null)}><X size={20}/></button>
            </div>
            <div><label className="label">Montant (Rs)</label><input className="input" type="number" value={editDepAmount} onChange={e => setEditDepAmount(e.target.value)}/></div>
            <div><label className="label">Date</label><input className="input" type="date" value={editDepDate} onChange={e => setEditDepDate(e.target.value)}/></div>
            <div><label className="label">Note (optionnel)</label><input className="input" placeholder="Ex: Virement..." value={editDepNote} onChange={e => setEditDepNote(e.target.value)}/></div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setEditingDeposit(null)}>Annuler</button>
              <button className="btn-primary flex-1" style={{ backgroundColor: '#16A34A' }} onClick={handleEditDeposit}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

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
            <div><label className="label">Date cible (optionnel)</label><input className="input" type="date" value={form.targetDate} onChange={e => setForm(f => ({...f, targetDate: e.target.value}))}/></div>
            <button className="btn-primary w-full py-4" onClick={handleAdd} style={{ backgroundColor: '#16A34A' }}>Créer l'objectif</button>
          </div>
        </div>
      )}
    </div>
  )
}
