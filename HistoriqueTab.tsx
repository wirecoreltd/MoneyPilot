'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatAmount, currentYearMonth } from '@/lib/storage'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'expense' | 'income' | 'facture' | 'dette' | 'epargne'
type FilterType = EventType | 'all' | 'projet' | 'budget'

interface HistoriqueEvent {
  id: string
  date: string
  type: EventType
  label: string
  sublabel?: string
  category?: string   // catégorie budgétaire (indépendante du sous-libellé affiché)
  amount: number
  isNegative: boolean
}

interface DayGroup {
  date: string
  label: string
  events: HistoriqueEvent[]
}

interface BudgetStat {
  name: string
  limit: number
  spent: number
  respected: boolean
}

// ─── Config visuelle par type ─────────────────────────────────────────────────

const TYPE_CONFIG: Record<EventType, {
  emoji: string; color: string; bg: string; border: string; label: string
}> = {
  expense: { emoji: '💸', color: 'text-danger',     bg: 'bg-danger-light',   border: 'border-danger/20',   label: 'Dépense'     },
  income:  { emoji: '💰', color: 'text-positive',   bg: 'bg-positive-light', border: 'border-positive/20', label: 'Revenu'      },
  facture: { emoji: '🧾', color: 'text-yellow-700', bg: 'bg-yellow-50',      border: 'border-yellow-200',  label: 'Facture'     },
  dette:   { emoji: '💳', color: 'text-red-700',    bg: 'bg-red-50',         border: 'border-red-200',     label: 'Rembt dette' },
  epargne: { emoji: '🪙', color: 'text-accent',     bg: 'bg-accent-light',   border: 'border-blue-200',    label: 'Épargne'     },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(s: string) { return s.slice(0, 10) }

function formatDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (date.getTime() === today.getTime()) return "Aujourd'hui"
  if (date.getTime() === yesterday.getTime()) return 'Hier'
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function monthOptions() {
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { ym, label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }
  })
}

// Déballe une réponse Supabase : lance une exception si la requête a échoué
// (sinon une requête en erreur ressemble à « aucune donnée »).
function ok<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) throw res.error
  return (res.data ?? []) as T
}

function errMsg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  const m = (e as { message?: unknown } | null)?.message
  return typeof m === 'string' && m ? m : 'Erreur de chargement'
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function HistoriqueTab() {
  const [mode, setMode]               = useState<'month' | 'range'>('month')
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth())
  const [rangeFrom, setRangeFrom]     = useState('')
  const [rangeTo, setRangeTo]         = useState('')
  const [events, setEvents]           = useState<HistoriqueEvent[]>([])
  const [budgetStats, setBudgetStats] = useState<BudgetStat[]>([])
  const [projectCount, setProjectCount] = useState(0)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [showAll, setShowAll] = useState(false)
  const seq = useRef(0)

  // ── Dates effectives ────────────────────────────────────────────────────────
  const { dateFrom, dateTo } = useMemo(() => {
    if (mode === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number)
      const last = new Date(y, m, 0).getDate()
      return { dateFrom: `${selectedMonth}-01`, dateTo: `${selectedMonth}-${String(last).padStart(2, '0')}` }
    }
    return { dateFrom: rangeFrom, dateTo: rangeTo }
  }, [mode, selectedMonth, rangeFrom, rangeTo])

  const canLoad = !!dateFrom && !!dateTo && dateFrom <= dateTo

  // ── Chargement ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const mine = ++seq.current   // ignore les réponses d'une période déjà remplacée
    setLoading(true)
    setError(null)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Non authentifié')
      const uid = user.id
      const all: HistoriqueEvent[] = []

      // 1. Transactions dépenses
      const txs = ok(await supabase
        .from('transactions').select('id, amount, category, note, date')
        .eq('user_id', uid).eq('type', 'expense').gte('date', dateFrom).lte('date', dateTo))
      txs.forEach((r: any) => all.push({
        id: r.id, date: toYMD(r.date), type: 'expense',
        label: r.note || r.category, sublabel: r.category, category: r.category,
        amount: Number(r.amount), isNegative: true,
      }))

      // 2. Revenus (à leur vraie date de réception, sinon au 1er du mois)
      const incomes = ok(await supabase
        .from('monthly_incomes').select('id, label, amount, month, is_fixed, received_at')
        .eq('user_id', uid).gte('month', dateFrom.slice(0, 7)).lte('month', dateTo.slice(0, 7)))
      incomes.forEach((r: any) => {
        const day = r.received_at ? toYMD(r.received_at) : `${r.month}-01`
        if (day >= dateFrom && day <= dateTo) all.push({
          id: r.id, date: day, type: 'income',
          label: r.label, sublabel: r.is_fixed ? 'Fixe' : 'Variable',
          amount: Number(r.amount), isNegative: false,
        })
      })

      // 3. Factures payées
      const factures = ok(await supabase.from('factures').select('id, name, category').eq('user_id', uid))
      const factureMap: Record<string, { name: string; category: string }> = {}
      factures.forEach((f: any) => { factureMap[f.id] = { name: f.name, category: f.category } })
      const factureIds = Object.keys(factureMap)
      if (factureIds.length > 0) {
        const fph = ok(await supabase
          .from('facture_payment_history').select('id, facture_id, amount, paid_at, note')
          .in('facture_id', factureIds).gte('paid_at', dateFrom).lte('paid_at', dateTo))
        fph.forEach((r: any) => {
          const f = factureMap[r.facture_id]
          all.push({ id: r.id, date: toYMD(r.paid_at), type: 'facture',
            label: f?.name ?? 'Facture', sublabel: f?.category, category: f?.category,
            amount: Number(r.amount), isNegative: true })
        })
      }

      // 4. Remboursements dettes
      const userDebts = ok(await supabase.from('debts').select('id, person, category').eq('user_id', uid))
      const debtMap: Record<string, { person: string; category: string }> = {}
      userDebts.forEach((d: any) => { debtMap[d.id] = { person: d.person, category: d.category } })
      const debtIds = Object.keys(debtMap)
      if (debtIds.length > 0) {
        const dph = ok(await supabase
          .from('debt_payment_history').select('id, debt_id, amount, paid_at, note, category')
          .in('debt_id', debtIds).gte('paid_at', dateFrom).lte('paid_at', dateTo))
        dph.forEach((r: any) => {
          const d = debtMap[r.debt_id]
          all.push({ id: r.id, date: toYMD(r.paid_at), type: 'dette',
            label: d?.person ?? 'Dette', sublabel: r.note || r.category || d?.category,
            category: r.category || d?.category,
            amount: Number(r.amount), isNegative: true })
        })
      }

      // 5. Épargne — vrais mouvements (dépôts / retraits) de la période
      const goals = ok(await supabase.from('savings_goals').select('id, name').eq('user_id', uid))
      const goalMap: Record<string, string> = {}
      goals.forEach((g: any) => { goalMap[g.id] = g.name })
      const goalIds = Object.keys(goalMap)
      if (goalIds.length > 0) {
        const deps = ok(await supabase
          .from('savings_deposits').select('id, goal_id, amount, is_withdrawal, note, deposited_at')
          .in('goal_id', goalIds).gte('deposited_at', dateFrom).lte('deposited_at', dateTo))
        deps.forEach((r: any) => {
          const withdrawal = !!r.is_withdrawal
          all.push({
            id: r.id, date: toYMD(r.deposited_at), type: 'epargne',
            label: goalMap[r.goal_id] ?? 'Épargne',
            sublabel: r.note || (withdrawal ? 'Retrait' : 'Dépôt'),
            amount: Number(r.amount),
            isNegative: !withdrawal,   // un dépôt sort de ta poche, un retrait y revient
          })
        })
      }

      // 6. Budget — dépenses de la période par catégorie
      const budgets = ok(await supabase.from('budget_categories').select('id, name, limit, color').eq('user_id', uid))
      let stats: BudgetStat[] = []
      if (budgets.length > 0) {
        const spentMap: Record<string, number> = {}
        all.filter(e => (e.type === 'expense' || e.type === 'facture' || e.type === 'dette') && e.category)
          .forEach(e => { spentMap[e.category!] = (spentMap[e.category!] || 0) + e.amount })
        stats = budgets.map((b: any) => ({
          name: b.name,
          limit: Number(b.limit),
          spent: spentMap[b.name] || 0,
          respected: (spentMap[b.name] || 0) <= Number(b.limit),
        }))
      }

      // 7. Projets — juste le count
      const { count, error: projError } = await supabase
        .from('projects').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      if (projError) throw projError

      all.sort((a, b) => b.date.localeCompare(a.date))

      if (mine !== seq.current) return
      setEvents(all)
      setBudgetStats(stats)
      setProjectCount(count ?? 0)
    } catch (e) {
      console.error("Chargement de l'historique échoué :", e)
      if (mine === seq.current) setError(errMsg(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    if (canLoad) load()
  }, [canLoad, load])

  // ── Calculs ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const t = { expense: 0, income: 0, facture: 0, dette: 0, epargne: 0 }
    for (const e of events) {
      if (e.type === 'epargne') t.epargne += e.isNegative ? e.amount : -e.amount  // dépôts − retraits
      else t[e.type] += e.amount
    }
    return t
  }, [events])

  const budgetRespected = budgetStats.filter(b => b.respected).length
  const budgetTotal     = budgetStats.length
  const budgetPct       = budgetTotal > 0 ? Math.round((budgetRespected / budgetTotal) * 100) : null
  const budgetSpent     = budgetStats.reduce((s, b) => s + b.spent, 0)
  const budgetLimit     = budgetStats.reduce((s, b) => s + b.limit, 0)

  const filtered = useMemo(() => {
    if (activeFilter === 'all' || activeFilter === 'budget' || activeFilter === 'projet') return [...events]
    return events.filter(e => e.type === activeFilter)
  }, [events, activeFilter])

  const allDayGroups: DayGroup[] = useMemo(() => {
    const map: Record<string, HistoriqueEvent[]> = {}
    for (const e of filtered) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, evts]) => ({ date, label: formatDayLabel(date), events: evts }))
  }, [filtered])

  const dayGroups = showAll ? allDayGroups : allDayGroups.slice(0, 5)

  function handleCardClick(f: FilterType) {
    setActiveFilter(prev => {
      if (prev === f) return 'all'
      return f
    })
    setShowAll(false)
    setExpandedDays(new Set())
  }

  function toggleDay(date: string) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  // ── 7 cartes config ─────────────────────────────────────────────────────────
  const epargneCount = events.filter(e => e.type === 'epargne').length
  const CARDS: {
    id: FilterType
    emoji: string
    label: string
    value: string
    sub: string
    activeBg: string
    activeText: string
    inactiveBg: string
    inactiveBorder: string
    inactiveText: string
    showAlways: boolean
  }[] = [
    {
      id: 'income', emoji: '💰', label: 'Revenus',
      value: `+${formatAmount(totals.income)}`,
      sub: `${events.filter(e => e.type === 'income').length} source${events.filter(e => e.type === 'income').length > 1 ? 's' : ''}`,
      activeBg: 'bg-positive', activeText: 'text-white',
      inactiveBg: 'bg-positive-light', inactiveBorder: 'border-positive/20', inactiveText: 'text-positive',
      showAlways: true,
    },
    {
      id: 'expense', emoji: '💸', label: 'Dépenses',
      value: `−${formatAmount(totals.expense)}`,
      sub: `${events.filter(e => e.type === 'expense').length} op.`,
      activeBg: 'bg-danger', activeText: 'text-white',
      inactiveBg: 'bg-danger-light', inactiveBorder: 'border-danger/20', inactiveText: 'text-danger',
      showAlways: true,
    },
    {
      id: 'dette', emoji: '💳', label: 'Dettes',
      value: `−${formatAmount(totals.dette)}`,
      sub: `${events.filter(e => e.type === 'dette').length} rembt.`,
      activeBg: 'bg-red-700', activeText: 'text-white',
      inactiveBg: 'bg-red-50', inactiveBorder: 'border-red-200', inactiveText: 'text-red-700',
      showAlways: true,
    },
    {
      id: 'facture', emoji: '🧾', label: 'Factures',
      value: `−${formatAmount(totals.facture)}`,
      sub: `${events.filter(e => e.type === 'facture').length} paiement${events.filter(e => e.type === 'facture').length > 1 ? 's' : ''}`,
      activeBg: 'bg-yellow-500', activeText: 'text-white',
      inactiveBg: 'bg-yellow-50', inactiveBorder: 'border-yellow-200', inactiveText: 'text-yellow-700',
      showAlways: true,
    },
    {
      id: 'epargne', emoji: '🪙', label: 'Épargne',
      value: `${formatAmount(totals.epargne)}`,
      sub: `${epargneCount} mouvement${epargneCount > 1 ? 's' : ''}`,
      activeBg: 'bg-accent', activeText: 'text-white',
      inactiveBg: 'bg-accent-light', inactiveBorder: 'border-blue-200', inactiveText: 'text-accent',
      showAlways: true,
    },
    {
      id: 'projet', emoji: '🚀', label: 'Projets',
      value: `${projectCount}`,
      sub: `projet${projectCount > 1 ? 's' : ''} actif${projectCount > 1 ? 's' : ''}`,
      activeBg: 'bg-violet-600', activeText: 'text-white',
      inactiveBg: 'bg-violet-50', inactiveBorder: 'border-violet-200', inactiveText: 'text-violet-700',
      showAlways: true,
    },
    {
      id: 'budget', emoji: '🎯', label: 'Budget',
      value: budgetPct !== null ? `${budgetPct}%` : '—',
      sub: budgetPct !== null
        ? `${budgetRespected}/${budgetTotal} cat. · ${formatAmount(budgetSpent)}/${formatAmount(budgetLimit)}`
        : 'Aucun budget défini',
      activeBg: budgetPct !== null && budgetPct >= 80 ? 'bg-positive' : budgetPct !== null && budgetPct >= 50 ? 'bg-orange-500' : 'bg-danger',
      activeText: 'text-white',
      inactiveBg: budgetPct !== null && budgetPct >= 80 ? 'bg-positive-light' : budgetPct !== null && budgetPct >= 50 ? 'bg-orange-50' : 'bg-danger-light',
      inactiveBorder: budgetPct !== null && budgetPct >= 80 ? 'border-positive/20' : budgetPct !== null && budgetPct >= 50 ? 'border-orange-200' : 'border-danger/20',
      inactiveText: budgetPct !== null && budgetPct >= 80 ? 'text-positive' : budgetPct !== null && budgetPct >= 50 ? 'text-orange-700' : 'text-danger',
      showAlways: true,
    },
  ]

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      <div>
        <h1 className="text-xl font-bold text-ink">Synthèse</h1>
        <p className="text-sm text-ink-soft mt-0.5">
          🧭 Résumé complet de ta situation financière sur la période sélectionnée.
        </p>
      </div>

      {/* ── Sélecteur de mode ── */}
      <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark bg-white">
        <button
          className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${mode === 'month' ? 'bg-accent text-white' : 'text-ink-soft'}`}
          onClick={() => setMode('month')}
        >
          <CalendarDays size={15}/> Par mois
        </button>
        <button
          className={`flex-1 py-3 text-sm font-bold transition-colors ${mode === 'range' ? 'bg-accent text-white' : 'text-ink-soft'}`}
          onClick={() => setMode('range')}
        >
          📅 Période libre
        </button>
      </div>

      {/* ── Contrôles de période ── */}
      {mode === 'month' ? (
        <select className="input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
          {monthOptions().map(m => <option key={m.ym} value={m.ym}>{m.label}</option>)}
        </select>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Du</label><input className="input" type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}/></div>
          <div><label className="label">Au</label><input className="input" type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}/></div>
        </div>
      )}

      {/* ── Erreur de chargement ── */}
      {canLoad && error && !loading && (
        <div className="card text-center py-8 space-y-3">
          <p className="text-sm text-danger">Impossible de charger l'historique : {error}</p>
          <button className="btn-ghost" onClick={load}>Réessayer</button>
        </div>
      )}

      {/* ── 7 cartes cliquables ── */}
      {canLoad && !loading && !error && (
        <div className="grid grid-cols-2 gap-2">
          {CARDS.map(card => {
            const isActive = activeFilter === card.id
            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.id)}
                className={`card text-left p-3 transition-all active:scale-[0.97] border-2 rounded-2xl ${
                  isActive
                    ? `${card.activeBg} ${card.activeText} border-transparent shadow-md`
                    : `${card.inactiveBg} ${card.inactiveBorder}`
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg">{card.emoji}</span>
                  {isActive && <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">✓ Filtre actif</span>}
                </div>
                <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${isActive ? 'text-white/70' : card.inactiveText}`}>
                  {card.label}
                </p>
                <p className={`text-lg font-bold font-mono leading-tight ${isActive ? 'text-white' : card.inactiveText}`}>
                  {card.value}
                </p>
                <p className={`text-[10px] mt-0.5 ${isActive ? 'text-white/60' : 'text-ink-soft'}`}>
                  {card.sub}
                </p>

                {/* Barre de budget dans la carte Budget */}
                {card.id === 'budget' && budgetPct !== null && (
                  <div className="mt-2 w-full h-1.5 bg-white/30 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${budgetPct}%`,
                        backgroundColor: isActive ? 'rgba(255,255,255,0.8)' : (budgetPct >= 80 ? '#16A34A' : budgetPct >= 50 ? '#F97316' : '#DC2626'),
                      }}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Filtre actif → détail budget ou liste */}
      {!error && activeFilter === 'budget' && budgetStats.length > 0 && (
        <div className="card space-y-2">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Détail par catégorie</p>
          {budgetStats.map(b => {
            const pct = Math.min(100, b.limit > 0 ? (b.spent / b.limit) * 100 : 0)
            return (
              <div key={b.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">{b.name}</span>
                  <span className={`font-mono font-bold ${b.respected ? 'text-positive' : 'text-danger'}`}>
                    {formatAmount(b.spent)} / {formatAmount(b.limit)}
                  </span>
                </div>
                <div className="w-full h-2 bg-mist-dark rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: b.respected ? '#16A34A' : '#DC2626' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!error && activeFilter === 'projet' && (
        <div className="card text-center py-6">
          <p className="text-3xl mb-2">🚀</p>
          <p className="text-sm font-semibold text-ink">{projectCount} projet{projectCount > 1 ? 's' : ''} actif{projectCount > 1 ? 's' : ''}</p>
          <p className="text-xs text-ink-soft mt-1">Rendez-vous dans l'onglet Projets pour les détails</p>
        </div>
      )}

      {/* Bande filtre actif (hors budget/projet) */}
      {!error && activeFilter !== 'all' && activeFilter !== 'budget' && activeFilter !== 'projet' && (
        <div className="flex items-center justify-between px-3 py-2 bg-mist rounded-xl">
          <p className="text-xs text-ink-soft">
            Filtre : <strong className="text-ink">{TYPE_CONFIG[activeFilter].emoji} {TYPE_CONFIG[activeFilter].label}</strong>
            {' '}· {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
          </p>
          <button onClick={() => setShowAll(true)} className="text-xs font-bold text-accent">
            {showAll ? '' : `Voir tout (${allDayGroups.length} jours)`}
          </button>
        </div>
      )}

      {/* ── États ── */}
      {!canLoad && (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">📅</p>
          <p className="font-semibold text-ink">Sélectionne une période</p>
          <p className="text-sm text-ink-soft mt-1">Renseigne les deux dates pour voir l'historique</p>
        </div>
      )}
      {canLoad && loading && (
        <div className="card text-center py-10">
          <p className="text-2xl mb-2 animate-pulse">⏳</p>
          <p className="text-sm text-ink-soft">Chargement...</p>
        </div>
      )}
      {canLoad && !loading && !error && events.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🕳️</p>
          <p className="font-semibold text-ink">Aucune opération sur cette période</p>
          <p className="text-sm text-ink-soft mt-1">Essaie une autre plage de dates</p>
        </div>
      )}

      {/* ── Liste groupée par jour ── */}
      {!loading && !error && activeFilter !== 'all' && activeFilter !== 'budget' && activeFilter !== 'projet' && dayGroups.length > 0 && (
        <div className="space-y-2">
          {dayGroups.map(group => {
            const isOpen = expandedDays.has(group.date)
            const dayTotal = group.events.reduce((s, e) => e.isNegative ? s - e.amount : s + e.amount, 0)

            return (
              <div key={group.date} className="rounded-2xl border border-mist-dark overflow-hidden bg-white">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-mist hover:bg-mist-dark transition-colors"
                  onClick={() => toggleDay(group.date)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                      <span className="text-sm font-bold text-ink">{group.date.split('-')[2]}</span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-ink capitalize">{group.label}</p>
                      <p className="text-xs text-ink-soft">{group.events.length} opération{group.events.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`font-mono text-sm font-bold ${dayTotal >= 0 ? 'text-positive' : 'text-danger'}`}>
                      {dayTotal >= 0 ? '+' : '−'}{formatAmount(Math.abs(dayTotal))}
                    </span>
                    {isOpen ? <ChevronUp size={16} className="text-ink-soft"/> : <ChevronDown size={16} className="text-ink-soft"/>}
                  </div>
                </button>

                {isOpen && (
                  <div>
                    {group.events.map((ev, idx) => {
                      const cfg = TYPE_CONFIG[ev.type]
                      return (
                        <div key={ev.id} className={`flex items-center gap-3 px-4 py-3 ${idx < group.events.length - 1 ? 'border-b border-mist' : ''}`}>
                          <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-base">{cfg.emoji}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink truncate">{ev.label}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                              {ev.sublabel && ev.sublabel !== ev.label && (
                                <span className="text-[10px] text-ink-soft">{ev.sublabel}</span>
                              )}
                            </div>
                          </div>
                          <p className={`font-mono text-sm font-bold flex-shrink-0 ${ev.isNegative ? 'text-danger' : 'text-positive'}`}>
                            {ev.isNegative ? '−' : '+'}{formatAmount(ev.amount)}
                          </p>
                        </div>
                      )
                    })}
                    <div className="px-4 py-2 border-t border-mist flex justify-between items-center bg-mist/50">
                      <span className="text-xs text-ink-soft font-semibold">Total du jour</span>
                      <span className={`font-mono text-sm font-bold ${dayTotal >= 0 ? 'text-positive' : 'text-danger'}`}>
                        {dayTotal >= 0 ? '+' : '−'}{formatAmount(Math.abs(dayTotal))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
