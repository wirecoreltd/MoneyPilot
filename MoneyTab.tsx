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


