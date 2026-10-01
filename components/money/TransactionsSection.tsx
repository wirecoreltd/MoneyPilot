'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Transaction, BudgetCategory,
  EXPENSE_CATEGORIES,
  addTransaction, deleteTransaction,
  getBudgets, formatAmount,
} from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { useSpendingLines } from '@/lib/useSpendingLines'
import {
  durationLabel, computeBudgetStatuses, earliestCycleStart, isCustomBudget,
} from '@/lib/budgetPeriods'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'
import { useCustomCategories, CategoryManager } from './categories'

// ─── Transactions ─────────────────────────────────────────────────────────────
const SHOW_MORE_LIMIT = 3

export function TransactionsSection({ transactions, onUpdate }: { transactions: Transaction[]; onUpdate: () => void }) {
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
            const bsCustom = !!bs && budgets.some(b => b.id === bs.id && isCustomBudget(b))
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
                        {formatAmount(bs.spent)} / {formatAmount(bs.limit)} ({bsCustom ? 'perso' : durationLabel(bs.periodMonths ?? 1)})
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
