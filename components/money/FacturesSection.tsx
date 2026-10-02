'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Pencil, History, Check, ChevronDown } from 'lucide-react'
import { formatAmount, currentYearMonth } from '@/lib/storage'
import CoachTip from '../../CoachTip'
import { supabase } from '@/lib/supabase'
import { readSpaceId, requireWritableSpaceId } from '@/lib/activeSpace'
import { estimateVariableAmount, isoDate, monthLabel } from '@/lib/finance'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'
import { DEFAULT_CATEGORIES, useCustomCategories, CategoryManager } from './categories'

interface Facture {
  id: string
  name: string
  amount: number | null
  estimate?: number
  amountVariable: boolean
  dueDate?: string
  isRecurring: boolean
  category: string
  paid: boolean
  month: string
  note?: string
  createdAt?: string
  spaceId: string
  rangePaid?: number   // montant payé dans la période (utile quand le montant de la facture est inconnu)
}

interface FacturePayment {
  id: string
  factureId: string
  amount: number
  paidAt: string
  note?: string
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
// Une facture apparaît dans une période si son échéance, sa date de création (heure locale) OU l'un de ses paiements y tombe.
// (Avant, seule la date de création comptait : une facture due le 25/09 mais créée plus tard n'apparaissait pas.)
function factureInRange(f: Facture, from: string, to: string, payments: FacturePayment[] = []): boolean {
  const dates: string[] = payments.map(p => String(p.paidAt).slice(0, 10))
  if (f.dueDate) dates.push(f.dueDate.slice(0, 10))
  if (f.createdAt) { const c = new Date(f.createdAt); if (!isNaN(c.getTime())) dates.push(isoDate(c)) }
  if (!f.dueDate && !f.createdAt) dates.push(`${f.month}-01`)
  return dates.some(d => d >= from && d <= to)
}

// Non payées en haut, puis ordre alphabétique (accents gérés)
function sortFactures(list: Facture[]): Facture[] {
  return [...list].sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  })
}

export function FacturesSection() {
  const [factures, setFactures] = useState<Facture[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingFacture, setEditingFacture] = useState<Facture | null>(null)
  const [saving, setSaving] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(isoDate(new Date()))
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
    dueDate: '', dueDayOfMonth: '', isRecurring: false, amountVariable: false, note: '',
  })
  const ym = currentYearMonth()

  useEffect(() => { loadFactures() }, [])

  async function loadFactures() {
    setLoading(true)
    setLoadError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // Toutes les factures de l'utilisateur : le filtre de période se fait côté client
      let query = supabase.from('factures').select('*').eq('user_id', user!.id)
      const spaceId = readSpaceId()
      if (spaceId) query = query.eq('space_id', spaceId)
      const { data, error } = await query.order('created_at', { ascending: true })
      if (error) throw error
      const rows = data ?? []
      // Paiements de toutes les factures en une requête : permet d'afficher « payé en <mois> » sans ouvrir l'historique
      const ids = rows.map(r => r.id as string)
      if (ids.length > 0) {
        const { data: pays, error: payErr } = await supabase.from('facture_payment_history').select('*')
          .in('facture_id', ids).order('paid_at', { ascending: false })
        if (payErr) throw payErr
        const map: Record<string, FacturePayment[]> = Object.fromEntries(ids.map(id => [id, [] as FacturePayment[]]))
        for (const r of pays ?? []) {
          map[r.facture_id]?.push({ id: r.id, factureId: r.facture_id, amount: Number(r.amount), paidAt: r.paid_at, note: r.note ?? undefined })
        }
        setPaymentsMap(map)
      } else {
        setPaymentsMap({})
      }
      const history = rows.map(r => ({ name: r.name as string, amount: r.amount == null ? null : Number(r.amount), month: r.month as string }))
      setFactures(rows.map(r => {
        const amount = r.amount == null ? null : Number(r.amount)
        return {
          id: r.id, name: r.name, amount,
          estimate: amount === null ? estimateVariableAmount(history, r.name, r.month) : undefined,
          amountVariable: r.amount_variable ?? false,
          dueDate: r.due_date ?? undefined, isRecurring: r.is_recurring ?? false,
          category: r.category ?? DEFAULT_CATEGORIES[0], paid: r.paid ?? false,
          month: r.month, note: r.note ?? undefined,
          createdAt: r.created_at ?? undefined,
          spaceId: r.space_id,
        }
      }))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement')
    }
    setLoading(false)
  }

  function resetForm() {
    setForm({ name: '', amount: '', category: DEFAULT_CATEGORIES[0], dueDate: '', dueDayOfMonth: '', isRecurring: false, amountVariable: false, note: '' })
    setEditingFacture(null)
  }

  function openEdit(f: Facture) {
    setEditingFacture(f)
    const dayOfMonth = f.dueDate ? new Date(f.dueDate).getDate().toString() : ''
    setForm({
      name: f.name, amount: f.amount === null ? '' : String(f.amount), category: f.category,
      dueDate: f.dueDate ?? '', dueDayOfMonth: f.isRecurring ? dayOfMonth : '',
      isRecurring: f.isRecurring, amountVariable: f.amountVariable, note: f.note ?? '',
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
    if (!form.name.trim()) return
    const hasAmount = !!form.amount && Number(form.amount) > 0
    // Le montant n'est obligatoire que pour une facture ponctuelle (une récurrente peut avoir un montant variable)
    if (!form.isRecurring && !hasAmount) return
    if (form.amount && Number(form.amount) < 0) return
    const amountValue: number | null = hasAmount ? Number(form.amount) : null
    const amountVariable = form.isRecurring && (form.amountVariable || amountValue === null)
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const dueDate = form.isRecurring ? computeDueDate(form.dueDayOfMonth, ym) : (form.dueDate || null)

      if (editingFacture) {
        const editing = editingFacture
        const newName = form.name.trim()

        const { error } = await supabase.from('factures').update({
          name: newName, amount: amountValue, amount_variable: amountVariable, category: form.category,
          due_date: dueDate, is_recurring: form.isRecurring, note: form.note || null,
          ...(amountValue === null ? { paid: false } : {}),
        }).eq('id', editing.id)
        if (error) throw error

        // Facture récurrente renommée : on renomme aussi les autres occurrences récurrentes
        if (editing.isRecurring && editing.name !== newName) {
          const { error: renameError } = await supabase.from('factures').update({ name: newName })
            .eq('user_id', user!.id).eq('space_id', editing.spaceId).eq('name', editing.name).eq('is_recurring', true)
          if (renameError) throw renameError
          setFactures(prev => prev.map(x =>
            x.spaceId === editing.spaceId && x.isRecurring && x.name === editing.name ? { ...x, name: newName } : x
          ))
        }

        setFactures(prev => prev.map(f => f.id === editing.id ? {
          ...f, name: newName, amount: amountValue, amountVariable, category: form.category,
          estimate: amountValue === null ? (f.estimate ?? 0) : undefined,
          paid: amountValue === null ? false : f.paid,
          dueDate: dueDate ?? undefined, isRecurring: form.isRecurring, note: form.note || undefined,
        } : f))
      } else {
        const spaceId = requireWritableSpaceId()
        const { data, error } = await supabase.from('factures').insert({
          space_id: spaceId,
          user_id: user!.id, name: form.name.trim(), amount: amountValue, amount_variable: amountVariable,
          category: form.category, due_date: dueDate, is_recurring: form.isRecurring,
          note: form.note || null, paid: false, month: ym,
        }).select().single()
        if (error) throw error
        if (data) {
          setFactures(prev => [...prev, {
            id: data.id, name: data.name, amount: data.amount == null ? null : Number(data.amount),
            estimate: data.amount == null
              ? estimateVariableAmount(factures.map(x => ({ name: x.name, amount: x.amount, month: x.month })), data.name, data.month)
              : undefined,
            amountVariable: data.amount_variable ?? false,
            dueDate: data.due_date ?? undefined, isRecurring: data.is_recurring,
            category: data.category, paid: data.paid, month: data.month, note: data.note ?? undefined,
            createdAt: data.created_at ?? new Date().toISOString(),
            spaceId: data.space_id,
          }])
        }
      }
      resetForm(); setShowForm(false)
    } catch (e) {
      const msg = e instanceof Error && e.message.startsWith('Choisis') ? e.message : null
      window.alert(msg ?? (editingFacture ? 'Impossible de modifier la facture. Réessaie.' : "Impossible d'ajouter la facture. Réessaie."))
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
          .eq('user_id', user!.id).eq('space_id', f.spaceId).eq('name', f.name).eq('is_recurring', true)
        if (stopError) throw stopError
        setFactures(prev => prev.map(x => x.spaceId === f.spaceId && x.name === f.name ? { ...x, isRecurring: false } : x))
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
    if (!facture || facture.amount === null) return   // montant inconnu : statut déduit des paiements du mois (voir `visible`)
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
      // Le paiement est enregistré à part : il ne modifie jamais le montant de la facture
      await syncPaidStatus(factureId)
      setPayingId(null); setPayAmount('')
      setPayDate(isoDate(new Date())); setPayNote('')
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
    return factureInRange(f, range.from, range.to, paymentsMap[f.id] ?? [])
  }).map(f => f.amount === null
    // Montant variable : "payée" seulement si un paiement est daté dans la période choisie
    ? (() => {
        const inP = (paymentsMap[f.id] ?? []).filter(p => String(p.paidAt).slice(0, 10) >= range.from && String(p.paidAt).slice(0, 10) <= range.to)
        return { ...f, paid: inP.length > 0, rangePaid: inP.reduce((s, p) => s + p.amount, 0) }
      })()
    : f)

  const paidCount = visible.filter(f => f.paid).length
  // PAYÉ = somme des paiements réellement datés dans la période (même règle que la tuile « Factures » de l'Accueil).
  // Avant : on additionnait le montant entier des factures marquées payées, d'où des chiffres différents.
  const inPeriod = (d: unknown) => { const x = String(d).slice(0, 10); return x >= range.from && x <= range.to }
  const paidAmount = visible.reduce((s, f) =>
    s + (paymentsMap[f.id] ?? []).filter(p => inPeriod(p.paidAt)).reduce((a, p) => a + p.amount, 0), 0)
  // RESTANT = ce qu'il reste à payer sur les factures non payées (estimation si le montant est inconnu)
  const remainingOf = (f: Facture) => {
    if (f.paid) return 0
    if (f.amount === null) return f.estimate ?? 0
    const paidSoFar = (paymentsMap[f.id] ?? []).reduce((a, p) => a + p.amount, 0)
    return Math.max(0, f.amount - paidSoFar)
  }
  const unpaidAmount = visible.reduce((s, f) => s + remainingOf(f), 0)
  const totalAmount = paidAmount + unpaidAmount
  const awaiting = visible.filter(f => f.amount === null && !f.paid)
  const estimatedAmount = awaiting.reduce((s, f) => s + (f.estimate ?? 0), 0)
  // Liste : un titre par mois (le plus récent d'abord), puis « À payer » et « Payées »
  const monthGroups = Array.from(new Set(visible.map(f => f.month))).sort().reverse().map(m => {
    const inMonth = visible.filter(f => f.month === m)
    const toPay = sortFactures(inMonth.filter(f => !f.paid))
    const done = sortFactures(inMonth.filter(f => f.paid))
    return { month: m, toPay, done, remaining: toPay.reduce((s, f) => s + remainingOf(f), 0) }
  })

  const tip = visible.length === 0
    ? `Ajoute tes factures (eau, élec, internet...) pour ne rien oublier.`
    : paidCount === visible.length
    ? `✅ Toutes tes factures sont payées sur ${PERIOD_LABEL[period]} ! Bien joué.`
    : `⏳ ${visible.length - paidCount} facture${visible.length - paidCount > 1 ? 's' : ''} en attente · ${awaiting.length > 0 ? '~' : ''}${formatAmount(unpaidAmount)} à payer`

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
        payments={paymentsMap[f.id] ?? []} range={range} showHistory={openHistoryId === f.id}
        historyLoading={historyLoading && openHistoryId === f.id && !paymentsMap[f.id]}
        onToggleHistory={() => toggleHistory(f.id)} payingId={payingId}
        payAmount={payAmount} payDate={payDate} payNote={payNote}
        onSetPayingId={(id) => { setPayingId(id); setPayAmount(''); setPayDate(isoDate(new Date())); setPayNote('') }}
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

      {awaiting.length > 0 && (
        <p className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-2xl px-3 py-2">
          ⏳ {awaiting.length} facture{awaiting.length > 1 ? 's' : ''} au montant pas encore connu
          {estimatedAmount > 0 ? <> · <strong>~{formatAmount(estimatedAmount)}</strong> estimés dans le total</> : " · pas encore d'historique pour estimer"}
        </p>
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
          {monthGroups.map(g => (
            <div key={g.month} className="space-y-2">
              <div className="flex items-baseline justify-between pt-1">
                <p className="text-sm font-bold text-ink capitalize">{g.month ? monthLabel(g.month) : 'Sans mois'}</p>
                <p className="text-xs text-ink-soft">{g.toPay.length > 0 ? `reste ${g.toPay.some(f => f.amount === null) ? '~' : ''}${formatAmount(g.remaining)}` : 'tout payé'}</p>
              </div>
              {g.toPay.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">À payer · {g.toPay.length}</p>
                  {g.toPay.map(renderCard)}
                </div>
              )}
              {g.done.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Payées · {g.done.length}</p>
                  {g.done.map(renderCard)}
                </div>
              )}
            </div>
          ))}
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
            {form.isRecurring && (
              <div className="flex items-center justify-between p-3 bg-mist rounded-2xl border border-mist-dark">
                <div className="pr-3">
                  <p className="text-sm font-bold text-ink">📈 Montant variable</p>
                  <p className="text-xs text-ink-soft mt-0.5">Change chaque mois (eau, élec...). Le montant n'est pas recopié : tu le saisis quand la facture arrive.</p>
                </div>
                <button onClick={() => setForm(f => ({ ...f, amountVariable: !f.amountVariable }))}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${form.amountVariable ? 'bg-yellow-500' : 'bg-mist-dark'}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.amountVariable ? 'left-7' : 'left-1'}`}/>
                </button>
              </div>
            )}
            <div>
              <label className="label">{form.isRecurring ? 'Montant (Rs) — optionnel' : 'Montant (Rs)'}</label>
              <input className="input" type="number" placeholder={form.isRecurring ? 'Laisse vide si tu ne le connais pas' : '0'} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}/>
              {form.isRecurring && !form.amount && (
                <p className="text-xs text-ink-soft mt-1">Sans montant, la facture est estimée d'après tes derniers paiements, puis tu saisis le vrai montant quand tu la paies.</p>
              )}
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
  facture: f, onEdit, onDelete, payments, range, showHistory, historyLoading,
  onToggleHistory, payingId, payAmount, payDate, payNote,
  onSetPayingId, onPayAmountChange, onPayDateChange, onPayNoteChange,
  onPay, onEditPayment, onDeletePayment,
}: {
  facture: Facture; onEdit: (f: Facture) => void; onDelete: (id: string) => void
  payments: FacturePayment[]; range: { from: string; to: string }; showHistory: boolean; historyLoading: boolean
  onToggleHistory: () => void; payingId: string | null
  payAmount: string; payDate: string; payNote: string
  onSetPayingId: (id: string) => void; onPayAmountChange: (v: string) => void
  onPayDateChange: (v: string) => void; onPayNoteChange: (v: string) => void
  onPay: () => void; onEditPayment: (p: FacturePayment) => void
  onDeletePayment: (p: FacturePayment) => void
}) {
  const [showAllHistory, setShowAllHistory] = useState(false)
  const isDue = f.dueDate ? new Date(f.dueDate) < new Date() && !f.paid : false
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const unknown = f.amount === null
  const amt = f.amount ?? 0
  const remaining = unknown ? (f.estimate ?? 0) : Math.max(0, amt - totalPaid)
  const isPaying = payingId === f.id
  const overpaid = !unknown && totalPaid > amt ? totalPaid - amt : 0
  // Distinction : paiements datés dans le mois de la facture vs. hors de ce mois
  const inRange = payments.filter(p => String(p.paidAt).slice(0, 10) >= range.from && String(p.paidAt).slice(0, 10) <= range.to)
  const outRange = payments.filter(p => !(String(p.paidAt).slice(0, 10) >= range.from && String(p.paidAt).slice(0, 10) <= range.to))
  const totalRange = inRange.reduce((s, p) => s + p.amount, 0)
  const lastPay = inRange[0] // trié du plus récent au plus ancien
  const shownPayments = showAllHistory ? payments : inRange
  const isInRange = (p: FacturePayment) => String(p.paidAt).slice(0, 10) >= range.from && String(p.paidAt).slice(0, 10) <= range.to
  const shortDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

  // Facture payée et repliée : une seule ligne. Un clic ouvre la carte complète (historique, modifier, ajouter un paiement).
  if (f.paid && !showHistory && !isPaying) {
    const last = inRange[0] ?? payments[0]
    const shownTotal = totalRange > 0 ? totalRange : totalPaid > 0 ? totalPaid : amt
    return (
      <button type="button" onClick={onToggleHistory}
        className="card w-full flex items-center gap-3 text-left active:scale-[0.99] transition-all !py-2.5">
        <span className="w-6 h-6 rounded-full bg-positive-light text-positive flex items-center justify-center flex-shrink-0"><Check size={14}/></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{f.name}{f.isRecurring && <span className="ml-1 text-xs" title="Récurrente">🔄</span>}</p>
          <p className="text-xs text-ink-soft">
            {last ? `Payé le ${shortDate(last.paidAt)}${inRange.length > 1 ? ` · ${inRange.length}×` : ''}${inRange.length === 0 ? ' (hors période)' : ''}` : 'Payée'}
          </p>
        </div>
        <p className="font-mono font-bold text-sm text-ink">{formatAmount(shownTotal)}</p>
        <ChevronDown size={16} className="text-ink-soft flex-shrink-0"/>
      </button>
    )
  }

  return (
    <div className={`card space-y-3 transition-all border-l-4 ${isDue ? 'border-l-danger' : f.paid ? 'border-l-positive' : 'border-l-transparent'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {((isDue && !f.paid) || outRange.length > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {isDue && !f.paid && <span className="text-[10px] bg-danger text-white px-1.5 py-0.5 rounded-full font-bold">En retard</span>}
              {outRange.length > 0 && <span className="text-[10px] bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-bold">🕓 {outRange.length} paiement{outRange.length > 1 ? 's' : ''} hors période</span>}
            </div>
          )}
          <p className={`text-sm font-semibold ${f.paid ? 'line-through text-ink-soft' : 'text-ink'}`}>{f.name}{f.isRecurring && <span className="ml-1 text-xs no-underline" title="Récurrente">🔄</span>}</p>
          {(!unknown || f.dueDate) && (
            <p className="text-xs text-ink-soft mt-0.5">
              {[!unknown ? f.category : null, f.dueDate ? `échéance ${new Date(f.dueDate).toLocaleDateString('fr-FR')}` : null].filter(Boolean).join(' · ')}
            </p>
          )}
          {totalRange > 0 && <p className="text-sm font-mono font-bold text-positive mt-1">Total payé : {formatAmount(totalRange)}</p>}
          {(lastPay || f.note) && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {lastPay && <span className="text-xs text-accent">💸 Dernier paiement : {shortDate(lastPay.paidAt)}</span>}
              {f.note && <span className="text-xs text-ink-soft italic">{f.note}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {unknown ? (
            <p className="font-mono font-bold text-base text-ink-soft">{(f.estimate ?? 0) > 0 ? `~${formatAmount(f.estimate ?? 0)}` : '—'}</p>
          ) : (
            <p className="font-mono font-bold text-base text-ink">{formatAmount(amt)}</p>
          )}
          {unknown && (f.estimate ?? 0) > 0 && <p className="text-[10px] text-ink-soft">estimé</p>}
          {totalPaid > 0 && !f.paid && !unknown && <p className="text-xs font-mono text-positive">+{formatAmount(totalPaid)} payé</p>}
          <div className="flex gap-1 mt-0.5">
            <button className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${showHistory ? 'bg-yellow-500 text-white' : 'bg-mist hover:bg-yellow-50 text-ink-soft hover:text-yellow-600'}`} onClick={onToggleHistory}><History size={14}/></button>
            <button className="w-8 h-8 rounded-xl bg-mist hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center" onClick={() => onEdit(f)}><Pencil size={14}/></button>
            <button className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center" onClick={() => onDelete(f.id)}><Trash2 size={14}/></button>
          </div>
        </div>
      </div>

      {totalPaid > 0 && !unknown && !f.paid && (
        <div className="space-y-1">
          <div className="w-full h-2 bg-mist-dark rounded-full overflow-hidden">
            <div className="h-full bg-positive rounded-full transition-all duration-500" style={{ width: `${amt > 0 ? Math.min(100, (totalPaid / amt) * 100) : 0}%` }}/>
          </div>
          <div className="flex justify-between text-xs text-ink-soft">
            <span className="font-mono">{formatAmount(totalPaid)} payés</span>
            <span className="font-mono">{remaining > 0 ? `${formatAmount(remaining)} restant` : overpaid > 0 ? `✅ Soldée · +${formatAmount(overpaid)} en plus` : '✅ Soldée'}</span>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="bg-mist rounded-2xl overflow-hidden">
          <div className="px-3 py-2.5 border-b border-mist-dark flex items-center justify-between">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Historique</p>
            {shownPayments.length > 0 && <span className="text-xs font-mono font-bold text-positive">Total : {formatAmount(shownPayments.reduce((s, p) => s + p.amount, 0))}</span>}
          </div>
          {historyLoading ? (
            <p className="text-xs text-ink-soft text-center py-4">Chargement...</p>
          ) : shownPayments.length === 0 ? (
            <p className="text-xs text-ink-soft text-center italic py-4">{payments.length === 0 ? 'Aucun paiement enregistré' : 'Aucun paiement sur cette période'}</p>
          ) : shownPayments.map(p => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2.5 border-b border-mist-dark last:border-0 hover:bg-white transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono font-bold text-positive">+{formatAmount(p.amount)}</p>
                <p className="text-xs text-ink-soft">{new Date(p.paidAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}{!isInRange(p) && <span className="ml-1.5 text-[10px] text-orange-700">🕓 hors période</span>}</p>
                {p.note && <p className="text-xs text-ink-soft italic truncate">{p.note}</p>}
              </div>
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <button onClick={() => onEditPayment(p)} className="w-7 h-7 rounded-lg bg-white hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center"><Pencil size={12}/></button>
                <button onClick={() => onDeletePayment(p)} className="w-7 h-7 rounded-lg bg-white hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
          {outRange.length > 0 && (
            <button className="w-full py-2 text-xs font-bold text-ink-soft hover:text-ink border-t border-mist-dark" onClick={() => setShowAllHistory(v => !v)}>
              {showAllHistory ? 'Masquer les paiements hors période' : `Voir les ${outRange.length} paiement${outRange.length > 1 ? 's' : ''} hors période`}
            </button>
          )}
        </div>
      )}

      {isPaying ? (
        <div className="space-y-2 p-3 bg-yellow-50 rounded-2xl border border-yellow-200">
          <p className="text-xs font-bold text-yellow-800 uppercase tracking-wide">Enregistrer un paiement</p>
          {!unknown && remaining > 0 && remaining < amt && <p className="text-xs text-yellow-700">Restant à payer : <strong>{formatAmount(remaining)}</strong></p>}
          {!unknown && remaining === 0 && <p className="text-xs text-yellow-700">Cette facture est déjà soldée : ce paiement s'ajoutera <strong>en plus</strong>.</p>}
          <input className="input bg-white" type="number" placeholder="Montant payé (Rs)" value={payAmount} onChange={e => onPayAmountChange(e.target.value)} autoFocus/>
          <input className="input bg-white" type="date" value={payDate} onChange={e => onPayDateChange(e.target.value)}/>
          <input className="input bg-white" placeholder="📝 Note (optionnel)" value={payNote} onChange={e => onPayNoteChange(e.target.value)}/>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 bg-white" onClick={() => onSetPayingId('')}>Annuler</button>
            <button className="btn-primary flex-1" style={{ backgroundColor: '#CA8A04' }} onClick={onPay}>Enregistrer</button>
          </div>
        </div>
      ) : (
        <button
          className={`w-full py-2.5 text-sm font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 border ${
            f.paid
              ? 'text-ink-soft bg-white hover:bg-yellow-50 border-mist-dark'
              : 'text-yellow-800 bg-yellow-50 hover:bg-yellow-100 border-yellow-200'
          }`}
          onClick={() => onSetPayingId(f.id)}>
          <Plus size={15}/> {f.paid ? 'Ajouter un autre paiement' : 'Enregistrer un paiement'}
        </button>
      )}
    </div>
  )
}
