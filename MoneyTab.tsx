'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Pencil, History, ChevronDown, Check, ChevronUp, ChevronRight, Minus } from 'lucide-react'
import {
  Transaction, BudgetCategory, SavingsGoal, Debt,
  EXPENSE_CATEGORIES,
  addTransaction, deleteTransaction,
  getBudgets, addBudget, deleteBudget,
  getSavings, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
  getDebts, addDebt, updateDebt, deleteDebt,
  formatAmount, currentYearMonth, hasStarted,
} from '@/lib/storage'
import CoachTip from './CoachTip'
import { supabase } from '@/lib/supabase'
import { MoneySubTab } from '@/app/page'
import { budgetStatus, debtEndLabel } from '@/lib/finance'
import { useSpendingLines } from '@/lib/useSpendingLines'
import {
  currentCycle, sumByCategory, sumCategory, durationLabel, BUDGET_DURATIONS,
  computeBudgetStatuses, earliestCycleStart,
} from '@/lib/budgetPeriods'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './components/money/PeriodFilter'

type SubTab = MoneySubTab

interface Props {
  transactions: Transaction[]
  onUpdate: () => void
  initialSubTab?: SubTab
  onSubTabChange?: (sub: SubTab) => void
}

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

interface Facture {
  id: string
  name: string
  amount: number
  dueDate?: string
  isRecurring: boolean
  category: string
  paid: boolean
  month: string
  note?: string
  createdAt?: string
}

interface FacturePayment {
  id: string
  factureId: string
  amount: number
  paidAt: string
  note?: string
}

interface RevenuSource {
  id: string
  label: string
  amount: number
  type: 'fixed' | 'variable'
  month: string
  date: string
}

const COLORS = ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#10B981','#F97316']
const EMOJIS = ['🏖️','🚗','🏠','💻','📱','✈️','🎓','💍','💰','🎮','👶']
const startLabel = (ymd: string) => new Date(ymd).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

// ─── Catégories unifiées ──────────────────────────────────────────────────────
// Utilisées par transactions, budget, dettes ET factures
const DEFAULT_CATEGORIES = [
  'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
  'Vêtements', 'Éducation', 'Factures', 'Restaurants', 'Épargne', 'Autre'
]

// "transport   SCOLAIRE" -> "Transport scolaire"
function toProper(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ').toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// A→Z (accents gérés), "Autre" toujours en dernier
function getAllCategories(custom: string[]): string[] {
  const merged = [
    ...DEFAULT_CATEGORIES.filter(c => c !== 'Autre'),
    ...custom.filter(c => c !== 'Autre' && !DEFAULT_CATEGORIES.includes(c)),
  ]
  const sorted = Array.from(new Set(merged)).sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' })
  )
  return [...sorted, 'Autre']
}

// Déplace tout ce qui utilise une catégorie supprimée vers "Autre"
async function reassignCategoryToAutre(cat: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const uid = user.id

  // historique de remboursements : pas de user_id, on passe par les dettes concernées
  const { data: affectedDebts, error: affectedError } = await supabase
    .from('debts').select('id').eq('user_id', uid).eq('category', cat)
  if (affectedError) throw affectedError
  const debtIds = (affectedDebts ?? []).map(d => d.id)

  const results = await Promise.all([
    supabase.from('transactions').update({ category: 'Autre' }).eq('user_id', uid).eq('category', cat),
    supabase.from('factures').update({ category: 'Autre' }).eq('user_id', uid).eq('category', cat),
    supabase.from('debts').update({ category: 'Autre' }).eq('user_id', uid).eq('category', cat),
    debtIds.length > 0
      ? supabase.from('debt_payment_history').update({ category: 'Autre' }).in('debt_id', debtIds)
      : Promise.resolve({ error: null }),
  ])
  const failed = results.find(r => r.error)
  if (failed?.error) throw failed.error

  // Plafond du budget : fusionné dans "Autre" s'il existe déjà, sinon renommé
  const { data: bud, error: budError } = await supabase
    .from('budget_categories').select('id, name').eq('user_id', uid).in('name', [cat, 'Autre'])
  if (budError) throw budError
  const old = (bud ?? []).find(b => b.name === cat)
  const hasAutre = (bud ?? []).some(b => b.name === 'Autre')
  if (old) {
    const { error } = hasAutre
      ? await supabase.from('budget_categories').delete().eq('id', old.id)
      : await supabase.from('budget_categories').update({ name: 'Autre' }).eq('id', old.id)
    if (error) throw error
  }
}

// Renomme une catégorie partout (transactions, factures, dettes, historique, budget)
async function renameCategoryEverywhere(oldName: string, newName: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const uid = user.id

  const { data: affectedDebts, error: affectedError } = await supabase
    .from('debts').select('id').eq('user_id', uid).eq('category', oldName)
  if (affectedError) throw affectedError
  const debtIds = (affectedDebts ?? []).map(d => d.id)

  const results = await Promise.all([
    supabase.from('transactions').update({ category: newName }).eq('user_id', uid).eq('category', oldName),
    supabase.from('factures').update({ category: newName }).eq('user_id', uid).eq('category', oldName),
    supabase.from('debts').update({ category: newName }).eq('user_id', uid).eq('category', oldName),
    debtIds.length > 0
      ? supabase.from('debt_payment_history').update({ category: newName }).in('debt_id', debtIds)
      : Promise.resolve({ error: null }),
    supabase.from('budget_categories').update({ name: newName }).eq('user_id', uid).eq('name', oldName),
  ])
  const failed = results.find(r => r.error)
  if (failed?.error) throw failed.error
}

// Hook partagé par Transactions, Budget, Dettes et Factures
function loadLegacyCustomCategories(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('moneyapp_custom_categories') || '[]') }
  catch { return [] }
}

function useCustomCategories(onChanged?: () => void) {
  const [customCategories, setCustomCategories] = useState<string[]>([])

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data, error } = await supabase.from('custom_categories').select('name').eq('user_id', user.id)
        if (error) { console.error(error); return }
        let names = (data ?? []).map(r => r.name)

        const legacy = loadLegacyCustomCategories().filter(
          c => !names.some(n => n.toLowerCase() === c.toLowerCase())
        )
        if (legacy.length > 0) {
          const { error: e2 } = await supabase.from('custom_categories')
            .insert(legacy.map(name => ({ user_id: user.id, name })))
          if (!e2) {
            names = [...names, ...legacy]
            localStorage.removeItem('moneyapp_custom_categories')
          }
        }
        setCustomCategories(names)
      } catch (e) {
        console.error('Chargement des catégories échoué :', e)
      }
    })()
  }, [])

  async function addCustom(cat: string) {
    const proper = toProper(cat)
    if (!proper || customCategories.some(c => c.toLowerCase() === proper.toLowerCase())) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')
      const { error } = await supabase.from('custom_categories').insert({ user_id: user.id, name: proper })
      if (error) throw error
      setCustomCategories(prev => [...prev, proper])
    } catch {
      window.alert("Impossible d'ajouter la catégorie. Réessaie.")
    }
  }

  async function removeCustom(cat: string) {
    await reassignCategoryToAutre(cat)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('custom_categories').delete().eq('user_id', user!.id).eq('name', cat)
    if (error) throw error
    setCustomCategories(prev => prev.filter(c => c !== cat))
    onChanged?.()
  }

  async function renameCustom(oldName: string, newName: string) {
    const proper = toProper(newName)
    if (!proper) throw new Error('Le nom ne peut pas être vide.')
    if (proper === oldName) return
    const exists = [...DEFAULT_CATEGORIES, ...customCategories]
      .some(c => c !== oldName && c.toLowerCase() === proper.toLowerCase())
    if (exists) throw new Error('Cette catégorie existe déjà.')
    await renameCategoryEverywhere(oldName, proper)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('custom_categories').update({ name: proper }).eq('user_id', user!.id).eq('name', oldName)
    if (error) throw error
    setCustomCategories(prev => prev.map(c => (c === oldName ? proper : c)))
    onChanged?.()
  }

  return { customCategories, addCustom, removeCustom, renameCustom }
}

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

// ─── Category Manager ─────────────────────────────────────────────────────────
type CategoryContext = 'transactions' | 'budget' | 'dettes' | 'epargne' | 'factures' | 'revenus'

function CategoryManager({
  value, onChange, customCategories, onAddCustom, onRemoveCustom, onRenameCustom, context = 'transactions'
}: {
  value: string
  onChange: (v: string) => void
  customCategories: string[]
  onAddCustom: (cat: string) => void
  onRemoveCustom: (cat: string) => Promise<void>
  onRenameCustom: (oldName: string, newName: string) => Promise<void>
  context?: CategoryContext
}) {
  const [newCat, setNewCat] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const allCats = getAllCategories(customCategories)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleAdd() {
    const proper = toProper(newCat)
    if (!proper) return
    const existing = allCats.find(c => c.toLowerCase() === proper.toLowerCase())
    if (existing) onChange(existing)
    else { onAddCustom(proper); onChange(proper) }
    setNewCat('')
  }

  async function handleRemove(cat: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return
    if (!window.confirm(`Supprimer « ${cat} » ?\nLes montants de cette catégorie seront déplacés vers « Autre ».`)) return
    setBusy(true)
    try {
      await onRemoveCustom(cat)
      if (value === cat) onChange('Autre')
    } catch {
      window.alert('Impossible de supprimer la catégorie. Réessaie.')
    }
    setBusy(false)
  }

  async function handleRename(oldCat: string) {
    if (busy) return
    setBusy(true)
    try {
      await onRenameCustom(oldCat, editValue)
      if (value === oldCat) onChange(toProper(editValue))
      setEditingCat(null)
    } catch (e) {
      window.alert(e instanceof Error && e.message ? e.message : 'Impossible de modifier la catégorie. Réessaie.')
    }
    setBusy(false)
  }

  const contextMsg: Record<CategoryContext, string> = {
    transactions: '💡 Cette catégorie s\'affiche dans <strong>Dettes</strong>, <strong>Factures</strong> et <strong>Budget</strong>',
    budget:       '💡 Cette catégorie s\'affiche dans <strong>Dettes</strong>, <strong>Factures</strong> et <strong>Transactions</strong>',
    dettes:       '💡 Cette catégorie s\'affiche dans <strong>Budget</strong>, <strong>Factures</strong> et <strong>Transactions</strong>',
    epargne:      '💡 Cette catégorie s\'affiche dans <strong>Budget</strong> et <strong>Transactions</strong>',
    factures:     '💡 Cette catégorie s\'affiche dans <strong>Budget</strong>, <strong>Dettes</strong> et <strong>Transactions</strong>',
    revenus:      '💡 Source de revenu personnalisée',
  }

  return (
    <div ref={ref} className="space-y-2">
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="input flex items-center justify-between text-left w-full">
          <span className={value ? 'text-ink' : 'text-gray-400'}>{value || 'Choisir...'}</span>
          <ChevronDown size={16} className={`text-ink-soft transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}/>
        </button>
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-mist-dark rounded-2xl shadow-xl overflow-hidden">
            <div className="max-h-56 overflow-y-auto">
              {allCats.map(c => {
                const removable = customCategories.includes(c)

                if (editingCat === c) {
                  return (
                    <div key={c} className="flex items-center gap-2 px-3 py-2 bg-accent-light">
                      <input autoFocus className="input flex-1 py-1.5 text-sm" value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(c)
                          if (e.key === 'Escape') setEditingCat(null)
                        }}/>
                      <button type="button" disabled={busy || !editValue.trim()} onClick={() => handleRename(c)}
                        className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center disabled:opacity-40 flex-shrink-0">
                        <Check size={14}/>
                      </button>
                      <button type="button" onClick={() => setEditingCat(null)}
                        className="w-7 h-7 rounded-lg bg-mist text-ink-soft flex items-center justify-center flex-shrink-0">
                        <X size={14}/>
                      </button>
                    </div>
                  )
                }

                return (
                  <div key={c} onClick={() => { onChange(c); setOpen(false) }}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-mist transition-colors ${value === c ? 'bg-accent-light' : ''}`}>
                    <div className="flex items-center gap-2">
                      {value === c && <Check size={14} className="text-accent"/>}
                      <span className="text-sm text-ink">{c}</span>
                    </div>
                    {removable && (
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={busy}
                          onClick={e => { e.stopPropagation(); setEditingCat(c); setEditValue(c) }}
                          className="w-6 h-6 rounded-lg hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center disabled:opacity-40">
                          <Pencil size={12}/>
                        </button>
                        <button type="button" disabled={busy} onClick={e => handleRemove(c, e)}
                          className="w-6 h-6 rounded-lg hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center disabled:opacity-40">
                          <X size={12}/>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input className="input flex-1 py-2 text-sm" placeholder="Nouvelle catégorie..."
          value={newCat} onChange={e => setNewCat(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}/>
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
const SHOW_MORE_LIMIT = 3

function TransactionsSection({ transactions, onUpdate }: { transactions: Transaction[]; onUpdate: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const periodState = usePeriod()
  const { period, range } = periodState
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showMoreCategories, setShowMoreCategories] = useState<Set<string>>(new Set())
  const [budgets, setBudgets] = useState<BudgetCategory[]>([])
  const [form, setForm] = useState({
    amount: '', category: EXPENSE_CATEGORIES[0] as any, note: '',
    date: new Date().toISOString().slice(0, 10),
  })

  // Si les budgets ne chargent pas, on perd seulement les badges « Proche / Dépassé »
  function refreshBudgets() {
    getBudgets().then(setBudgets).catch(e => console.error('Budgets:', e))
  }

  const { customCategories, addCustom, removeCustom, renameCustom } = useCustomCategories(() => {
    onUpdate()
    refreshBudgets()
  })

  useEffect(() => { refreshBudgets() }, [])

  // Statut de chaque plafond sur son cycle courant (même règle que Budget et Accueil)
  const { lines } = useSpendingLines(earliestCycleStart(budgets), transactions)
  const statusByCat = Object.fromEntries(
    computeBudgetStatuses(budgets, lines).map(s => [s.name, s]),
  )

  const periodTxs = transactions.filter(t => {
    if (t.type !== 'expense') return false
    const d = t.date.slice(0, 10)
    return d >= range.from && d <= range.to
  })

  const allFiltered = periodTxs.filter(t => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return t.note?.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
  })

  const periodExpenses = periodTxs.reduce((s, t) => s + t.amount, 0)

  const grouped: Record<string, Transaction[]> = {}
  for (const tx of allFiltered) {
    if (!grouped[tx.category]) grouped[tx.category] = []
    grouped[tx.category].push(tx)
  }

  // Les plafonds sont comparés à leur cycle courant,
  // quelle que soit la période affichée.
  function getBudgetStatus(cat: string): 'over' | 'near' | 'ok' | 'none' {
    return statusByCat[cat]?.status ?? 'none'
  }

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next
    })
  }
  function toggleShowMore(cat: string) {
    setShowMoreCategories(prev => {
      const next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next
    })
  }

  function openAdd() {
    setEditingTx(null)
    setForm({ amount: '', category: EXPENSE_CATEGORIES[0] as any, note: '', date: new Date().toISOString().slice(0, 10) })
    setShowForm(true)
  }
  function openEdit(tx: Transaction) {
    setEditingTx(tx)
    setForm({ amount: String(tx.amount), category: tx.category as any, note: tx.note, date: tx.date })
    setShowForm(true)
  }
  async function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) return
    setLoading(true)
    try {
      if (editingTx) {
        const { error } = await supabase.from('transactions').update({
          type: 'expense', amount: Number(form.amount),
          category: form.category, note: form.note, date: form.date,
        }).eq('id', editingTx.id)
        if (error) throw error
      } else {
        await addTransaction({ type: 'expense', amount: Number(form.amount), category: form.category, note: form.note, date: form.date })
      }
      setShowForm(false); setEditingTx(null); onUpdate()
    } catch {
      window.alert("Impossible d'enregistrer la dépense. Réessaie.")
    }
    setLoading(false)
  }
  async function handleDelete(id: string) {
    try { await deleteTransaction(id); onUpdate() }
    catch { window.alert('Impossible de supprimer la dépense. Réessaie.') }
  }

  const categoryEntries = Object.entries(grouped).sort((a, b) =>
    b[1].reduce((s, t) => s + t.amount, 0) - a[1].reduce((s, t) => s + t.amount, 0)
  )

  return (
    <div className="space-y-3">
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl space-y-2">
        <div className="flex items-start gap-3">
          <span className="text-base">💡</span>
          <p className="text-xs text-blue-700 leading-relaxed">
            <strong>Dépenses ponctuelles seulement.</strong> Pour le reste, va dans l'onglet <strong>Revenus</strong>, <strong>Factures</strong> ou <strong>Dettes</strong>.
          </p>
        </div>
        <p className="text-[11px] text-blue-600 italic leading-snug pl-8">
          💡 Dépense ponctuelle = un achat du moment, pas prévu chaque mois (courses, essence, resto, vêtements).
        </p>
      </div>

      <PeriodFilter {...periodState} activeClass="bg-accent text-white" />

      <div className="card bg-danger-light">
        <p className="text-xs font-bold text-danger uppercase tracking-wide">Total dépenses · {PERIOD_LABEL[period]}</p>
        <p className="text-2xl font-bold font-mono text-danger mt-1">{formatAmount(periodExpenses)}</p>
      </div>

      <div className="relative">
        <input className="input pl-9" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}/>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft text-sm">🔍</span>
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft text-xs font-bold">✕</button>}
      </div>

      <button onClick={openAdd} className="btn-primary w-full gap-2"><Plus size={18}/> Ajouter une dépense</button>

      {allFiltered.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">💸</p>
          <p className="font-semibold text-ink">{search ? 'Aucun résultat' : 'Aucune dépense sur cette période'}</p>
          <p className="text-sm text-ink-soft mt-1">{search ? `Rien pour "${search}"` : 'Appuie sur "Ajouter" pour commencer'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categoryEntries.map(([cat, txs]) => {
            const catTotal = txs.reduce((s, t) => s + t.amount, 0)
            const status = getBudgetStatus(cat)
            const bs = statusByCat[cat]
            const isExpanded = expandedCategories.has(cat)
            const showAll = showMoreCategories.has(cat)
            const visibleTxs = showAll ? txs : txs.slice(0, SHOW_MORE_LIMIT)
            const hasMore = txs.length > SHOW_MORE_LIMIT

            const headerBg =
              status === 'over' ? 'bg-red-50 border-red-200' :
              status === 'near' ? 'bg-orange-50 border-orange-200' :
              'bg-mist border-mist-dark'
            const headerText =
              status === 'over' ? 'text-danger' :
              status === 'near' ? 'text-orange-600' :
              'text-ink'
            const badgeEl = status === 'over'
              ? <span className="text-[10px] bg-danger text-white px-1.5 py-0.5 rounded-full font-bold">⚠️ Dépassé</span>
              : status === 'near'
              ? <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">⚡ Proche</span>
              : null

            return (
              <div key={cat} className={`rounded-2xl border overflow-hidden ${headerBg}`}>
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => toggleCategory(cat)}
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className={`text-sm font-bold ${headerText}`}>{cat}</span>
                    {badgeEl}
                    <span className="text-xs text-ink-soft">{txs.length} dépense{txs.length > 1 ? 's' : ''}</span>
                    {bs && (
                      <span className={`text-[10px] font-mono ${status === 'over' ? 'text-danger' : status === 'near' ? 'text-orange-600' : 'text-ink-soft'}`}>
                        {formatAmount(bs.spent)} / {formatAmount(bs.limit)} ({durationLabel(bs.periodMonths ?? 1)})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`font-mono text-sm font-bold ${headerText}`}>−{formatAmount(catTotal)}</span>
                    <ChevronDown size={16} className={`${headerText} transition-transform ${isExpanded ? 'rotate-180' : ''}`}/>
                  </div>
                </button>

                {bs && (
                  <div className="px-4 pb-2">
                    <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, bs.pct)}%`,
                          backgroundColor: status === 'over' ? '#DC2626' : status === 'near' ? '#D97706' : '#16A34A',
                        }}
                      />
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div className="bg-white border-t border-mist-dark">
                    {visibleTxs.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between px-4 py-3 border-b border-mist last:border-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-danger-light flex items-center justify-center flex-shrink-0">
                            <span className="text-sm">💸</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink truncate">{tx.note || tx.category}</p>
                            <p className="text-xs text-ink-soft">{new Date(tx.date).toLocaleDateString('fr-FR')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="font-mono text-sm font-bold text-danger">−{formatAmount(tx.amount)}</span>
                          <button className="w-8 h-8 rounded-xl bg-mist hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center active:scale-95" onClick={() => openEdit(tx)}><Pencil size={13}/></button>
                          <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center active:scale-95" onClick={() => handleDelete(tx.id)}><Trash2 size={13}/></button>
                        </div>
                      </div>
                    ))}
                    {hasMore && (
                      <button onClick={() => toggleShowMore(cat)}
                        className="w-full py-2.5 text-xs font-bold text-accent bg-accent-light hover:bg-blue-100 transition-colors flex items-center justify-center gap-1">
                        {showAll
                          ? <><ChevronUp size={13}/> Voir moins</>
                          : <><ChevronDown size={13}/> Voir {txs.length - SHOW_MORE_LIMIT} de plus</>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <div className="card bg-mist flex items-center justify-between py-3 px-4">
            <span className="text-xs text-ink-soft font-semibold">{allFiltered.length} dépense{allFiltered.length > 1 ? 's' : ''}</span>
            <span className="font-mono text-sm font-bold text-danger">−{formatAmount(allFiltered.reduce((s, t) => s + t.amount, 0))}</span>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">{editingTx ? 'Modifier la dépense' : 'Nouvelle dépense'}</h2>
              <button className="btn-icon bg-mist" onClick={() => { setShowForm(false); setEditingTx(null) }}><X size={20}/></button>
            </div>
            <div><label className="label">Montant (Rs)</label><input className="input text-xl font-bold" type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}/></div>
            <div>
              <label className="label">Catégorie</label>
              <CategoryManager value={form.category} onChange={v => setForm(f => ({...f, category: v as any}))}
                customCategories={customCategories} onAddCustom={addCustom} onRemoveCustom={removeCustom} onRenameCustom={renameCustom} context="transactions"/>
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

// ─── Sources prédéfinies par catégorie ───────────────────────────────────────
const REVENU_PRESETS = [
  {
    group: '💼 Revenus d\'activité',
    items: ['Salaire', 'Prime / Bonus', 'Freelance / Auto-entrepreneur', 'Heures supplémentaires'],
  },
  {
    group: '📈 Revenus du patrimoine',
    items: ['Retour sur investissement', 'Dividendes', 'Loyer perçu', 'Plus-value'],
  },
  {
    group: '🤝 Revenus sociaux / autres',
    items: ['Allocations familiales', 'Pension / Retraite', 'Remboursement', 'Autre'],
  },
]

interface SavedSource { id: string; name: string; type: 'fixed' | 'variable' }

function RevenusSection() {
  const [revenus, setRevenus] = useState<RevenuSource[]>([])
  const [savedSources, setSavedSources] = useState<SavedSource[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const periodState = usePeriod()
  const { period, range } = periodState
  const [form, setForm] = useState({
    source: '', label: '', amount: '', type: 'fixed' as 'fixed' | 'variable', saveSource: false,
    date: new Date().toISOString().slice(0, 10),
  })
  const sourceRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sourceRef.current && !sourceRef.current.contains(e.target as Node)) setSourceDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    setLoadError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const [incRes, srcRes] = await Promise.all([
        supabase.from('monthly_incomes').select('*').eq('user_id', user!.id),
        supabase.from('income_sources').select('*').eq('user_id', user!.id).order('name'),
      ])
      if (incRes.error) throw incRes.error
      if (srcRes.error) throw srcRes.error
      const incData: RevenuSource[] = (incRes.data ?? []).map(r => ({
        id: r.id, label: r.label, amount: Number(r.amount),
        type: r.is_fixed ? 'fixed' : 'variable', month: r.month,
        date: r.received_at ?? `${r.month}-01`,
      }))
      setRevenus(incData)
      if (incData.length > 0) setOpen(true)
      setSavedSources((srcRes.data ?? []).map(r => ({
        id: r.id, name: r.name, type: r.is_fixed ? 'fixed' : 'variable',
      })))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement')
    }
    setLoading(false)
  }

  function pickSource(name: string, type: 'fixed' | 'variable' = 'fixed') {
  setForm(f => ({
    ...f, source: name, type,
    // pré-remplit le libellé seulement s'il est vide ou s'il n'a pas été modifié à la main
    label: (!f.label.trim() || f.label === f.source) ? name : f.label,
  }))
  setSourceDropdownOpen(false)
}

  function resetForm() {
    setForm({ source: '', label: '', amount: '', type: 'fixed', saveSource: false, date: new Date().toISOString().slice(0, 10) })
    setEditingId(null)
    setShowForm(false)
  }

  function openEdit(r: RevenuSource) {
    setEditingId(r.id)
    setForm({ source: '', label: r.label, amount: String(r.amount), type: r.type, saveSource: false, date: r.date })
    setShowForm(true)
    setOpen(true)
  }

    async function handleAdd() {
    const finalLabel = form.label.trim() || form.source.trim()
    if (!finalLabel || !form.amount || Number(form.amount) <= 0 || !form.date) return
    setSaving(true)

    try {
      // Mode modification
      if (editingId) {
        const { error } = await supabase.from('monthly_incomes').update({
          label: finalLabel,
          amount: Number(form.amount),
          is_fixed: form.type === 'fixed',
          received_at: form.date,
          month: form.date.slice(0, 7),
        }).eq('id', editingId)
        if (error) throw error

        // Si c'est un revenu fixe renommé, on renomme aussi les autres occurrences fixes
        const old = revenus.find(r => r.id === editingId)
        if (old && old.type === 'fixed' && old.label !== finalLabel) {
          const { data: { user } } = await supabase.auth.getUser()
          const { error: renameError } = await supabase.from('monthly_incomes').update({ label: finalLabel })
            .eq('user_id', user!.id).eq('label', old.label).eq('is_fixed', true)
          if (renameError) throw renameError
          setRevenus(prev => prev.map(r => r.type === 'fixed' && r.label === old.label ? { ...r, label: finalLabel } : r))
        }
        setRevenus(prev => prev.map(r => r.id === editingId
          ? { ...r, label: finalLabel, amount: Number(form.amount), type: form.type,
              date: form.date, month: form.date.slice(0, 7) }
          : r))
        resetForm()
        setSaving(false)
        return
      }

      // Mode création
      const { data: { user } } = await supabase.auth.getUser()
      const sourceName = (form.source || form.label).trim()
      if (form.saveSource && sourceName) {
        const alreadySaved = savedSources.some(s => s.name.toLowerCase() === sourceName.toLowerCase())
        if (!alreadySaved) {
          const { data: newSrc, error: srcError } = await supabase.from('income_sources').insert({
            user_id: user!.id, name: sourceName, is_fixed: form.type === 'fixed',
          }).select().single()
          if (srcError) throw srcError
          if (newSrc) setSavedSources(prev => [...prev, { id: newSrc.id, name: newSrc.name, type: newSrc.is_fixed ? 'fixed' : 'variable' }])
        }
      }
      const { data, error } = await supabase.from('monthly_incomes').insert({
        user_id: user!.id, label: finalLabel,
        amount: Number(form.amount), is_fixed: form.type === 'fixed',
        month: form.date.slice(0, 7), received_at: form.date,
      }).select().single()
      if (error) throw error
      if (data) {
        setRevenus(prev => [...prev, {
          id: data.id, label: data.label, amount: Number(data.amount),
          type: data.is_fixed ? 'fixed' : 'variable', month: data.month,
          date: data.received_at ?? form.date,
        }])
      }
      resetForm()
      setOpen(true)
    } catch {
      window.alert(editingId ? "Impossible de modifier le revenu. Réessaie." : "Impossible d'ajouter le revenu. Réessaie.")
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const r = revenus.find(x => x.id === id)
    try {
      if (r?.type === 'fixed') {
        if (!window.confirm(`« ${r.label} » est un revenu fixe.\nLe supprimer l'arrête : il ne sera plus recréé chaque mois (l'historique passe en « Variable »).`)) return
        const { data: { user } } = await supabase.auth.getUser()
        const { error: stopError } = await supabase.from('monthly_incomes').update({ is_fixed: false })
          .eq('user_id', user!.id).eq('label', r.label).eq('is_fixed', true)
        if (stopError) throw stopError
        setRevenus(prev => prev.map(x => x.label === r.label ? { ...x, type: 'variable' } : x))
      }
      const { error } = await supabase.from('monthly_incomes').delete().eq('id', id)
      if (error) throw error
      setRevenus(prev => prev.filter(x => x.id !== id))
    } catch {
      window.alert('Impossible de supprimer le revenu. Réessaie.')
    }
  }

  async function handleDeleteSource(id: string) {
    const { error } = await supabase.from('income_sources').delete().eq('id', id)
    if (error) { window.alert('Impossible de supprimer la source. Réessaie.'); return }
    setSavedSources(prev => prev.filter(s => s.id !== id))
  }

  const filtered = revenus
    .filter(r => r.date >= range.from && r.date <= range.to)
    .sort((a, b) => b.date.localeCompare(a.date))
  const total = filtered.reduce((s, r) => s + r.amount, 0)
  const fixedTotal = filtered.filter(r => r.type === 'fixed').reduce((s, r) => s + r.amount, 0)
  const variableTotal = filtered.filter(r => r.type === 'variable').reduce((s, r) => s + r.amount, 0)

  const customSaved = savedSources.filter(
    s => !REVENU_PRESETS.flatMap(g => g.items).includes(s.name)
  )

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>
  if (loadError) {
    return (
      <div className="card text-center py-8 space-y-3">
        <p className="text-sm text-danger">Impossible de charger tes revenus : {loadError}</p>
        <button className="btn-ghost" onClick={loadAll}>Réessayer</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-2xl">
        <span className="text-base">💡</span>
        <p className="text-xs text-green-700 leading-relaxed">
          <strong>Tes sources de revenus.</strong> Salaire, freelance, loyer perçu, allocations... Ajoute chaque source séparément pour une vision claire.
        </p>
      </div>

      <PeriodFilter {...periodState} activeClass="bg-positive text-white" />

      <button onClick={() => setOpen(o => !o)} className="w-full card bg-positive-light border border-positive/20 text-left">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-positive uppercase tracking-wide">Total revenus · {PERIOD_LABEL[period]}</p>
            <p className="text-3xl font-bold font-mono text-positive mt-1">{formatAmount(total)}</p>
            <p className="text-xs text-positive/70 mt-1">{filtered.length} source{filtered.length > 1 ? 's' : ''} de revenus</p>
          </div>
          <div className={`w-10 h-10 rounded-2xl bg-positive/10 flex items-center justify-center transition-transform ${open ? 'rotate-180' : ''}`}>
            <ChevronDown size={20} className="text-positive"/>
          </div>
        </div>
        {total > 0 && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-positive/20">
            {fixedTotal > 0 && <div><p className="text-[10px] text-positive/60 uppercase font-bold">Fixe</p><p className="text-sm font-mono font-bold text-positive">{formatAmount(fixedTotal)}</p></div>}
            {variableTotal > 0 && <div><p className="text-[10px] text-positive/60 uppercase font-bold">Variable</p><p className="text-sm font-mono font-bold text-positive">{formatAmount(variableTotal)}</p></div>}
          </div>
        )}
      </button>

      {open && (
        <div className="card space-y-2 border-2 border-positive/20">
          {filtered.length === 0 ? (
            <p className="text-sm text-ink-soft text-center py-4">Aucun revenu sur cette période</p>
          ) : filtered.map(r => (
            <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-mist last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-positive-light flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">💰</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{r.label}</p>
                  <p className="text-xs text-ink-soft">{new Date(r.date).toLocaleDateString('fr-FR')}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.type === 'fixed' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                    {r.type === 'fixed' ? 'Fixe' : 'Variable'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-positive">+{formatAmount(r.amount)}</span>
                <button onClick={() => openEdit(r)} className="w-7 h-7 rounded-lg bg-mist hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center"><Pencil size={12}/></button>
                <button onClick={() => handleDelete(r.id)} className="w-7 h-7 rounded-lg bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}

          {showForm ? (
            <div className="space-y-2 pt-2 border-t border-mist">
              <div ref={sourceRef} className="relative">
                <label className="label">Source de revenu</label>
                <button type="button" onClick={() => setSourceDropdownOpen(o => !o)} className="input flex items-center justify-between text-left w-full">
                  <span className={form.source ? 'text-ink' : 'text-gray-400'}>{form.source || 'Choisir une source...'}</span>
                  <ChevronDown size={16} className={`text-ink-soft transition-transform flex-shrink-0 ${sourceDropdownOpen ? 'rotate-180' : ''}`}/>
                </button>
                {sourceDropdownOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-mist-dark rounded-2xl shadow-xl overflow-hidden">
                    <div className="max-h-72 overflow-y-auto">
                      {customSaved.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider px-3 pt-3 pb-1">⭐ Mes sources</p>
                          {customSaved.map(s => (
                            <div key={s.id} onClick={() => pickSource(s.name, s.type)} className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-mist transition-colors">
                              <div className="flex items-center gap-2">
                                {form.source === s.name && <Check size={12} className="text-positive"/>}
                                <span className="text-sm text-ink">{s.name}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${s.type === 'fixed' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                  {s.type === 'fixed' ? 'Fixe' : 'Variable'}
                                </span>
                              </div>
                              <button onClick={e => { e.stopPropagation(); handleDeleteSource(s.id) }} className="w-5 h-5 rounded-md hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center flex-shrink-0"><X size={10}/></button>
                            </div>
                          ))}
                          <div className="h-px bg-mist-dark mx-3 my-1"/>
                        </div>
                      )}
                      {REVENU_PRESETS.map(group => (
                        <div key={group.group}>
                          <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider px-3 pt-2.5 pb-1">{group.group}</p>
                          {group.items.map(item => (
                            <div key={item} onClick={() => pickSource(item)} className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-mist transition-colors ${form.source === item ? 'bg-green-50' : ''}`}>
                              {form.source === item && <Check size={12} className="text-positive flex-shrink-0"/>}
                              <span className="text-sm text-ink">{item}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>                   
                  </div>
                )}
              </div>

              <div>
                <label className="label">Libellé <span className="text-ink-soft font-normal">(libre)</span></label>
                <input className="input" placeholder="Ex: Salaire janvier, Prime de Noël..." value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}/>
              </div>
              <div>
                <label className="label">Montant (Rs)</label>
                <input className="input" type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}/>
              </div>
              <div>
                <label className="label">Date de réception</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}/>
              </div>
              <div className="flex rounded-xl overflow-hidden border-2 border-mist-dark">
                <button className={`flex-1 py-2 text-xs font-bold ${form.type === 'fixed' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`} onClick={() => setForm(f => ({ ...f, type: 'fixed' }))}>📅 Fixe</button>
                <button className={`flex-1 py-2 text-xs font-bold ${form.type === 'variable' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`} onClick={() => setForm(f => ({ ...f, type: 'variable' }))}>📈 Variable</button>
              </div>
              <div onClick={() => setForm(f => ({ ...f, saveSource: !f.saveSource }))} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${form.saveSource ? 'bg-green-50 border-green-200' : 'bg-mist border-mist-dark'}`}>
                <div>
                  <p className="text-xs font-bold text-ink">⭐ Enregistrer cette source</p>
                  <p className="text-[10px] text-ink-soft mt-0.5">Disponible dans le menu la prochaine fois</p>
                </div>
                <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.saveSource ? 'bg-positive' : 'bg-mist-dark'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.saveSource ? 'left-5' : 'left-0.5'}`}/>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={resetForm}>Annuler</button>
                <button className="btn-primary flex-1" style={{ backgroundColor: '#16A34A' }} onClick={handleAdd} disabled={saving}>
                  {saving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="w-full py-3 text-sm font-bold text-positive bg-positive-light hover:bg-green-100 rounded-2xl transition-colors flex items-center justify-center gap-2">
              <Plus size={16}/> Ajouter une source
            </button>
          )}
        </div>
      )}

      {!open && (
        <button onClick={() => { setOpen(true); setTimeout(() => setShowForm(true), 50) }} className="btn-primary w-full gap-2" style={{ backgroundColor: '#16A34A' }}>
          <Plus size={18}/> Ajouter un revenu
        </button>
      )}
    </div>
  )
}

// ─── Facture helpers ──────────────────────────────────────────────────────────
async function fetchFacturePayments(factureId: string): Promise<FacturePayment[]> {
  const { data, error } = await supabase.from('facture_payment_history').select('*').eq('facture_id', factureId).order('paid_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({ id: r.id, factureId: r.facture_id, amount: Number(r.amount), paidAt: r.paid_at, note: r.note ?? undefined }))
}
async function addFacturePayment(factureId: string, amount: number, paidAt: string, note?: string): Promise<void> {
  const { error } = await supabase.from('facture_payment_history').insert({ facture_id: factureId, amount, paid_at: paidAt, note: note || null })
  if (error) throw error
}
async function updateFacturePayment(id: string, amount: number, paidAt: string, note?: string): Promise<void> {
  const { error } = await supabase.from('facture_payment_history').update({ amount, paid_at: paidAt, note: note || null }).eq('id', id)
  if (error) throw error
}
async function deleteFacturePayment(id: string): Promise<void> {
  const { error } = await supabase.from('facture_payment_history').delete().eq('id', id)
  if (error) throw error
}

// ─── FacturesSection ──────────────────────────────────────────────────────────
// Date de référence d'une facture pour le filtre de période :
// date de création, sinon échéance, sinon 1er du mois de la facture.
function factureRefDate(f: Facture): string {
  return (f.createdAt ?? f.dueDate ?? `${f.month}-01`).slice(0, 10)
}

// Non payées en haut, puis ordre alphabétique (accents gérés)
function sortFactures(list: Facture[]): Facture[] {
  return [...list].sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  })
}

function FacturesSection() {
  const [factures, setFactures] = useState<Facture[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingFacture, setEditingFacture] = useState<Facture | null>(null)
  const [saving, setSaving] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNote, setPayNote] = useState('')
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null)
  const [paymentsMap, setPaymentsMap] = useState<Record<string, FacturePayment[]>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editingPayment, setEditingPayment] = useState<FacturePayment | null>(null)
  const [editPayAmount, setEditPayAmount] = useState('')
  const [editPayDate, setEditPayDate] = useState('')
  const [editPayNote, setEditPayNote] = useState('')

  // Filtre de période
  const periodState = usePeriod()
  const { period, range } = periodState

  // ← Catégories partagées (Supabase, table custom_categories)
  const { customCategories, addCustom, removeCustom, renameCustom } = useCustomCategories(() => { loadFactures() })

  const [form, setForm] = useState({
    name: '', amount: '', category: DEFAULT_CATEGORIES[0],
    dueDate: '', dueDayOfMonth: '', isRecurring: false, note: '',
  })
  const ym = currentYearMonth()

  useEffect(() => { loadFactures() }, [])

  async function loadFactures() {
    setLoading(true)
    setLoadError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // Toutes les factures de l'utilisateur : le filtre de période se fait côté client
      const { data, error } = await supabase.from('factures').select('*').eq('user_id', user!.id).order('created_at', { ascending: true })
      if (error) throw error
      setFactures((data ?? []).map(r => ({
        id: r.id, name: r.name, amount: Number(r.amount),
        dueDate: r.due_date ?? undefined, isRecurring: r.is_recurring ?? false,
        category: r.category ?? DEFAULT_CATEGORIES[0], paid: r.paid ?? false,
        month: r.month, note: r.note ?? undefined,
        createdAt: r.created_at ?? undefined,
      })))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement')
    }
    setLoading(false)
  }

  function resetForm() {
    setForm({ name: '', amount: '', category: DEFAULT_CATEGORIES[0], dueDate: '', dueDayOfMonth: '', isRecurring: false, note: '' })
    setEditingFacture(null)
  }

  function openEdit(f: Facture) {
    setEditingFacture(f)
    const dayOfMonth = f.dueDate ? new Date(f.dueDate).getDate().toString() : ''
    setForm({
      name: f.name, amount: String(f.amount), category: f.category,
      dueDate: f.dueDate ?? '', dueDayOfMonth: f.isRecurring ? dayOfMonth : '',
      isRecurring: f.isRecurring, note: f.note ?? '',
    })
    setShowForm(true)
  }

  function computeDueDate(dayOfMonth: string, month: string): string | null {
    if (!dayOfMonth) return null
    const day = parseInt(dayOfMonth)
    if (isNaN(day) || day < 1 || day > 31) return null
    const [year, m] = month.split('-').map(Number)
    const lastDay = new Date(year, m, 0).getDate()
    const clampedDay = Math.min(day, lastDay)
    return `${month}-${String(clampedDay).padStart(2, '0')}`
  }

  async function handleSave() {
    if (!form.name.trim() || !form.amount || Number(form.amount) <= 0) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const dueDate = form.isRecurring ? computeDueDate(form.dueDayOfMonth, ym) : (form.dueDate || null)

      if (editingFacture) {
        const editing = editingFacture
        const newName = form.name.trim()

        const { error } = await supabase.from('factures').update({
          name: newName, amount: Number(form.amount), category: form.category,
          due_date: dueDate, is_recurring: form.isRecurring, note: form.note || null,
        }).eq('id', editing.id)
        if (error) throw error

        // Facture récurrente renommée : on renomme aussi les autres occurrences récurrentes
        if (editing.isRecurring && editing.name !== newName) {
          const { error: renameError } = await supabase.from('factures').update({ name: newName })
            .eq('user_id', user!.id).eq('name', editing.name).eq('is_recurring', true)
          if (renameError) throw renameError
          setFactures(prev => prev.map(x =>
            x.isRecurring && x.name === editing.name ? { ...x, name: newName } : x
          ))
        }

        setFactures(prev => prev.map(f => f.id === editing.id ? {
          ...f, name: newName, amount: Number(form.amount), category: form.category,
          dueDate: dueDate ?? undefined, isRecurring: form.isRecurring, note: form.note || undefined,
        } : f))
      } else {
        const { data, error } = await supabase.from('factures').insert({
          user_id: user!.id, name: form.name.trim(), amount: Number(form.amount),
          category: form.category, due_date: dueDate, is_recurring: form.isRecurring,
          note: form.note || null, paid: false, month: ym,
        }).select().single()
        if (error) throw error
        if (data) {
          setFactures(prev => [...prev, {
            id: data.id, name: data.name, amount: Number(data.amount),
            dueDate: data.due_date ?? undefined, isRecurring: data.is_recurring,
            category: data.category, paid: data.paid, month: data.month, note: data.note ?? undefined,
            createdAt: data.created_at ?? new Date().toISOString(),
          }])
        }
      }
      resetForm(); setShowForm(false)
    } catch {
      window.alert(editingFacture ? 'Impossible de modifier la facture. Réessaie.' : "Impossible d'ajouter la facture. Réessaie.")
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const f = factures.find(x => x.id === id)
    try {
      if (f?.isRecurring) {
        if (!window.confirm(`« ${f.name} » est récurrente.\nLa supprimer l'arrête : elle ne sera plus recréée chaque mois.`)) return
        const { data: { user } } = await supabase.auth.getUser()
        const { error: stopError } = await supabase.from('factures').update({ is_recurring: false })
          .eq('user_id', user!.id).eq('name', f.name).eq('is_recurring', true)
        if (stopError) throw stopError
        setFactures(prev => prev.map(x => x.name === f.name ? { ...x, isRecurring: false } : x))
      }
      const { error } = await supabase.from('factures').delete().eq('id', id)
      if (error) throw error
      setFactures(prev => prev.filter(x => x.id !== id))
    } catch {
      window.alert('Impossible de supprimer la facture. Réessaie.')
    }
  }

  async function toggleHistory(factureId: string) {
    if (openHistoryId === factureId) { setOpenHistoryId(null); return }
    setOpenHistoryId(factureId)
    if (!paymentsMap[factureId]) {
      setHistoryLoading(true)
      try {
        const p = await fetchFacturePayments(factureId)
        setPaymentsMap(prev => ({ ...prev, [factureId]: p }))
      } catch {
        window.alert("Impossible de charger l'historique. Réessaie.")
        setOpenHistoryId(null)
      }
      setHistoryLoading(false)
    }
  }

  // Recharge l'historique d'une facture et recalcule son statut "payée" depuis la base
  async function syncPaidStatus(factureId: string) {
    const payments = await fetchFacturePayments(factureId)
    setPaymentsMap(prev => ({ ...prev, [factureId]: payments }))
    const facture = factures.find(f => f.id === factureId)
    if (!facture) return
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
    const nowPaid = totalPaid >= facture.amount
    if (nowPaid !== facture.paid) {
      const { error } = await supabase.from('factures').update({ paid: nowPaid }).eq('id', factureId)
      if (error) throw error
      setFactures(prev => prev.map(f => f.id === factureId ? { ...f, paid: nowPaid } : f))
    }
  }

  async function handlePay(factureId: string) {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) return
    try {
      await addFacturePayment(factureId, amt, payDate, payNote)
      await syncPaidStatus(factureId)
      setPayingId(null); setPayAmount(''); setPayDate(new Date().toISOString().slice(0, 10)); setPayNote('')
    } catch {
      window.alert("Impossible d'enregistrer le paiement. Réessaie.")
    }
  }

  async function handleEditPayment() {
    if (!editingPayment) return
    const newAmt = Number(editPayAmount)
    if (!newAmt || newAmt <= 0) return
    try {
      await updateFacturePayment(editingPayment.id, newAmt, editPayDate, editPayNote)
      await syncPaidStatus(editingPayment.factureId)
      setEditingPayment(null)
    } catch {
      window.alert('Impossible de modifier le paiement. Réessaie.')
    }
  }

  async function handleDeletePayment(p: FacturePayment) {
    try {
      await deleteFacturePayment(p.id)
      await syncPaidStatus(p.factureId)
    } catch {
      window.alert('Impossible de supprimer le paiement. Réessaie.')
    }
  }

  // ── Filtre de période + tri (non payées en haut, puis A→Z) ──
  const visible = factures.filter(f => {
    const d = factureRefDate(f)
    return d >= range.from && d <= range.to
  })

  const paidCount = visible.filter(f => f.paid).length
  const totalAmount = visible.reduce((s, f) => s + f.amount, 0)
  const paidAmount = visible.filter(f => f.paid).reduce((s, f) => s + f.amount, 0)
  const unpaidAmount = totalAmount - paidAmount
  const recurringFactures = sortFactures(visible.filter(f => f.isRecurring))
  const ponctuellesFactures = sortFactures(visible.filter(f => !f.isRecurring))

  const tip = visible.length === 0
    ? `Ajoute tes factures (eau, élec, internet...) pour ne rien oublier.`
    : paidCount === visible.length
    ? `✅ Toutes tes factures sont payées sur ${PERIOD_LABEL[period]} ! Bien joué.`
    : `⏳ ${visible.length - paidCount} facture${visible.length - paidCount > 1 ? 's' : ''} en attente · ${formatAmount(unpaidAmount)} à payer`

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>
  if (loadError) {
    return (
      <div className="card text-center py-8 space-y-3">
        <p className="text-sm text-danger">Impossible de charger tes factures : {loadError}</p>
        <button className="btn-ghost" onClick={loadFactures}>Réessayer</button>
      </div>
    )
  }

  function renderCard(f: Facture) {
    return (
      <FactureCard key={f.id} facture={f} onEdit={openEdit} onDelete={handleDelete}
        payments={paymentsMap[f.id] ?? []} showHistory={openHistoryId === f.id}
        historyLoading={historyLoading && openHistoryId === f.id && !paymentsMap[f.id]}
        onToggleHistory={() => toggleHistory(f.id)} payingId={payingId}
        payAmount={payAmount} payDate={payDate} payNote={payNote}
        onSetPayingId={(id) => { setPayingId(id); setPayAmount(''); setPayDate(new Date().toISOString().slice(0, 10)); setPayNote('') }}
        onPayAmountChange={setPayAmount} onPayDateChange={setPayDate} onPayNoteChange={setPayNote}
        onPay={() => handlePay(f.id)}
        onEditPayment={(p) => { setEditingPayment(p); setEditPayAmount(String(p.amount)); setEditPayDate(p.paidAt); setEditPayNote(p.note || '') }}
        onDeletePayment={handleDeletePayment}/>
    )
  }

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />
      <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-2xl">
        <span className="text-base">💡</span>
        <p className="text-xs text-yellow-800 leading-relaxed">
          <strong>Factures ≠ Dettes.</strong> Une facture (eau, élec, internet...) se paie <strong>en une fois chaque mois</strong>. Une dette (crédit, prêt) se rembourse <strong>progressivement sur des mois/années</strong>. Les montants payés remontent automatiquement dans le <strong>Budget</strong>.
        </p>
      </div>

      <PeriodFilter {...periodState} activeClass="bg-yellow-500 text-white" />

      {visible.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center py-3">
            <p className="text-lg font-bold font-mono text-ink">{formatAmount(totalAmount)}</p>
            <p className="text-[10px] text-ink-soft uppercase font-bold mt-0.5">Total</p>
          </div>
          <div className="card text-center py-3 bg-positive-light">
            <p className="text-lg font-bold font-mono text-positive">{formatAmount(paidAmount)}</p>
            <p className="text-[10px] text-positive uppercase font-bold mt-0.5">Payé</p>
          </div>
          <div className="card text-center py-3 bg-danger-light">
            <p className="text-lg font-bold font-mono text-danger">{formatAmount(unpaidAmount)}</p>
            <p className="text-[10px] text-danger uppercase font-bold mt-0.5">Restant</p>
          </div>
        </div>
      )}

      {visible.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-ink-soft">
            <span>{paidCount}/{visible.length} payées</span>
            <span>{Math.round((paidCount / visible.length) * 100)}%</span>
          </div>
          <div className="w-full h-2.5 bg-mist-dark rounded-full overflow-hidden">
            <div className="h-full bg-positive rounded-full transition-all duration-500" style={{ width: `${(paidCount / visible.length) * 100}%` }}/>
          </div>
        </div>
      )}

      <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary w-full gap-2" style={{ backgroundColor: '#CA8A04' }}>
        <Plus size={18}/> Ajouter une facture
      </button>

      {visible.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🧾</p>
          <p className="font-semibold text-ink">Aucune facture sur cette période</p>
          <p className="text-sm text-ink-soft mt-1">Eau, électricité, internet, loyer...</p>
        </div>
      ) : (
        <>
          {recurringFactures.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">🔄 Récurrentes</p>
              {recurringFactures.map(renderCard)}
            </div>
          )}
          {ponctuellesFactures.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">📄 Ponctuelles</p>
              {ponctuellesFactures.map(renderCard)}
            </div>
          )}
        </>
      )}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">{editingFacture ? 'Modifier la facture' : 'Nouvelle facture'}</h2>
              <button className="btn-icon bg-mist" onClick={() => { setShowForm(false); resetForm() }}><X size={20}/></button>
            </div>
            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-2xl border border-yellow-200">
              <div>
                <p className="text-sm font-bold text-yellow-800">🔄 Facture récurrente</p>
                <p className="text-xs text-yellow-600 mt-0.5">Revient chaque mois (eau, élec, abonnement...)</p>
              </div>
              <button onClick={() => setForm(f => ({ ...f, isRecurring: !f.isRecurring }))}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${form.isRecurring ? 'bg-yellow-500' : 'bg-mist-dark'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.isRecurring ? 'left-7' : 'left-1'}`}/>
              </button>
            </div>
            <div>
              <label className="label">Nom de la facture</label>
              <input className="input" placeholder="Ex: Facture CEB, Abonnement Netflix..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}/>
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input" type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}/>
            </div>
            <div>
              <label className="label">Catégorie</label>
              <CategoryManager
                value={form.category}
                onChange={v => setForm(f => ({ ...f, category: v }))}
                customCategories={customCategories}
                onAddCustom={addCustom}
                onRemoveCustom={removeCustom} onRenameCustom={renameCustom}
                context="factures"
              />
            </div>
            {form.isRecurring ? (
              <div>
                <label className="label">Jour d'échéance du mois</label>
                <input className="input" type="number" min="1" max="31" placeholder="Ex: 15 (= le 15 de chaque mois)" value={form.dueDayOfMonth} onChange={e => setForm(f => ({ ...f, dueDayOfMonth: e.target.value }))}/>
              </div>
            ) : (
              <div>
                <label className="label">Date d'échéance (optionnel)</label>
                <input className="input" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}/>
              </div>
            )}
            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: Facture reçue le 5..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}/>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleSave} style={{ backgroundColor: '#CA8A04' }} disabled={saving}>
              {saving ? 'Enregistrement...' : editingFacture ? 'Enregistrer les modifications' : 'Ajouter la facture'}
            </button>
          </div>
        </div>
      )}

      {editingPayment && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Modifier le paiement</h2>
              <button className="btn-icon bg-mist" onClick={() => setEditingPayment(null)}><X size={20}/></button>
            </div>
            <div><label className="label">Montant (Rs)</label><input className="input" type="number" value={editPayAmount} onChange={e => setEditPayAmount(e.target.value)}/></div>
            <div><label className="label">Date</label><input className="input" type="date" value={editPayDate} onChange={e => setEditPayDate(e.target.value)}/></div>
            <div><label className="label">Note (optionnel)</label><input className="input" placeholder="Ex: Virement..." value={editPayNote} onChange={e => setEditPayNote(e.target.value)}/></div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setEditingPayment(null)}>Annuler</button>
              <button className="btn-primary flex-1" style={{ backgroundColor: '#CA8A04' }} onClick={handleEditPayment}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FactureCard({
  facture: f, onEdit, onDelete, payments, showHistory, historyLoading,
  onToggleHistory, payingId, payAmount, payDate, payNote,
  onSetPayingId, onPayAmountChange, onPayDateChange, onPayNoteChange,
  onPay, onEditPayment, onDeletePayment,
}: {
  facture: Facture; onEdit: (f: Facture) => void; onDelete: (id: string) => void
  payments: FacturePayment[]; showHistory: boolean; historyLoading: boolean
  onToggleHistory: () => void; payingId: string | null
  payAmount: string; payDate: string; payNote: string
  onSetPayingId: (id: string) => void; onPayAmountChange: (v: string) => void
  onPayDateChange: (v: string) => void; onPayNoteChange: (v: string) => void
  onPay: () => void; onEditPayment: (p: FacturePayment) => void
  onDeletePayment: (p: FacturePayment) => void
}) {
  const isDue = f.dueDate ? new Date(f.dueDate) < new Date() && !f.paid : false
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, f.amount - totalPaid)
  const isPaying = payingId === f.id

  return (
    <div className={`card space-y-3 transition-all ${f.paid ? 'opacity-70' : ''} ${isDue ? 'border-l-4 border-l-danger' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {f.isRecurring && <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded-full font-medium">🔄 Récurrente</span>}
            <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded-full font-medium">{f.category}</span>
            {isDue && !f.paid && <span className="text-[10px] bg-danger text-white px-1.5 py-0.5 rounded-full font-bold">En retard</span>}
            {f.paid && <span className="text-[10px] bg-positive-light text-positive px-1.5 py-0.5 rounded-full font-bold">✓ Payée</span>}
          </div>
          <p className={`text-sm font-semibold ${f.paid ? 'line-through text-ink-soft' : 'text-ink'}`}>{f.name}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {f.dueDate && <span className="text-xs text-ink-soft">📅 {new Date(f.dueDate).toLocaleDateString('fr-FR')}</span>}
            {f.note && <span className="text-xs text-ink-soft italic">{f.note}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <p className="font-mono font-bold text-base text-ink">{formatAmount(f.amount)}</p>
          {totalPaid > 0 && !f.paid && <p className="text-xs font-mono text-positive">+{formatAmount(totalPaid)} payé</p>}
          <div className="flex gap-1 mt-0.5">
            <button className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${showHistory ? 'bg-yellow-500 text-white' : 'bg-mist hover:bg-yellow-50 text-ink-soft hover:text-yellow-600'}`} onClick={onToggleHistory}><History size={14}/></button>
            <button className="w-8 h-8 rounded-xl bg-mist hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center" onClick={() => onEdit(f)}><Pencil size={14}/></button>
            <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center" onClick={() => onDelete(f.id)}><Trash2 size={14}/></button>
          </div>
        </div>
      </div>

      {totalPaid > 0 && (
        <div className="space-y-1">
          <div className="w-full h-2 bg-mist-dark rounded-full overflow-hidden">
            <div className="h-full bg-positive rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (totalPaid / f.amount) * 100)}%` }}/>
          </div>
          <div className="flex justify-between text-xs text-ink-soft">
            <span className="font-mono">{formatAmount(totalPaid)} payés</span>
            <span className="font-mono">{remaining > 0 ? `${formatAmount(remaining)} restant` : '✅ Soldée'}</span>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="bg-mist rounded-2xl overflow-hidden">
          <div className="px-3 py-2.5 border-b border-mist-dark flex items-center justify-between">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Historique</p>
            {payments.length > 0 && <span className="text-xs font-mono font-bold text-positive">Total : {formatAmount(payments.reduce((s, p) => s + p.amount, 0))}</span>}
          </div>
          {historyLoading ? (
            <p className="text-xs text-ink-soft text-center py-4">Chargement...</p>
          ) : payments.length === 0 ? (
            <p className="text-xs text-ink-soft text-center italic py-4">Aucun paiement enregistré</p>
          ) : payments.map(p => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2.5 border-b border-mist-dark last:border-0 hover:bg-white transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono font-bold text-positive">+{formatAmount(p.amount)}</p>
                <p className="text-xs text-ink-soft">{new Date(p.paidAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                {p.note && <p className="text-xs text-ink-soft italic truncate">{p.note}</p>}
              </div>
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <button onClick={() => onEditPayment(p)} className="w-7 h-7 rounded-lg bg-white hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center"><Pencil size={12}/></button>
                <button onClick={() => onDeletePayment(p)} className="w-7 h-7 rounded-lg bg-white hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isPaying ? (
        <div className="space-y-2 p-3 bg-yellow-50 rounded-2xl border border-yellow-200">
          <p className="text-xs font-bold text-yellow-800 uppercase tracking-wide">Enregistrer un paiement</p>
          {remaining < f.amount && <p className="text-xs text-yellow-700">Restant à payer : <strong>{formatAmount(remaining)}</strong></p>}
          <input className="input bg-white" type="number" placeholder="Montant (Rs)" value={payAmount} onChange={e => onPayAmountChange(e.target.value)} autoFocus/>
          <input className="input bg-white" type="date" value={payDate} onChange={e => onPayDateChange(e.target.value)}/>
          <input className="input bg-white" placeholder="📝 Note (optionnel)" value={payNote} onChange={e => onPayNoteChange(e.target.value)}/>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 bg-white" onClick={() => onSetPayingId('')}>Annuler</button>
            <button className="btn-primary flex-1" style={{ backgroundColor: '#CA8A04' }} onClick={onPay}>Enregistrer</button>
          </div>
        </div>
      ) : (
        !f.paid && (
          <button className="w-full py-2.5 text-sm font-bold text-yellow-800 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2" onClick={() => onSetPayingId(f.id)}>
            <Plus size={15}/> Enregistrer un paiement
          </button>
        )
      )}
    </div>
  )
}

// ─── Budget ───────────────────────────────────────────────────────────────────
async function updateBudget(id: string, fields: { name?: string; limit?: number; color?: string; periodMonths?: number }): Promise<void> {
  const { periodMonths, ...rest } = fields
  const { error } = await supabase.from('budget_categories')
    .update({ ...rest, ...(periodMonths !== undefined ? { period_months: periodMonths } : {}) })
    .eq('id', id)
  if (error) throw error
}

const fmtDay = (ymd: string) => new Date(ymd).toLocaleDateString('fr-FR')

function BudgetSection({ transactions }: { transactions: Transaction[] }) {
  const [budgets, setBudgets] = useState<BudgetCategory[] | null>(null)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingBudget, setEditingBudget] = useState<BudgetCategory | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', limit: '', color: COLORS[0], periodMonths: 1 })

  // Filtre de période
  const periodState = usePeriod()
  const { period, range } = periodState

  async function loadBudgets() {
    try { setBudgets(await getBudgets()); setBudgetError(null) }
    catch (e) { setBudgetError(e instanceof Error ? e.message : 'Erreur de chargement') }
  }
  useEffect(() => { loadBudgets() }, [])

  // Cycle courant de chaque plafond + plage de données à charger
  const rows = (budgets ?? []).map(b => ({ b, cycle: currentCycle(b.createdAt, b.periodMonths ?? 1) }))
  const minFrom = range.from < '2000-01-01' ? '2000-01-01' : range.from
  const fetchFrom = budgets ? rows.reduce((m, r) => (r.cycle.from < m ? r.cycle.from : m), minFrom) : null
  const { lines, loaded, error, reload } = useSpendingLines(fetchFrom, transactions)

  const { customCategories, addCustom, removeCustom, renameCustom } = useCustomCategories(() => { loadBudgets(); reload() })

  const periodByCat = sumByCategory(lines, range.from, range.to)
  const periodTotal = Object.values(periodByCat).reduce((s, v) => s + v, 0)

  const items = rows.map(({ b, cycle }) => {
    const spent = sumCategory(lines, b.name, cycle.from, cycle.to)
    const { pct, status } = budgetStatus(spent, b.limit)
    return { b, cycle, spent, pct, status, periodSpent: periodByCat[b.name] || 0 }
  })
  const overBudget = items.filter(i => i.status === 'over')

  const tip = overBudget.length > 0
    ? `⚠️ Tu dépasses le plafond en : ${overBudget.map(i => i.b.name).join(', ')}. Réduis ces dépenses !`
    : items.length > 0 ? `✅ Tous tes budgets sont respectés. Continue !`
    : `Crée un plafond par catégorie pour mieux contrôler où va ton argent.`

  function openAdd() {
    setEditingBudget(null); setFormError(null)
    setForm({ name: '', limit: '', color: COLORS[0], periodMonths: 1 }); setShowForm(true)
  }
  function openEdit(b: BudgetCategory) {
    setEditingBudget(b); setFormError(null)
    setForm({ name: b.name, limit: String(b.limit), color: b.color, periodMonths: b.periodMonths ?? 1 }); setShowForm(true)
  }
  function closeForm() {
    setShowForm(false); setEditingBudget(null); setFormError(null)
  }

  async function handleSave() {
    if (saving || !form.name || !form.limit || Number(form.limit) <= 0) return
    const isDuplicate = (budgets ?? []).some(b => b.name === form.name && (!editingBudget || b.id !== editingBudget.id))
    if (isDuplicate) { setFormError('Un plafond existe déjà pour cette catégorie.'); return }

    setSaving(true); setFormError(null)
    try {
      const payload = { name: form.name, limit: Number(form.limit), color: form.color, periodMonths: form.periodMonths }
      if (editingBudget) await updateBudget(editingBudget.id, payload)
      else await addBudget(payload)
      await loadBudgets()
      closeForm()
    } catch {
      setFormError("Impossible d'enregistrer le plafond. Réessaie.")
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    try { await deleteBudget(id) }
    catch { window.alert('Impossible de supprimer le plafond. Réessaie.') }
    finally { await loadBudgets() }
  }

  if (!budgets) {
    if (budgetError) {
      return (
        <div className="card text-center py-8 space-y-3">
          <p className="text-sm text-danger">Impossible de charger ton budget : {budgetError}</p>
          <button className="btn-ghost" onClick={loadBudgets}>Réessayer</button>
        </div>
      )
    }
    return <div className="card text-center py-8 text-ink-soft">Chargement...</div>
  }
  if (!loaded && !error) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>

  return (
    <div className="space-y-3">
      {error && (
        <div className="card bg-red-50 border border-red-100 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700">Impossible d'actualiser tes chiffres : {error}</p>
          <button onClick={reload} className="text-xs font-semibold text-red-700 underline flex-shrink-0">Réessayer</button>
        </div>
      )}
      <CoachTip message={tip} />
      <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-2xl">
        <span className="text-lg">💡</span>
        <div className="text-xs text-orange-700 leading-relaxed space-y-1.5">
          <p>
            <strong>Un plafond = ta limite de dépenses pour une catégorie</strong>, sur la durée que tu choisis (1 mois à 3 ans). Il démarre le jour où tu le crées, puis repart à zéro à la fin de chaque durée.
          </p>
          <p>
            <strong>Les boutons 1J, 5J, 1 mois…</strong> servent uniquement à consulter tes dépenses sur une période. Ils ne changent pas tes plafonds.
          </p>
          <p>Sont comptés : tes dépenses, les factures payées et les remboursements de dettes.</p>
        </div>
      </div>

      {/* Filtre de période */}
      <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Voir mes dépenses sur</p>
      <PeriodFilter {...periodState} activeClass="bg-orange-500 text-white" />

      <div className="card bg-orange-50 border border-orange-200">
        <p className="text-xs font-bold text-orange-700 uppercase tracking-wide">Total dépenses · {PERIOD_LABEL[period]}</p>
        <p className="text-2xl font-bold font-mono text-orange-700 mt-1">{formatAmount(periodTotal)}</p>
      </div>

      <button onClick={openAdd} className="btn-primary w-full gap-2" style={{ backgroundColor: '#F97316' }}><Plus size={18}/> Nouveau plafond</button>

      {items.length === 0 ? (
        <div className="card text-center py-10"><p className="text-3xl mb-2">🎯</p><p className="font-semibold text-ink">Aucun budget défini</p></div>
      ) : items.map(({ b, cycle, spent, pct: rawPct, status, periodSpent }) => {
        const pct  = Math.min(100, rawPct)
        const over = status === 'over'
        const near = status === 'near'

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
                <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center" onClick={() => handleDelete(b.id)}><Trash2 size={14}/></button>
              </div>
            </div>
            <p className="text-[11px] text-ink-soft">🗓️ Plafond sur {durationLabel(b.periodMonths ?? 1)} · du {fmtDay(cycle.from)} au {fmtDay(cycle.to)}</p>
            <div className="w-full h-2.5 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: over ? '#DC2626' : near ? '#D97706' : b.color }}/>
            </div>
            <div className="flex justify-between text-xs">
              <span className={`font-mono font-bold ${over ? 'text-danger' : 'text-ink'}`}>{formatAmount(spent)} dépensés</span>
              <span className="font-mono text-ink-soft">plafond : {formatAmount(b.limit)}</span>
            </div>
            <p className="text-xs text-ink-soft">
              Dépensé sur {PERIOD_LABEL[period]} : <span className="font-mono font-bold text-ink">{formatAmount(periodSpent)}</span>
            </p>
          </div>
        )
      })}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">{editingBudget ? 'Modifier le plafond' : 'Nouveau plafond'}</h2>
              <button className="btn-icon bg-mist" onClick={closeForm}><X size={20}/></button>
            </div>
            {formError && <p className="text-xs text-danger bg-danger-light rounded-xl px-3 py-2">{formError}</p>}
            <div>
              <label className="label">Catégorie de dépense</label>
              <CategoryManager value={form.name} onChange={v => setForm(f => ({...f, name: v}))} customCategories={customCategories} onAddCustom={addCustom} onRemoveCustom={removeCustom} onRenameCustom={renameCustom} context="budget"/>
            </div>
            <div>
              <label className="label">Durée du plafond</label>
              <div className="grid grid-cols-5 gap-1.5">
                {BUDGET_DURATIONS.map(d => (
                  <button key={d.months} type="button" onClick={() => setForm(f => ({...f, periodMonths: d.months}))}
                    className={`py-2 rounded-xl text-[11px] font-bold border-2 transition-colors ${
                      form.periodMonths === d.months ? 'bg-orange-500 text-white border-transparent' : 'bg-white text-ink-soft border-mist-dark'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-soft mt-1.5">Démarre à la création et se renouvelle à la fin de chaque durée.</p>
            </div>
            <div><label className="label">Plafond sur {durationLabel(form.periodMonths)} (Rs)</label><input className="input" type="number" placeholder="Ex: 15000" value={form.limit} onChange={e => setForm(f => ({...f, limit: e.target.value}))}/></div>
            <div>
              <label className="label">Couleur</label>
              <div className="flex gap-3 flex-wrap">
                {COLORS.map(c => <button key={c} style={{ backgroundColor: c }} className={`w-10 h-10 rounded-2xl border-2 transition-transform ${form.color === c ? 'border-ink scale-110' : 'border-transparent'}`} onClick={() => setForm(f => ({...f, color: c}))}/>)}
              </div>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleSave} disabled={saving} style={{ backgroundColor: '#F97316' }}>
              {saving ? 'Enregistrement...' : editingBudget ? 'Enregistrer les modifications' : 'Créer le plafond'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Dettes helpers ───────────────────────────────────────────────────────────
function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0,0,0,0)
  const target = new Date(dateStr); target.setHours(0,0,0,0)
  return Math.round((target.getTime() - now.getTime()) / 86400000)
}

type PaymentRow = { debtId: string; amount: number; paidAt: string }

async function fetchHistory(debtId: string): Promise<DebtPaymentHistory[]> {
  const { data, error } = await supabase.from('debt_payment_history').select('*').eq('debt_id', debtId).order('paid_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({ id: r.id, debtId: r.debt_id, amount: Number(r.amount), paidAt: r.paid_at, note: r.note ?? undefined, category: r.category ?? undefined }))
}
async function logPayment(debtId: string, amount: number, date: string, category: string, note?: string): Promise<void> {
  const { error } = await supabase.from('debt_payment_history').insert({ debt_id: debtId, amount, paid_at: date, category, note: note || null })
  if (error) throw error
}
async function updatePayment(id: string, amount: number, date: string, note?: string): Promise<void> {
  const { error } = await supabase.from('debt_payment_history').update({ amount, paid_at: date, note: note || null }).eq('id', id)
  if (error) throw error
}
async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from('debt_payment_history').delete().eq('id', id)
  if (error) throw error
}
async function fetchCreditors(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('debt_creditors').select('*').order('name')
  if (error) throw error
  return (data ?? []).map(r => ({ id: r.id, name: r.name }))
}
async function saveCreditor(name: string): Promise<{ id: string; name: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('debt_creditors').insert({ name, user_id: user!.id }).select().single()
  if (error) throw error
  return { id: data.id, name: data.name }
}
async function deleteCreditor(id: string): Promise<void> {
  const { error } = await supabase.from('debt_creditors').delete().eq('id', id)
  if (error) throw error
}

function CreditorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [creditors, setCreditors] = useState<{ id: string; name: string }[]>([])
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchCreditors().then(setCreditors).catch(e => console.error('Créanciers:', e)) }, [])
  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const c = await saveCreditor(newName.trim())
      setCreditors(prev => {
        const updated = [...prev, c]
        return updated.sort((a, b) => {
          if (a.name === 'Autre') return 1
          if (b.name === 'Autre') return -1
          return a.name.localeCompare(b.name)
        })
      })
      onChange(c.name); setNewName(''); setOpen(false)
    } catch {
      window.alert("Impossible d'ajouter le créancier. Réessaie.")
    }
    setAdding(false)
  }
  async function handleDelete(c: { id: string; name: string }, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await deleteCreditor(c.id)
      setCreditors(prev => prev.filter(x => x.id !== c.id))
      if (value === c.name) onChange('')
    } catch {
      window.alert('Impossible de supprimer le créancier. Réessaie.')
    }
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

const REFRESH_FAILED = "Enregistré, mais l'affichage n'a pas pu être actualisé. Recharge la page."

function DettesSection() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
  const { customCategories, addCustom, removeCustom, renameCustom } = useCustomCategories(() => {
    getDebts().then(setDebts).catch(() => window.alert("Impossible d'actualiser tes dettes. Réessaie."))
  })
  const [expandedCreditors, setExpandedCreditors] = useState<Set<string>>(new Set())
  const [allPayments, setAllPayments] = useState<PaymentRow[]>([])
  const periodState = usePeriod()
  const { period, range } = periodState
  const ym = currentYearMonth()

  const [form, setForm] = useState({
    type: 'owe' as 'owe' | 'owed',
    person: '', amount: '', minimumPayment: '', interestRate: '',
    note: '', dueDate: '', paymentStartDate: '', recurring: false, category: 'Autre',
  })

  // Charge tous les remboursements ; RENVOIE la liste fraîche (l'état React n'est pas encore à jour au retour)
  async function loadPayments(): Promise<PaymentRow[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Non authentifié')
    const { data: userDebts, error: debtsError } = await supabase.from('debts').select('id').eq('user_id', user.id)
    if (debtsError) throw debtsError
    const ids = (userDebts ?? []).map(d => d.id)
    if (ids.length === 0) { setAllPayments([]); return [] }
    const { data, error } = await supabase.from('debt_payment_history')
      .select('debt_id, amount, paid_at').in('debt_id', ids)
    if (error) throw error
    const list: PaymentRow[] = (data ?? []).map(r => ({
      debtId: r.debt_id, amount: Number(r.amount), paidAt: String(r.paid_at).slice(0, 10),
    }))
    setAllPayments(list)
    return list
  }

  async function loadAll() {
    setLoading(true); setLoadError(null)
    try {
      const [d] = await Promise.all([getDebts(), loadPayments()])
      setDebts(d)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement')
    }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const monthlyPaid: Record<string, number> = {}
  allPayments.forEach(p => {
    if (p.paidAt >= `${ym}-01` && p.paidAt <= `${ym}-31`)
      monthlyPaid[p.debtId] = (monthlyPaid[p.debtId] || 0) + p.amount
  })

  const periodPaidByDebt: Record<string, number> = {}
  allPayments.forEach(p => {
    if (p.paidAt >= range.from && p.paidAt <= range.to)
      periodPaidByDebt[p.debtId] = (periodPaidByDebt[p.debtId] || 0) + p.amount
  })
  const periodPaidTotal = Object.values(periodPaidByDebt).reduce((s, v) => s + v, 0)

  const totalOwe  = debts.filter(d => d.type === 'owe').reduce((s, d) => s + d.remaining, 0)
  const totalOwed = debts.filter(d => d.type === 'owed').reduce((s, d) => s + d.remaining, 0)
  const oweDebts = debts.filter(d => d.type === 'owe')
  const activeOweDebts = oweDebts.filter(d => hasStarted(d.paymentStartDate))
  const totalMonthlyMin = activeOweDebts.reduce((s, d) => s + (d.minimumPayment || 0), 0)
  const totalMonthlyPaid = activeOweDebts.reduce((s, d) => s + (monthlyPaid[d.id] || 0), 0)
  const debtsPaidThisMonth = activeOweDebts.filter(d => (monthlyPaid[d.id] || 0) >= (d.minimumPayment || 0)).length
  const debtsStillDue = activeOweDebts.filter(d => (monthlyPaid[d.id] || 0) < (d.minimumPayment || 0)).length

  const tip = debts.length > 0
    ? `💪 Continue tes remboursements régulièrement, chaque paiement compte !`
    : `Enregistre tes crédits et prêts pour suivre leur avancement.`

  const groupedDebts = debts.reduce((acc, d) => {
    if (!acc[d.person]) acc[d.person] = []
    acc[d.person].push(d)
    return acc
  }, {} as Record<string, Debt[]>)

  function resetForm() {
    setForm({ type:'owe', person:'', amount:'', minimumPayment:'', interestRate:'', note:'', dueDate:'', paymentStartDate:'', recurring: false, category: 'Autre' })
    setEditingId(null)
  }
  function openEdit(d: Debt) {
    setForm({
      type: d.type, person: d.person, amount: String(d.amount),
      minimumPayment: d.minimumPayment ? String(d.minimumPayment) : '',
      interestRate: d.interestRate !== undefined ? String(d.interestRate) : '',
      note: d.note || '', dueDate: d.dueDate || '', paymentStartDate: d.paymentStartDate ?? '',
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
      try {
        const h = await fetchHistory(debtId)
        setHistoryMap(prev => ({ ...prev, [debtId]: h }))
      } catch {
        window.alert("Impossible de charger l'historique. Réessaie.")
        setOpenHistoryId(null)
      }
      setHistoryLoading(false)
    }
  }
  function invalidateHistory(debtId: string) { setHistoryMap(prev => { const n = { ...prev }; delete n[debtId]; return n }) }
  async function reloadHistory(debtId: string) {
    try {
      const h = await fetchHistory(debtId)
      setHistoryMap(prev => ({ ...prev, [debtId]: h }))
    } catch {
      invalidateHistory(debtId)
    }
  }

  // Source de vérité : amount - somme des paiements. Pour une dette récurrente,
  // on ne compte que les paiements DEPUIS le dernier "reset" (remise à zéro),
  // repéré en rejouant l'historique.
  function computeRemaining(debt: Debt, payments: PaymentRow[]): number {
    if (debt.amount <= 0) return 0
    const mine = payments.filter(p => p.debtId === debt.id).sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    const isRecurring = (debt as any).recurring ?? false

    if (!isRecurring) {
      const paid = mine.reduce((s, p) => s + p.amount, 0)
      return Math.max(0, debt.amount - paid)
    }
    // Récurrent : on "rejoue" les paiements et on remet à 0 dès que le cumul atteint amount
    let running = 0
    for (const p of mine) {
      running += p.amount
      if (running >= debt.amount) running = 0
    }
    return Math.max(0, debt.amount - running)
  }

  async function syncRemaining(debt: Debt, payments: PaymentRow[] = allPayments) {
    const remaining = computeRemaining(debt, payments)
    try {
      await updateDebt(debt.id, { remaining })
      setDebts(prev => prev.map(d => d.id === debt.id ? { ...d, remaining } : d))
    } catch {
      window.alert("Impossible de mettre à jour le solde de la dette. Réessaie.")
    }
    return remaining
  }

  async function handleAdd() {
    if (!form.person) return
    const debtData = {
      type: form.type, person: form.person, amount: Number(form.amount) || 0,
      minimumPayment: Number(form.minimumPayment) || 0,
      interestRate: form.interestRate ? Number(form.interestRate) : undefined,
      note: form.note, dueDate: form.dueDate || undefined,
      paymentStartDate: form.paymentStartDate,
      recurring: form.recurring, category: form.category,
    } as any

    if (editingId) {
      const newAmount = Number(form.amount) || debts.find(d => d.id === editingId)!.amount
      try {
        await updateDebt(editingId, { ...debtData, amount: newAmount })
      } catch {
        window.alert('Impossible de modifier la dette. Réessaie.')
        return
      }
      const updated = { ...debts.find(d => d.id === editingId)!, ...debtData, amount: newAmount }
      setDebts(prev => prev.map(d => d.id !== editingId ? d : updated))
      await syncRemaining(updated) // recalcule depuis l'historique réel, pas depuis l'ancien solde
    } else {
      try {
        const newDebt = await addDebt({ ...debtData, remaining: Number(form.amount) || 0 })
        setDebts(prev => [...prev, newDebt])
      } catch {
        window.alert("Impossible d'ajouter la dette. Réessaie.")
        return
      }
    }
    resetForm(); setShowForm(false)
  }

  async function handleDeleteDebt(id: string) {
    try {
      await deleteDebt(id)
      setDebts(prev => prev.filter(x => x.id !== id))
    } catch {
      window.alert('Impossible de supprimer la dette. Réessaie.')
    }
  }

  async function handlePay(id: string) {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) return
    const debt = debts.find(d => d.id === id)!
    const debtCategory = (debt as any).category ?? 'Autre'
    try {
      await logPayment(id, amt, payDate, debtCategory, payNote)
    } catch {
      window.alert("Impossible d'enregistrer le remboursement. Réessaie.")
      return
    }
    invalidateHistory(id)
    let fresh: PaymentRow[]
    try { fresh = await loadPayments() }
    catch { window.alert(REFRESH_FAILED); return }
    const remaining = await syncRemaining(debt, fresh)
    if (debt.amount > 0 && remaining === 0 && !((debt as any).recurring ?? false)) setConfirmDeleteId(id)
    setPayingId(null); setPayAmount(''); setPayDate(new Date().toISOString().slice(0, 10)); setPayNote('')
  }

  async function handleEditPayment() {
    if (!editingPayment) return
    const newAmt = Number(editPayAmount)
    if (!newAmt || newAmt <= 0) return
    try {
      await updatePayment(editingPayment.id, newAmt, editPayDate, editPayNote)
    } catch {
      window.alert("Impossible de modifier le remboursement. Réessaie.")
      return
    }
    let fresh: PaymentRow[]
    try { fresh = await loadPayments() }
    catch { window.alert(REFRESH_FAILED); return }
    const debt = debts.find(d => d.id === editingPayment.debtId)
    if (debt) await syncRemaining(debt, fresh)
    await reloadHistory(editingPayment.debtId)
    setEditingPayment(null)
  }

  async function handleDeletePayment(h: DebtPaymentHistory) {
    try {
      await deletePayment(h.id)
    } catch {
      window.alert("Impossible de supprimer le remboursement. Réessaie.")
      return
    }
    let fresh: PaymentRow[]
    try { fresh = await loadPayments() }
    catch { window.alert(REFRESH_FAILED); return }
    const debt = debts.find(d => d.id === h.debtId)
    if (debt) await syncRemaining(debt, fresh)
    await reloadHistory(h.debtId)
  }

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>
  if (loadError) {
    return (
      <div className="card text-center py-8 space-y-3">
        <p className="text-sm text-danger">Impossible de charger tes dettes : {loadError}</p>
        <button className="btn-ghost" onClick={loadAll}>Réessayer</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />
      <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-2xl">
        <span className="text-base">💡</span>
        <p className="text-xs text-red-700 leading-relaxed">
          <strong>Dettes ≠ Factures.</strong> Une dette se rembourse progressivement sur plusieurs mois/années.
        </p>
      </div>

      <PeriodFilter {...periodState} activeClass="bg-danger text-white" />

      <div className="card bg-danger-light">
        <p className="text-xs font-bold text-danger uppercase tracking-wide">Remboursé · {PERIOD_LABEL[period]}</p>
        <p className="text-2xl font-bold font-mono text-danger mt-1">{formatAmount(periodPaidTotal)}</p>
      </div>

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

     {activeOweDebts.length > 0 && (
        <div className="card border-2 border-blue-200 bg-blue-50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📅</span>
              <p className="text-sm font-bold text-blue-700">Ce mois-ci</p>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${debtsStillDue === 0 ? 'bg-positive-light text-positive' : 'bg-danger-light text-danger'}`}>
              {debtsStillDue === 0 ? '✅ Tout payé !' : `${debtsStillDue} restant${debtsStillDue > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-bold font-mono text-blue-800">{formatAmount(totalMonthlyPaid)}</p>
              <p className="text-xs text-blue-600">remboursés sur {formatAmount(totalMonthlyMin)} prévus</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-blue-700">{debtsPaidThisMonth}/{activeOweDebts.length}</p>
              <p className="text-xs text-blue-500">dettes payées</p>
            </div>
          </div>
          {totalMonthlyMin > 0 && (
            <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (totalMonthlyPaid / totalMonthlyMin) * 100)}%` }}/>
            </div>
          )}
        </div>
      )}

      <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary w-full gap-2" style={{ backgroundColor: '#DC2626' }}><Plus size={18}/> Ajouter une dette / prêt</button>

      {debts.length === 0 ? (
        <div className="card text-center py-10"><p className="text-3xl mb-2">🤝</p><p className="font-semibold text-ink">Aucune dette enregistrée</p></div>
      ) : Object.entries(groupedDebts).map(([personName, personDebts]) => {
        const isGrouped = personDebts.length > 1
        const isExpanded = expandedCreditors.has(personName)
        const groupTotal = personDebts.reduce((s, d) => s + d.remaining, 0)
        const groupPaid  = personDebts.reduce((s, d) => s + (monthlyPaid[d.id] || 0), 0)

        return (
          <div key={personName}>
            {isGrouped && (
              <button onClick={() => setExpandedCreditors(prev => { const next = new Set(prev); next.has(personName) ? next.delete(personName) : next.add(personName); return next })}
                className="w-full flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-2xl mb-2">
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

            {(!isGrouped || isExpanded) && personDebts.map(d => {
              const paidPct      = d.amount > 0 ? Math.round(((d.amount - d.remaining) / d.amount) * 100) : 0
              const isRecurring  = (d as any).recurring ?? false
              const debtCategory = (d as any).category ?? 'Autre'
              const end          = debtEndLabel(d)
              const showHistory  = openHistoryId === d.id
              const debtHistory  = historyMap[d.id] ?? []
              const paidThisMonth = monthlyPaid[d.id] || 0
              const stillDue = Math.max(0, (d.minimumPayment || 0) - paidThisMonth)
              const notStarted = !hasStarted(d.paymentStartDate)

              let dueBadge: React.ReactNode = null
              if (d.dueDate) {
                const days = daysUntil(d.dueDate)
                if (days < 0)        dueBadge = <span className="inline-flex items-center gap-1 text-xs bg-danger text-white px-2 py-0.5 rounded-full font-bold">⚠️ En retard de {Math.abs(days)}j</span>
                else if (days === 0) dueBadge = <span className="inline-flex items-center gap-1 text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-bold">🔴 Aujourd'hui !</span>
                else if (days <= 7)  dueBadge = <span className="inline-flex items-center gap-1 text-xs bg-warning-light text-warning px-2 py-0.5 rounded-full font-bold">⏰ Dans {days}j</span>
                else if (days <= 30) dueBadge = <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-accent px-2 py-0.5 rounded-full font-medium">📅 Dans {days}j</span>
              }

              return (
                <div key={d.id} className={`card space-y-3 border-l-4 mb-2 ${isGrouped ? 'ml-4' : ''} ${d.type === 'owe' ? 'border-l-danger' : 'border-l-positive'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {isRecurring && <span className="text-xs bg-blue-50 text-accent border border-blue-100 px-2 py-0.5 rounded-full font-medium">🔄 Récurrent</span>}
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF7ED', color: '#C2410C', border: '1px solid #FDBA74' }}>{debtCategory}</span>
                        <span className="text-xs font-medium text-ink-soft">{d.type === 'owe' ? 'Je dois à' : 'Me doit'}</span>
                      </div>
                      <p className="font-bold text-base text-ink">{d.person}</p>
                      {d.note && <p className="text-xs text-blue-500 mt-0.5">{d.note}</p>}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                        {d.minimumPayment > 0 && (
                          <span className="text-xs text-ink-soft">
                            Min. <span className="font-semibold text-ink">{formatAmount(d.minimumPayment)}</span>/mois
                          </span>
                        )}
                        {end && !isRecurring && !notStarted && (
                          end.neverEnds
                            ? <span className="text-xs text-danger font-semibold">⚠️ Le minimum ne couvre pas les intérêts</span>
                            : <span className="text-xs text-ink-soft">{end.text}</span>
                        )}
                      </div>
                      {notStarted && d.paymentStartDate && (
                            <div className="mt-1.5">
                              <span className="text-xs bg-blue-50 text-accent px-2 py-0.5 rounded-full font-semibold">⏳ Paiements dès {startLabel(d.paymentStartDate)}</span>
                            </div>
                          )}
                          {!notStarted && d.type === 'owe' && d.minimumPayment > 0 && (
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
                      <p className="text-xs text-ink-soft mt-1.5">
                        Remboursé sur {PERIOD_LABEL[period]} : <span className="font-mono font-bold text-ink">{formatAmount(periodPaidByDebt[d.id] || 0)}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <p className="font-mono font-bold text-lg text-ink">{formatAmount(d.remaining)}</p>
                      {paidPct > 0 && !isRecurring && <span className="text-xs font-semibold text-positive bg-positive-light px-2 py-0.5 rounded-full">{paidPct}% remboursé</span>}
                      <div className="flex gap-1 mt-0.5">
                        <button className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${showHistory ? 'bg-accent text-white' : 'bg-mist hover:bg-accent-light text-ink-soft hover:text-accent'}`} onClick={() => toggleHistory(d.id)}><History size={14}/></button>
                        <button className="w-8 h-8 rounded-xl bg-mist hover:bg-mist-dark text-ink-soft hover:text-ink flex items-center justify-center" onClick={() => openEdit(d)}><Pencil size={14}/></button>
                        <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center" onClick={() => handleDeleteDebt(d.id)}><Trash2 size={14}/></button>
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
                      <button className="px-6 py-2.5 text-sm font-bold text-white rounded-2xl active:scale-95 transition-all" style={{ backgroundColor: '#DC2626' }}
                        onClick={() => { setPayingId(d.id); setPayAmount(String(d.minimumPayment || '')); setPayDate(new Date().toISOString().slice(0, 10)); setPayNote('') }}>
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
              <button className="btn-primary flex-1" style={{ backgroundColor: '#DC2626' }} onClick={async () => { await handleDeleteDebt(confirmDeleteId); setConfirmDeleteId(null) }}>Oui, supprimer</button>
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
              <label className="label">Catégorie</label>
              <CategoryManager value={form.category} onChange={v => setForm(f => ({...f, category: v}))} customCategories={customCategories} onAddCustom={addCustom} onRemoveCustom={removeCustom} onRenameCustom={renameCustom} context="dettes"/>
            </div>
            <div><label className="label">Montant total (Rs)</label><input className="input" type="number" placeholder="Ex: 150000" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}/></div>
            <div><label className="label">Remboursement minimum / mois (Rs)</label><input className="input" type="number" placeholder="Ex: 3000" value={form.minimumPayment} onChange={e => setForm(f => ({...f, minimumPayment: e.target.value}))}/></div>
            <div><label className="label">Taux d'intérêt annuel % (optionnel)</label><input className="input" type="number" placeholder="Ex: 12" value={form.interestRate} onChange={e => setForm(f => ({...f, interestRate: e.target.value}))}/></div>
            <div><label className="label">Note</label><input className="input" placeholder="Ex: Crédit voiture Honda" value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))}/></div>
            <div><label className="label">Échéance finale (optionnel)</label><input className="input" type="date" value={form.dueDate} onChange={e => setForm(f => ({...f, dueDate: e.target.value}))}/></div>
            <div><label className="label">Début des remboursements (optionnel)</label><input className="input" type="date" value={form.paymentStartDate} onChange={e => setForm(f => ({...f, paymentStartDate: e.target.value}))}/>
              <p className="text-[11px] text-ink-soft mt-1">Ex : crédit pris en septembre, premier paiement en janvier. Avant cette date, la dette n'est pas comptée « à payer ce mois ».</p>
            </div>
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
