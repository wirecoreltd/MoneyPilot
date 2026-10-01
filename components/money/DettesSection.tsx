'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Pencil, History, ChevronDown, Check, ChevronRight } from 'lucide-react'
import {
  Debt,
  getDebts, addDebt, updateDebt, deleteDebt,
  formatAmount, currentYearMonth, hasStarted,
} from '@/lib/storage'
import CoachTip from '../../CoachTip'
import { supabase } from '@/lib/supabase'
import { readSpaceId, requireWritableSpaceId } from '@/lib/activeSpace'
import { debtEndLabel } from '@/lib/finance'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'
import { useCustomCategories, CategoryManager } from './categories'

const startLabel = (ymd: string) => new Date(ymd).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

interface DebtPaymentHistory {
  id: string
  debtId: string
  amount: number
  paidAt: string
  note?: string
  category?: string
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
  let query = supabase.from('debt_creditors').select('*')
  const spaceId = readSpaceId()
  if (spaceId) query = query.eq('space_id', spaceId)
  const { data, error } = await query.order('name')
  if (error) throw error
  return (data ?? []).map(r => ({ id: r.id, name: r.name }))
}
async function saveCreditor(name: string): Promise<{ id: string; name: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  const spaceId = requireWritableSpaceId()
  const { data, error } = await supabase.from('debt_creditors').insert({ name, user_id: user!.id, space_id: spaceId }).select().single()
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
    } catch (e) {
      const msg = e instanceof Error && e.message.startsWith('Choisis') ? e.message : null
      window.alert(msg ?? "Impossible d'ajouter le créancier. Réessaie.")
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

export function DettesSection() {
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
    let debtsQuery = supabase.from('debts').select('id').eq('user_id', user.id)
    const spaceId = readSpaceId()
    if (spaceId) debtsQuery = debtsQuery.eq('space_id', spaceId)
    const { data: userDebts, error: debtsError } = await debtsQuery
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
      } catch (e) {
        const msg = e instanceof Error && e.message.startsWith('Choisis') ? e.message : null
        window.alert(msg ?? "Impossible d'ajouter la dette. Réessaie.")
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
