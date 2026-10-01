'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Pencil } from 'lucide-react'
import {
  Transaction, BudgetCategory,
  getBudgets, addBudget, updateBudget, deleteBudget,
  formatAmount,
} from '@/lib/storage'
import CoachTip from '../../CoachTip'
import { budgetStatus, isoDate } from '@/lib/finance'
import { useSpendingLines } from '@/lib/useSpendingLines'
import {
  sumByCategory, sumCategory, durationLabel, BUDGET_DURATIONS,
  budgetCycle, isCustomBudget,
} from '@/lib/budgetPeriods'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'
import { useCustomCategories, CategoryManager } from './categories'

const COLORS = ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#10B981','#F97316']

// ─── Budget ───────────────────────────────────────────────────────────────────
const fmtDay = (ymd: string) => new Date(ymd).toLocaleDateString('fr-FR')

export function BudgetSection({ transactions }: { transactions: Transaction[] }) {
  const [budgets, setBudgets] = useState<BudgetCategory[] | null>(null)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingBudget, setEditingBudget] = useState<BudgetCategory | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const today = isoDate(new Date())
  const [form, setForm] = useState({
    name: '', limit: '', color: COLORS[0], periodMonths: 1,
    custom: false, startDate: today, endDate: '',
  })

  // Filtre de période
  const periodState = usePeriod()
  const { period, range } = periodState

  async function loadBudgets() {
    try { setBudgets(await getBudgets()); setBudgetError(null) }
    catch (e) { setBudgetError(e instanceof Error ? e.message : 'Erreur de chargement') }
  }
  useEffect(() => { loadBudgets() }, [])

  // Cycle courant de chaque plafond + plage de données à charger
  const rows = (budgets ?? []).map(b => ({ b, cycle: budgetCycle(b), isCustom: isCustomBudget(b) }))
  const minFrom = range.from < '2000-01-01' ? '2000-01-01' : range.from
  const fetchFrom = budgets ? rows.reduce((m, r) => (r.cycle.from < m ? r.cycle.from : m), minFrom) : null
  const { lines, loaded, error, reload } = useSpendingLines(fetchFrom, transactions)

  const { customCategories, addCustom, removeCustom, renameCustom } = useCustomCategories(() => { loadBudgets(); reload() })

  const periodByCat = sumByCategory(lines, range.from, range.to)
  const periodTotal = Object.values(periodByCat).reduce((s, v) => s + v, 0)

    const items = rows.map(({ b, cycle, isCustom }) => {
    const spent = sumCategory(lines, b.name, cycle.from, cycle.to)
    const { pct, status } = budgetStatus(spent, b.limit)
    return { b, cycle, isCustom, spent, pct, status, periodSpent: periodByCat[b.name] || 0 }
  })
  const overBudget = items.filter(i => i.status === 'over')

  const tip = overBudget.length > 0
    ? `⚠️ Tu dépasses le plafond en : ${overBudget.map(i => i.b.name).join(', ')}. Réduis ces dépenses !`
    : items.length > 0 ? `✅ Tous tes budgets sont respectés. Continue !`
    : `Crée un plafond par catégorie pour mieux contrôler où va ton argent.`

    function openAdd() {
    setEditingBudget(null); setFormError(null)
    setForm({ name: '', limit: '', color: COLORS[0], periodMonths: 1, custom: false, startDate: today, endDate: '' })
    setShowForm(true)
  }
  function openEdit(b: BudgetCategory) {
  const custom = isCustomBudget(b)
  setEditingBudget(b); setFormError(null)
  setForm({
    name: b.name, limit: String(b.limit), color: b.color, periodMonths: b.periodMonths ?? 1,
    custom, startDate: custom ? b.startDate! : today, endDate: custom ? b.endDate! : '',
  })
  setShowForm(true)
}
  function closeForm() {
    setShowForm(false); setEditingBudget(null); setFormError(null)
  }

  async function handleSave() {
    if (saving || !form.name || !form.limit || Number(form.limit) <= 0) return
    const isDuplicate = (budgets ?? []).some(b => b.name === form.name && (!editingBudget || b.id !== editingBudget.id))
        if (isDuplicate) { setFormError('Un plafond existe déjà pour cette catégorie.'); return }
    if (form.custom) {
      if (!form.startDate || !form.endDate) { setFormError('Choisis une date de début et une date de fin.'); return }
      if (form.endDate < form.startDate) { setFormError('La date de fin doit être après la date de début.'); return }
    }

    setSaving(true); setFormError(null)
    try {
      const payload = {
        name: form.name, limit: Number(form.limit), color: form.color,
        periodMonths: form.custom ? 1 : form.periodMonths,
        startDate: form.custom ? form.startDate : null,
        endDate: form.custom ? form.endDate : null,
      }
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
            <strong>Un plafond = ta limite de dépenses pour une catégorie</strong>, sur une durée (1 mois à 3 ans, renouvelée automatiquement) ou sur <strong>une plage de dates perso</strong> (début et fin choisis par toi).
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
      ) : items.map(({ b, cycle, isCustom, spent, pct: rawPct, status, periodSpent }) => {
        const pct  = Math.min(100, rawPct)
        const over = status === 'over'
        const near = status === 'near'
        const ended = isCustom && cycle.to < today
        const notStarted = isCustom && cycle.from > today

        return (
          <div key={b.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }}/>
                 <span className="font-semibold text-sm text-ink">{b.name}</span>
                {isCustom && <span className="text-[10px] bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-bold">📅 Perso</span>}
                {ended && <span className="text-[10px] bg-mist text-ink-soft px-1.5 py-0.5 rounded-full font-bold">Terminé</span>}
                {notStarted && <span className="text-[10px] bg-blue-50 text-accent px-1.5 py-0.5 rounded-full font-bold">⏳ À venir</span>}
                 {over && <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-bold">⚠️ Dépassé</span>}
                {near && <span className="text-xs bg-warning-light text-warning px-2 py-0.5 rounded-full font-bold">Attention</span>}
              </div>
              <div className="flex gap-1">
                <button className="w-8 h-8 rounded-xl bg-mist hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center" onClick={() => openEdit(b)}><Pencil size={14}/></button>
                <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center" onClick={() => handleDelete(b.id)}><Trash2 size={14}/></button>
              </div>
            </div>
                        <p className="text-[11px] text-ink-soft">
              🗓️ {isCustom ? 'Plafond perso' : `Plafond sur ${durationLabel(b.periodMonths ?? 1)}`} · du {fmtDay(cycle.from)} au {fmtDay(cycle.to)}
            </p>
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
                  <button key={d.months} type="button"
                    onClick={() => setForm(f => ({...f, periodMonths: d.months, custom: false}))}
                    className={`py-2 rounded-xl text-[11px] font-bold border-2 transition-colors ${
                      !form.custom && form.periodMonths === d.months ? 'bg-orange-500 text-white border-transparent' : 'bg-white text-ink-soft border-mist-dark'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setForm(f => ({...f, custom: true}))}
                className={`mt-1.5 w-full py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                  form.custom ? 'bg-orange-500 text-white border-transparent' : 'bg-white text-ink-soft border-mist-dark'}`}>
                📅 Plage de dates perso
              </button>
              {form.custom ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="label">Du</label>
                      <input className="input" type="date" value={form.startDate}
                        onChange={e => setForm(f => ({...f, startDate: e.target.value}))}/>
                    </div>
                    <div>
                      <label className="label">Au</label>
                      <input className="input" type="date" value={form.endDate} min={form.startDate || undefined}
                        onChange={e => setForm(f => ({...f, endDate: e.target.value}))}/>
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-soft mt-1.5">Les dates sont incluses. Le plafond ne se renouvelle pas à la fin de la plage.</p>
                </>
              ) : (
                <p className="text-[11px] text-ink-soft mt-1.5">Démarre à la création et se renouvelle à la fin de chaque durée.</p>
              )}
            </div>
            <div>
              <label className="label">Plafond {form.custom ? 'sur cette plage' : `sur ${durationLabel(form.periodMonths)}`} (Rs)</label>
              <input className="input" type="number" placeholder="Ex: 15000" value={form.limit} onChange={e => setForm(f => ({...f, limit: e.target.value}))}/>
            </div>
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
