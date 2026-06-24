'use client'
import { useState, useEffect, useMemo } from 'react'
import { CalendarDays, TrendingUp, TrendingDown, Receipt, CreditCard, PiggyBank, ChevronDown, ChevronUp, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatAmount, currentYearMonth } from '@/lib/storage'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'expense' | 'income' | 'facture' | 'dette' | 'epargne'

interface HistoriqueEvent {
  id: string
  date: string          // YYYY-MM-DD
  type: EventType
  label: string
  sublabel?: string
  amount: number
  isNegative: boolean   // true = sortie d'argent
}

interface DayGroup {
  date: string
  label: string
  events: HistoriqueEvent[]
}

// ─── Config visuelle par type ─────────────────────────────────────────────────

const TYPE_CONFIG: Record<EventType, {
  emoji: string
  color: string          // texte
  bg: string             // fond badge
  border: string
  label: string
}> = {
  expense:  { emoji: '💸', color: 'text-danger',   bg: 'bg-danger-light',   border: 'border-danger/20',   label: 'Dépense'    },
  income:   { emoji: '💰', color: 'text-positive', bg: 'bg-positive-light', border: 'border-positive/20', label: 'Revenu'     },
  facture:  { emoji: '🧾', color: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-200',    label: 'Facture'    },
  dette:    { emoji: '💳', color: 'text-danger',   bg: 'bg-red-50',         border: 'border-red-200',     label: 'Rembt dette' },
  epargne:  { emoji: '🪙', color: 'text-accent',   bg: 'bg-accent-light',   border: 'border-blue-200',    label: 'Épargne'    },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(dateStr: string): string {
  // Normalise n'importe quel format ISO → YYYY-MM-DD
  return dateStr.slice(0, 10)
}

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
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    return { ym, label }
  })
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function HistoriqueTab() {
  // Mode sélecteur
  const [mode, setMode] = useState<'month' | 'range'>('month')
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth())
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo]     = useState('')

  // Données brutes
  const [events, setEvents] = useState<HistoriqueEvent[]>([])
  const [loading, setLoading] = useState(false)

  // UI
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<EventType | 'all'>('all')

  // ── Dates effectives ──────────────────────────────────────────────────────
  const { dateFrom, dateTo } = useMemo(() => {
    if (mode === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number)
      const last = new Date(y, m, 0).getDate()
      return {
        dateFrom: `${selectedMonth}-01`,
        dateTo:   `${selectedMonth}-${String(last).padStart(2, '0')}`,
      }
    }
    return { dateFrom: rangeFrom, dateTo: rangeTo }
  }, [mode, selectedMonth, rangeFrom, rangeTo])

  const canLoad = !!dateFrom && !!dateTo && dateFrom <= dateTo

  // ── Chargement ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canLoad) return
    load()
  }, [dateFrom, dateTo])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const uid = user.id
    const all: HistoriqueEvent[] = []

    // 1. Transactions (dépenses)
    const { data: txs } = await supabase
      .from('transactions')
      .select('id, type, amount, category, note, date')
      .eq('user_id', uid)
      .eq('type', 'expense')
      .gte('date', dateFrom)
      .lte('date', dateTo)
    ;(txs ?? []).forEach(r => {
      all.push({
        id: r.id, date: toYMD(r.date), type: 'expense',
        label: r.note || r.category, sublabel: r.category,
        amount: Number(r.amount), isNegative: true,
      })
    })

    // 2. Revenus (monthly_incomes)
    const { data: incomes } = await supabase
      .from('monthly_incomes')
      .select('id, label, amount, month, is_fixed')
      .eq('user_id', uid)
      .gte('month', dateFrom.slice(0, 7))
      .lte('month', dateTo.slice(0, 7))
    ;(incomes ?? []).forEach(r => {
      // On place le revenu au 1er du mois (pas de date précise stockée)
      const day = `${r.month}-01`
      if (day >= dateFrom && day <= dateTo) {
        all.push({
          id: r.id, date: day, type: 'income',
          label: r.label,
          sublabel: r.is_fixed ? 'Fixe' : 'Variable',
          amount: Number(r.amount), isNegative: false,
        })
      }
    })

    // 3. Factures payées (facture_payment_history + join factures)
    const { data: factures } = await supabase
      .from('factures')
      .select('id, name, category')
      .eq('user_id', uid)
    const factureMap: Record<string, { name: string; category: string }> = {}
    ;(factures ?? []).forEach(f => { factureMap[f.id] = { name: f.name, category: f.category } })

    const factureIds = Object.keys(factureMap)
    if (factureIds.length > 0) {
      const { data: fph } = await supabase
        .from('facture_payment_history')
        .select('id, facture_id, amount, paid_at, note')
        .in('facture_id', factureIds)
        .gte('paid_at', dateFrom)
        .lte('paid_at', dateTo)
      ;(fph ?? []).forEach(r => {
        const f = factureMap[r.facture_id]
        all.push({
          id: r.id, date: toYMD(r.paid_at), type: 'facture',
          label: f?.name ?? 'Facture', sublabel: f?.category,
          amount: Number(r.amount), isNegative: true,
        })
      })
    }

    // 4. Remboursements dettes (debt_payment_history)
    const { data: userDebts } = await supabase
      .from('debts')
      .select('id, person, category')
      .eq('user_id', uid)
    const debtMap: Record<string, { person: string; category: string }> = {}
    ;(userDebts ?? []).forEach(d => { debtMap[d.id] = { person: d.person, category: d.category } })

    const debtIds = Object.keys(debtMap)
    if (debtIds.length > 0) {
      const { data: dph } = await supabase
        .from('debt_payment_history')
        .select('id, debt_id, amount, paid_at, note, category')
        .in('debt_id', debtIds)
        .gte('paid_at', dateFrom)
        .lte('paid_at', dateTo)
      ;(dph ?? []).forEach(r => {
        const d = debtMap[r.debt_id]
        all.push({
          id: r.id, date: toYMD(r.paid_at), type: 'dette',
          label: d?.person ?? 'Dette',
          sublabel: r.note || r.category || d?.category,
          amount: Number(r.amount), isNegative: true,
        })
      })
    }

    // 5. Dépôts épargne (savings_deposits + join savings_goals)
    const { data: goals } = await supabase
      .from('savings_goals')
      .select('id, name')
      .eq('user_id', uid)
    const goalMap: Record<string, string> = {}
    ;(goals ?? []).forEach(g => { goalMap[g.id] = g.name })

    const goalIds = Object.keys(goalMap)
    if (goalIds.length > 0) {
      const { data: deps } = await supabase
        .from('savings_deposits')
        .select('id, goal_id, amount, deposited_at, note, is_withdrawal')
        .in('goal_id', goalIds)
        .gte('deposited_at', dateFrom)
        .lte('deposited_at', dateTo)
      ;(deps ?? []).forEach(r => {
        all.push({
          id: r.id, date: toYMD(r.deposited_at), type: 'epargne',
          label: goalMap[r.goal_id] ?? 'Épargne',
          sublabel: r.note || (r.is_withdrawal ? 'Retrait' : 'Dépôt'),
          amount: Number(r.amount),
          isNegative: !r.is_withdrawal, // dépôt = sortie de poche
        })
      })
    }

    // Tri anti-chronologique global
    all.sort((a, b) => b.date.localeCompare(a.date) || 0)
    setEvents(all)
    // Ouvrir tous les jours par défaut si peu de résultats
    if (all.length <= 20) {
      const days = new Set(all.map(e => e.date))
      setExpandedDays(days)
    } else {
      setExpandedDays(new Set())
    }
    setLoading(false)
  }

  // ── Groupement par jour ───────────────────────────────────────────────────
  const filtered = activeFilter === 'all' ? events : events.filter(e => e.type === activeFilter)

  const dayGroups: DayGroup[] = useMemo(() => {
    const map: Record<string, HistoriqueEvent[]> = {}
    for (const e of filtered) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, evts]) => ({
        date,
        label: formatDayLabel(date),
        events: evts,
      }))
  }, [filtered])

  // ── Totaux (toujours sur events complet, pas filtered) ───────────────────
  const totals = useMemo(() => {
    const t = { expense: 0, income: 0, facture: 0, dette: 0, epargne: 0 }
    for (const e of events) t[e.type] += e.amount
    return t
  }, [events])

  const totalOut = totals.expense + totals.facture + totals.dette + totals.epargne
  const totalIn  = totals.income

  function handleCardClick(type: EventType | 'all') {
    setActiveFilter(prev => prev === type ? 'all' : type)
    // Réinitialise l'expand pour que l'utilisateur voit la liste proprement
    setExpandedDays(new Set())
  }

  function toggleDay(date: string) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── En-tête ── */}
      <div>
        <h1 className="text-xl font-bold text-ink">Historique</h1>
        <p className="text-sm text-ink-soft mt-0.5">Toutes tes opérations sur une période</p>
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
          {monthOptions().map(m => (
            <option key={m.ym} value={m.ym}>{m.label}</option>
          ))}
        </select>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Du</label>
            <input className="input" type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}/>
          </div>
          <div>
            <label className="label">Au</label>
            <input className="input" type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}/>
          </div>
        </div>
      )}

      {/* ── Cartes cliquables (totaux + filtre en un) ── */}
      {events.length > 0 && (
        <div className="space-y-2">
          {/* Ligne 1 : Revenus + Sorties totales */}
          <div className="grid grid-cols-2 gap-2">
            {/* Carte Revenus */}
            <button
              onClick={() => handleCardClick('income')}
              className={`card text-center py-3 transition-all active:scale-[0.97] border-2 ${
                activeFilter === 'income'
                  ? 'bg-positive text-white border-positive shadow-md'
                  : 'bg-positive-light border-positive/20'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wide ${activeFilter === 'income' ? 'text-white/80' : 'text-positive'}`}>
                💰 Revenus {activeFilter === 'income' ? '✓' : ''}
              </p>
              <p className={`text-xl font-bold font-mono mt-1 ${activeFilter === 'income' ? 'text-white' : 'text-positive'}`}>
                +{formatAmount(totals.income)}
              </p>
              <p className={`text-[10px] mt-0.5 ${activeFilter === 'income' ? 'text-white/70' : 'text-positive/60'}`}>
                {events.filter(e => e.type === 'income').length} opération{events.filter(e => e.type === 'income').length > 1 ? 's' : ''}
              </p>
            </button>

            {/* Carte Toutes sorties */}
            <button
              onClick={() => handleCardClick('all')}
              className={`card text-center py-3 transition-all active:scale-[0.97] border-2 ${
                activeFilter === 'all'
                  ? 'bg-ink text-white border-ink shadow-md'
                  : 'bg-danger-light border-danger/20'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wide ${activeFilter === 'all' ? 'text-white/80' : 'text-danger'}`}>
                📊 Tout voir {activeFilter === 'all' ? '✓' : ''}
              </p>
              <p className={`text-xl font-bold font-mono mt-1 ${activeFilter === 'all' ? 'text-white' : 'text-danger'}`}>
                −{formatAmount(totalOut)}
              </p>
              <p className={`text-[10px] mt-0.5 ${activeFilter === 'all' ? 'text-white/70' : 'text-danger/60'}`}>
                {events.length} opérations
              </p>
            </button>
          </div>

          {/* Ligne 2 : détail par type de sortie */}
          <div className="grid grid-cols-3 gap-2">
            {(['expense', 'facture', 'dette', 'epargne'] as EventType[]).map(type => {
              const cfg = TYPE_CONFIG[type]
              const count = events.filter(e => e.type === type).length
              const amt = totals[type]
              if (count === 0) return null
              const isActive = activeFilter === type
              return (
                <button
                  key={type}
                  onClick={() => handleCardClick(type)}
                  className={`card text-center py-2.5 transition-all active:scale-[0.97] border-2 ${
                    isActive
                      ? `border-current shadow-md ${cfg.color} ${cfg.bg}`
                      : `${cfg.bg} ${cfg.border}`
                  }`}
                  style={isActive ? { boxShadow: '0 0 0 2px currentColor' } : {}}
                >
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${cfg.color}`}>
                    {cfg.emoji} {cfg.label} {isActive ? '✓' : ''}
                  </p>
                  <p className={`text-sm font-bold font-mono mt-0.5 ${cfg.color}`}>
                    {formatAmount(amt)}
                  </p>
                  <p className={`text-[10px] mt-0.5 opacity-60 ${cfg.color}`}>
                    {count} op.
                  </p>
                </button>
              )
            })}
          </div>

          {/* Indication filtre actif */}
          {activeFilter !== 'all' && (
            <div className="flex items-center justify-between px-3 py-2 bg-mist rounded-xl">
              <p className="text-xs text-ink-soft">
                Filtre actif : <strong className="text-ink">{TYPE_CONFIG[activeFilter].emoji} {TYPE_CONFIG[activeFilter].label}</strong>
                {' '}· {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
              </p>
              <button onClick={() => setActiveFilter('all')} className="text-xs font-bold text-accent">
                Tout voir
              </button>
            </div>
          )}
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
        <div className="card text-center py-10 text-ink-soft">
          <p className="text-2xl mb-2 animate-pulse">⏳</p>
          <p className="text-sm">Chargement...</p>
        </div>
      )}

      {canLoad && !loading && events.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🕳️</p>
          <p className="font-semibold text-ink">Aucune opération sur cette période</p>
          <p className="text-sm text-ink-soft mt-1">Essaie une autre plage de dates</p>
        </div>
      )}

      {/* ── Liste groupée par jour ── */}
      {!loading && dayGroups.length > 0 && (
        <div className="space-y-2">
          {dayGroups.map(group => {
            const isOpen = expandedDays.has(group.date)
            const dayTotal = group.events.reduce((s, e) => e.isNegative ? s - e.amount : s + e.amount, 0)

            return (
              <div key={group.date} className="rounded-2xl border border-mist-dark overflow-hidden bg-white">
                {/* Header du jour */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-mist hover:bg-mist-dark transition-colors"
                  onClick={() => toggleDay(group.date)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                      <span className="text-sm font-bold text-ink">
                        {group.date.split('-')[2]}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-ink capitalize">{group.label}</p>
                      <p className="text-xs text-ink-soft">{group.events.length} opération{group.events.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`font-mono text-sm font-bold ${dayTotal >= 0 ? 'text-positive' : 'text-danger'}`}>
                      {dayTotal >= 0 ? '+' : ''}{formatAmount(dayTotal)}
                    </span>
                    {isOpen
                      ? <ChevronUp size={16} className="text-ink-soft"/>
                      : <ChevronDown size={16} className="text-ink-soft"/>
                    }
                  </div>
                </button>

                {/* Événements du jour */}
                {isOpen && (
                  <div>
                    {group.events.map((ev, idx) => {
                      const cfg = TYPE_CONFIG[ev.type]
                      return (
                        <div
                          key={ev.id}
                          className={`flex items-center gap-3 px-4 py-3 ${idx < group.events.length - 1 ? 'border-b border-mist' : ''}`}
                        >
                          {/* Icône type */}
                          <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-base">{cfg.emoji}</span>
                          </div>

                          {/* Infos */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink truncate">{ev.label}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                                {cfg.label}
                              </span>
                              {ev.sublabel && ev.sublabel !== ev.label && (
                                <span className="text-[10px] text-ink-soft">{ev.sublabel}</span>
                              )}
                            </div>
                          </div>

                          {/* Montant */}
                          <p className={`font-mono text-sm font-bold flex-shrink-0 ${ev.isNegative ? 'text-danger' : 'text-positive'}`}>
                            {ev.isNegative ? '−' : '+'}{formatAmount(ev.amount)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Total période */}
          <div className="card bg-ink flex items-center justify-between py-3 px-4 rounded-2xl">
            <span className="text-xs text-white/70 font-semibold uppercase tracking-wide">Solde net période</span>
            <span className={`font-mono font-bold text-base ${totalIn - totalOut >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalIn - totalOut >= 0 ? '+' : ''}{formatAmount(totalIn - totalOut)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
