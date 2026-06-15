'use client'
import { useState } from 'react'
import { Plus, Trash2, X, Info } from 'lucide-react'
import {
  Transaction, BudgetCategory, SavingsGoal, Debt,
  EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  addTransaction, deleteTransaction,
  getBudgets, saveBudgets,
  getSavings, saveSavings,
  getDebts, saveDebts,
  formatAmount, currentYearMonth, computeCoachPlan
} from '@/lib/storage'
import CoachTip from './CoachTip'

type SubTab = 'transactions' | 'budget' | 'dettes' | 'epargne'

interface Props {
  transactions: Transaction[]
  onUpdate: () => void
}

const COLORS = ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#10B981','#F97316']
const EMOJIS = ['🏖️','🚗','🏠','💻','📱','✈️','🎓','💍','💰','🎮','👶']

const SUBTABS = [
  {
    id: 'transactions' as SubTab,
    emoji: '💸',
    label: 'Transactions',
    shortDesc: 'Mes dépenses & revenus',
    fullDesc: 'Enregistre chaque dépense ou revenu ponctuel. Courses, salaire, restaurant, essence... Tout ce qui entre ou sort de ta poche.',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    activeColor: 'bg-accent text-white',
  },
  {
    id: 'budget' as SubTab,
    emoji: '🎯',
    label: 'Budget',
    shortDesc: 'Mes plafonds par catégorie',
    fullDesc: 'Fixe des limites de dépenses par catégorie (alimentation, transport...). Le système t\'alerte automatiquement quand tu approches ou dépasses la limite.',
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    activeColor: 'bg-purple-600 text-white',
  },
  {
    id: 'dettes' as SubTab,
    emoji: '💳',
    label: 'Dettes',
    shortDesc: 'Ce que je dois / on me doit',
    fullDesc: 'Suis tes crédits et prêts. Crédit voiture, prêt bancaire, argent prêté à un ami... Le Coach calcule automatiquement l\'ordre de remboursement optimal.',
    color: 'bg-red-50 border-red-200 text-red-700',
    activeColor: 'bg-danger text-white',
  },
  {
    id: 'epargne' as SubTab,
    emoji: '🐖',
    label: 'Épargne',
    shortDesc: 'Mes objectifs d\'économies',
    fullDesc: 'Crée des objectifs d\'épargne avec un montant cible. Fonds d\'urgence, vacances, nouvelle télé... Tu ajoutes de l\'argent quand tu peux.',
    color: 'bg-green-50 border-green-200 text-green-700',
    activeColor: 'bg-positive text-white',
  },
]

export default function MoneyTab({ transactions, onUpdate }: Props) {
  const [sub, setSub] = useState<SubTab>('transactions')
  const [showInfo, setShowInfo] = useState<SubTab | null>(null)

  const active = SUBTABS.find(t => t.id === sub)!

  return (
    <div className="space-y-4">

      {/* ── Navigation onglets ── */}
      <div className="grid grid-cols-2 gap-2">
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`relative flex flex-col items-start p-3 rounded-2xl border-2
                        text-left transition-all active:scale-[0.98]
                        ${sub === t.id
                          ? t.activeColor + ' border-transparent shadow-sm'
                          : 'bg-white border-mist-dark'}`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-xl">{t.emoji}</span>
              {/* Info button */}
              <button
                onClick={e => { e.stopPropagation(); setShowInfo(showInfo === t.id ? null : t.id) }}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors
                  ${sub === t.id ? 'bg-white/20 text-white' : 'bg-mist text-ink-soft'}`}
              >
                <Info size={12}/>
              </button>
            </div>
            <p className={`text-sm font-bold ${sub === t.id ? 'text-white' : 'text-ink'}`}>
              {t.label}
            </p>
            <p className={`text-xs mt-0.5 leading-tight
              ${sub === t.id ? 'text-white/75' : 'text-ink-soft'}`}>
              {t.shortDesc}
            </p>
          </button>
        ))}
      </div>

      {/* ── Bulle d'info ── */}
      {showInfo && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border
          ${SUBTABS.find(t => t.id === showInfo)?.color}`}>
          <span className="text-xl flex-shrink-0">
            {SUBTABS.find(t => t.id === showInfo)?.emoji}
          </span>
          <div className="flex-1">
            <p className="font-bold text-sm mb-1">
              {SUBTABS.find(t => t.id === showInfo)?.label}
            </p>
            <p className="text-sm leading-relaxed">
              {SUBTABS.find(t => t.id === showInfo)?.fullDesc}
            </p>
          </div>
          <button onClick={() => setShowInfo(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">
            <X size={16}/>
          </button>
        </div>
      )}

      {/* ── Contenu ── */}
      {sub === 'transactions' && <TransactionsSection transactions={transactions} onUpdate={onUpdate} />}
      {sub === 'budget'       && <BudgetSection transactions={transactions} />}
      {sub === 'dettes'       && <DettesSection />}
      {sub === 'epargne'      && <EpargneSection />}
    </div>
  )
}

// ─── Transactions ─────────────────────────────────────────────────────────────

function TransactionsSection({ transactions, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [form, setForm] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: '', category: EXPENSE_CATEGORIES[0], note: '',
    date: new Date().toISOString().slice(0, 10),
  })

  const filtered = transactions.filter(t => filter === 'all' || t.type === filter)
  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  // Stats rapides
  const ym = currentYearMonth()
  const monthTxs  = transactions.filter(t => t.date.startsWith(ym))
  const income    = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses  = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) return
    addTransaction({ ...form, amount: Number(form.amount) })
    setForm({
      type: 'expense', amount: '', category: EXPENSE_CATEGORIES[0],
      note: '', date: new Date().toISOString().slice(0, 10)
    })
    setShowForm(false)
    onUpdate()
  }

  return (
    <div className="space-y-3">

      {/* Mini stats du mois */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card bg-positive-light">
          <p className="text-xs font-bold text-positive uppercase">Revenus ce mois</p>
          <p className="text-lg font-bold font-mono text-positive mt-1">{formatAmount(income)}</p>
        </div>
        <div className="card bg-danger-light">
          <p className="text-xs font-bold text-danger uppercase">Dépenses ce mois</p>
          <p className="text-lg font-bold font-mono text-danger mt-1">{formatAmount(expenses)}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        {([
          { id: 'all',     label: 'Tout' },
          { id: 'income',  label: '💰 Revenus' },
          { id: 'expense', label: '💸 Dépenses' },
        ] as const).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-colors
              ${filter === f.id ? 'bg-ink text-white' : 'bg-white text-ink-soft border border-mist-dark'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2">
        <Plus size={18}/> Ajouter une transaction
      </button>

      {/* Liste */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-3xl mb-2">💸</p>
            <p className="font-semibold text-ink">Aucune transaction</p>
            <p className="text-sm text-ink-soft mt-1">
              Appuie sur "Ajouter" pour enregistrer ta première dépense ou ton premier revenu
            </p>
          </div>
        ) : filtered.map(tx => (
          <div key={tx.id} className="card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0
                ${tx.type === 'income' ? 'bg-positive-light' : 'bg-danger-light'}`}>
                <span className="text-lg">{tx.type === 'income' ? '💰' : '💸'}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{tx.note || tx.category}</p>
                <p className="text-xs text-ink-soft">
                  {tx.category} · {new Date(tx.date).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`font-mono text-sm font-bold
                ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
                {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount)}
              </span>
              <button
                className="w-9 h-9 rounded-xl bg-mist hover:bg-danger-light text-ink-soft
                           hover:text-danger flex items-center justify-center active:scale-95"
                onClick={() => { deleteTransaction(tx.id); onUpdate() }}>
                <Trash2 size={15}/>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvelle transaction</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold
                ${form.type === 'expense' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'expense', category: EXPENSE_CATEGORIES[0]}))}>
                💸 Dépense</button>
              <button className={`flex-1 py-3 text-sm font-bold
                ${form.type === 'income' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'income', category: INCOME_CATEGORIES[0]}))}>
                💰 Revenu</button>
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input text-xl font-bold" type="number" placeholder="0"
                value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={form.category}
                onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: Courses Jumbo, Salaire avril..."
                value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm(f => ({...f, date: e.target.value}))}/>
            </div>
            <button className="btn-primary w-full py-4 text-base" onClick={handleSubmit}>
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Budget ───────────────────────────────────────────────────────────────────

function BudgetSection({ transactions }: { transactions: Transaction[] }) {
  const [budgets, setBudgets] = useState<BudgetCategory[]>(getBudgets)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', limit: '', color: COLORS[0] })

  const ym = currentYearMonth()
  const spending: Record<string, number> = {}
  transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(ym))
    .forEach(t => { spending[t.category] = (spending[t.category] || 0) + t.amount })

  const overBudget = budgets.filter(b => (spending[b.name] || 0) > b.limit)
  const tip = overBudget.length > 0
    ? `⚠️ Tu dépasses le plafond en : ${overBudget.map(b => b.name).join(', ')}. Réduis ces dépenses !`
    : budgets.length > 0
    ? `✅ Tous tes budgets sont respectés ce mois-ci. Continue !`
    : `Crée un plafond par catégorie pour mieux contrôler où va ton argent.`

  function handleAdd() {
    if (!form.name || !form.limit) return
    const updated = [...budgets, {
      id: crypto.randomUUID(), name: form.name,
      limit: Number(form.limit), color: form.color
    }]
    setBudgets(updated); saveBudgets(updated)
    setForm({ name: '', limit: '', color: COLORS[0] }); setShowForm(false)
  }

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />

      {/* Explication rapide */}
      <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-2xl">
        <span className="text-lg">💡</span>
        <p className="text-xs text-purple-700 leading-relaxed">
          <strong>Comment ça marche :</strong> Tu fixes un plafond pour une catégorie
          (ex: 15 000 Rs pour l'alimentation). Chaque fois que tu enregistres une dépense
          dans cette catégorie, la barre avance automatiquement.
        </p>
      </div>

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2"
        style={{ backgroundColor: '#7C3AED' }}>
        <Plus size={18}/> Nouveau plafond
      </button>

      {budgets.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🎯</p>
          <p className="font-semibold text-ink">Aucun budget défini</p>
          <p className="text-sm text-ink-soft mt-1">
            Commence par fixer un plafond pour l'alimentation ou le transport
          </p>
        </div>
      ) : budgets.map(b => {
        const spent = spending[b.name] || 0
        const pct   = Math.min(100, (spent / b.limit) * 100)
        const over  = spent > b.limit
        const near  = pct >= 80 && !over
        return (
          <div key={b.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }}/>
                <span className="font-semibold text-sm text-ink">{b.name}</span>
                {over && <span className="text-xs bg-danger-light text-danger px-2 py-0.5 rounded-full font-bold">⚠️ Dépassé</span>}
                {near && <span className="text-xs bg-warning-light text-warning px-2 py-0.5 rounded-full font-bold">Attention</span>}
              </div>
              <button
                className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft
                           hover:text-danger flex items-center justify-center"
                onClick={() => {
                  const u = budgets.filter(x => x.id !== b.id)
                  setBudgets(u); saveBudgets(u)
                }}>
                <Trash2 size={14}/>
              </button>
            </div>
            <div className="w-full h-3 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: over ? '#DC2626' : near ? '#D97706' : b.color
                }}/>
            </div>
            <div className="flex justify-between text-xs">
              <span className={`font-mono font-bold ${over ? 'text-danger' : 'text-ink'}`}>
                {formatAmount(spent)} dépensés
              </span>
              <span className="font-mono text-ink-soft">
                plafond : {formatAmount(b.limit)}
              </span>
            </div>
          </div>
        )
      })}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouveau plafond</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <p className="text-sm text-ink-soft">
              Choisis une catégorie qui correspond à tes transactions existantes pour que le suivi soit automatique.
            </p>
            <div>
              <label className="label">Catégorie de dépense</label>
              <select className="input" value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))}>
                <option value="">— Choisir —</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Plafond mensuel (Rs)</label>
              <input className="input" type="number" placeholder="Ex: 15000"
                value={form.limit} onChange={e => setForm(f => ({...f, limit: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Couleur</label>
              <div className="flex gap-3 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} style={{ backgroundColor: c }}
                    className={`w-10 h-10 rounded-2xl border-2 transition-transform
                      ${form.color === c ? 'border-ink scale-110' : 'border-transparent'}`}
                    onClick={() => setForm(f => ({...f, color: c}))}/>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleAdd}
              style={{ backgroundColor: '#7C3AED' }}>
              Créer le plafond
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Dettes ───────────────────────────────────────────────────────────────────

function DettesSection() {
  const [debts, setDebts] = useState<Debt[]>(getDebts)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [form, setForm] = useState({
    type: 'owe' as 'owe' | 'owed',
    person: '', amount: '', minimumPayment: '',
    interestRate: '', note: '', dueDate: '',
  })

  const plan = computeCoachPlan(currentYearMonth())
  const tip  = plan.snowballTarget
    ? `🎯 Rembourse "${plan.snowballTarget.person}" en priorité (${formatAmount(plan.snowballTarget.remaining)} restant). Mets ${formatAmount(plan.snowballSuggestion)} de plus ce mois !`
    : debts.length > 0 ? `✅ Continue comme ça, tu avances bien !`
    : `Enregistre tes crédits et prêts pour que le Coach calcule le meilleur ordre de remboursement.`

  const totalOwe  = debts.filter(d => d.type === 'owe').reduce((s, d) => s + d.remaining, 0)
  const totalOwed = debts.filter(d => d.type === 'owed').reduce((s, d) => s + d.remaining, 0)

  function resetForm() {
    setForm({ type:'owe', person:'', amount:'', minimumPayment:'', interestRate:'', note:'', dueDate:'' })
    setEditingId(null)
  }

  function openEdit(d: Debt) {
    setForm({
      type: d.type,
      person: d.person,
      amount: String(d.amount),
      minimumPayment: d.minimumPayment ? String(d.minimumPayment) : '',
      interestRate: d.interestRate !== undefined ? String(d.interestRate) : '',
      note: d.note || '',
      dueDate: d.dueDate || '',
    })
    setEditingId(d.id)
    setShowForm(true)
  }

  function handleAdd() {
    if (!form.person || !form.amount) return

    if (editingId) {
      // Mode édition : on met à jour la dette existante
      const updated = debts.map(d => {
        if (d.id !== editingId) return d
        const newAmount = Number(form.amount)
        const paidSoFar = d.amount - d.remaining
        const newRemaining = Math.max(0, newAmount - paidSoFar)
        return {
          ...d,
          type: form.type,
          person: form.person,
          amount: newAmount,
          remaining: newRemaining,
          minimumPayment: Number(form.minimumPayment) || 0,
          interestRate: form.interestRate ? Number(form.interestRate) : undefined,
          note: form.note,
          dueDate: form.dueDate || undefined,
        }
      })
      setDebts(updated); saveDebts(updated)
    } else {
      // Mode création
      const updated = [...debts, {
        id: crypto.randomUUID(), type: form.type,
        person: form.person, amount: Number(form.amount),
        remaining: Number(form.amount),
        minimumPayment: Number(form.minimumPayment) || 0,
        interestRate: form.interestRate ? Number(form.interestRate) : undefined,
        note: form.note, dueDate: form.dueDate || undefined,
        createdAt: new Date().toISOString(),
      }]
      setDebts(updated); saveDebts(updated)
    }

    resetForm()
    setShowForm(false)
  }

  function handlePay(id: string) {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) return
    const updated = debts
      .map(d => d.id !== id ? d : { ...d, remaining: Math.max(0, d.remaining - amt) })
      .filter(d => d.remaining > 0)
    setDebts(updated); saveDebts(updated)
    setPayingId(null); setPayAmount('')
  }

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />

      {/* Explication */}
      <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-2xl">
        <span className="text-lg">💡</span>
        <p className="text-xs text-red-700 leading-relaxed">
          <strong>Dette vs Dépense :</strong> Une dette c'est une somme totale à rembourser
          sur le temps (crédit voiture, prêt bancaire...). Ce n'est pas une dépense mensuelle normale.
          Le Coach utilise la méthode <strong>Snowball</strong> pour t'aider à les éliminer dans le bon ordre.
        </p>
      </div>

      {/* Totaux */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card bg-danger-light">
          <p className="text-xs font-bold text-danger uppercase">Je dois</p>
          <p className="text-xl font-bold font-mono text-danger mt-1">{formatAmount(totalOwe)}</p>
          <p className="text-xs text-danger/70 mt-1">total restant</p>
        </div>
        <div className="card bg-positive-light">
          <p className="text-xs font-bold text-positive uppercase">On me doit</p>
          <p className="text-xl font-bold font-mono text-positive mt-1">{formatAmount(totalOwed)}</p>
          <p className="text-xs text-positive/70 mt-1">à récupérer</p>
        </div>
      </div>

      <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary w-full gap-2"
        style={{ backgroundColor: '#DC2626' }}>
        <Plus size={18}/> Ajouter une dette / prêt
      </button>

      {debts.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🤝</p>
          <p className="font-semibold text-ink">Aucune dette enregistrée</p>
          <p className="text-sm text-ink-soft mt-1">
            Crédit voiture, prêt bancaire, argent dû à un ami...
          </p>
        </div>
      ) : debts.map(d => {
        const paidPct    = Math.round(((d.amount - d.remaining) / d.amount) * 100)
        const monthsLeft = d.minimumPayment > 0 ? Math.ceil(d.remaining / d.minimumPayment) : null
        const isOverdue  = d.dueDate && new Date(d.dueDate) < new Date()
        const isSnowball = plan.snowballTarget?.id === d.id

        return (
          <div key={d.id} className={`card space-y-3 border-l-4
            ${d.type === 'owe' ? 'border-l-danger' : 'border-l-positive'}
            ${isSnowball ? 'ring-2 ring-accent' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {isSnowball && (
                    <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full font-bold">
                      🎯 Priorité snowball
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                    ${d.type === 'owe' ? 'bg-danger-light text-danger' : 'bg-positive-light text-positive'}`}>
                    {d.type === 'owe' ? 'Je dois à' : 'Me doit'}
                  </span>
                  <span className="font-bold text-sm text-ink">{d.person}</span>
                </div>
                {d.note && <p className="text-xs text-ink-soft mt-1">{d.note}</p>}
                {d.minimumPayment > 0 && (
                  <p className="text-xs text-ink-soft mt-1">
                    Min. {formatAmount(d.minimumPayment)}/mois
                    {monthsLeft && (
                      <span className="text-warning font-semibold"> · ~{monthsLeft} mois restants</span>
                    )}
                  </p>
                )}
                {isOverdue && (
                  <p className="text-xs text-danger font-bold mt-1">⚠️ Échéance dépassée</p>
                )}
              </div>
              <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                <p className="font-mono font-bold text-ink">{formatAmount(d.remaining)}</p>
                {paidPct > 0 && (
                  <p className="text-xs text-positive font-semibold">{paidPct}% remboursé</p>
                )}
                <div className="flex gap-1">
                  <button
                    className="w-8 h-8 rounded-xl bg-mist hover:bg-accent-light text-ink-soft
                               hover:text-accent flex items-center justify-center"
                    onClick={() => openEdit(d)}>
                    <Pencil size={14}/>
                  </button>
                  <button
                    className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft
                               hover:text-danger flex items-center justify-center"
                    onClick={() => {
                      const u = debts.filter(x => x.id !== d.id)
                      setDebts(u); saveDebts(u)
                    }}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </div>

            {paidPct > 0 && (
              <div className="w-full h-2 bg-mist-dark rounded-full">
                <div className="h-full bg-positive rounded-full"
                  style={{ width: `${paidPct}%` }}/>
              </div>
            )}

            {payingId === d.id ? (
              <div className="flex gap-2">
                <input className="input flex-1" type="number" placeholder="Montant remboursé"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus/>
                <button className="btn-primary px-4" onClick={() => handlePay(d.id)}>OK</button>
                <button className="btn-ghost px-3" onClick={() => setPayingId(null)}>✕</button>
              </div>
            ) : (
              <button
                className="w-full py-3 text-sm font-bold text-danger bg-danger-light
                           rounded-2xl active:scale-95 transition-all"
                onClick={() => { setPayingId(d.id); setPayAmount('') }}>
                Enregistrer un remboursement
              </button>
            )}
          </div>
        )
      })}

      {/* Modal */}
      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">
                {editingId ? 'Modifier la dette / prêt' : 'Nouvelle dette / prêt'}
              </h2>
              <button className="btn-icon bg-mist" onClick={() => { setShowForm(false); resetForm() }}><X size={20}/></button>
            </div>
            <p className="text-sm text-ink-soft">
              Enregistre le montant total (pas le mensuel). Tu ajouteras les remboursements au fur et à mesure.
            </p>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold
                ${form.type === 'owe' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'owe'}))}>💳 Je dois</button>
              <button className={`flex-1 py-3 text-sm font-bold
                ${form.type === 'owed' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({...f, type:'owed'}))}>🤝 On me doit</button>
            </div>
            <div>
              <label className="label">{form.type === 'owe' ? 'À qui tu dois ?' : 'Qui te doit ?'}</label>
              <input className="input" placeholder="Ex: SBM Bank, MCB, Jean..."
                value={form.person} onChange={e => setForm(f => ({...f, person: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant total {editingId ? '' : 'restant '}(Rs)</label>
              <input className="input" type="number" placeholder="Ex: 150000"
                value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}/>
              {editingId && (
                <p className="text-xs text-ink-soft mt-1">
                  Le montant restant sera ajusté automatiquement selon ce qui a déjà été remboursé.
                </p>
              )}
            </div>
            <div>
              <label className="label">Remboursement minimum / mois (Rs)</label>
              <input className="input" type="number" placeholder="Ex: 3000"
                value={form.minimumPayment}
                onChange={e => setForm(f => ({...f, minimumPayment: e.target.value}))}/>
              <p className="text-xs text-ink-soft mt-1">
                Utilisé par le Coach pour calculer combien de mois il reste
              </p>
            </div>
            <div>
              <label className="label">Taux d'intérêt annuel % (optionnel)</label>
              <input className="input" type="number" placeholder="Ex: 12"
                value={form.interestRate}
                onChange={e => setForm(f => ({...f, interestRate: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Note</label>
              <input className="input" placeholder="Ex: Crédit voiture Honda"
                value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Échéance finale (optionnel)</label>
              <input className="input" type="date" value={form.dueDate}
                onChange={e => setForm(f => ({...f, dueDate: e.target.value}))}/>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleAdd}
              style={{ backgroundColor: '#DC2626' }}>
              {editingId ? 'Enregistrer les modifications' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Épargne ──────────────────────────────────────────────────────────────────

function EpargneSection() {
  const [goals, setGoals]     = useState<SavingsGoal[]>(getSavings)
  const [showForm, setShowForm] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [addAmount, setAddAmount] = useState('')
  const [form, setForm]       = useState({ name: '', target: '', emoji: EMOJIS[0] })

  const plan = computeCoachPlan(currentYearMonth())
  const tip  = plan.savingsSuggestion > 0
    ? `💰 Ce mois, essaie de mettre ${formatAmount(plan.savingsSuggestion)} de côté — répartis sur tes objectifs !`
    : `Crée tes premiers objectifs d'épargne. Même 500 Rs/mois, ça compte !`

  const totalSaved = goals.reduce((s, g) => s + g.saved, 0)

  function handleAdd() {
    if (!form.name || !form.target) return
    const updated = [...goals, {
      id: crypto.randomUUID(), name: form.name,
      target: Number(form.target), saved: 0,
      emoji: form.emoji, createdAt: new Date().toISOString()
    }]
    setGoals(updated); saveSavings(updated)
    setForm({ name: '', target: '', emoji: EMOJIS[0] }); setShowForm(false)
  }

  function handleDeposit(id: string) {
    if (!addAmount || Number(addAmount) <= 0) return
    const updated = goals.map(g =>
      g.id === id ? { ...g, saved: g.saved + Number(addAmount) } : g
    )
    setGoals(updated); saveSavings(updated)
    setAddingTo(null); setAddAmount('')
  }

  return (
    <div className="space-y-3">
      <CoachTip message={tip} />

      {/* Explication */}
      <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-2xl">
        <span className="text-lg">💡</span>
        <p className="text-xs text-green-700 leading-relaxed">
          <strong>Épargne vs Budget :</strong> Le budget limite tes dépenses.
          L'épargne met de l'argent de côté pour un objectif futur.
          Règle d'or : épargne d'abord, dépense ensuite.
        </p>
      </div>

      {/* Total épargné */}
      {goals.length > 0 && (
        <div className="card bg-positive-light text-center">
          <p className="text-xs font-bold text-positive uppercase">Total épargné</p>
          <p className="text-2xl font-bold font-mono text-positive mt-1">{formatAmount(totalSaved)}</p>
          <p className="text-xs text-positive/70 mt-1">sur {goals.length} objectif{goals.length > 1 ? 's' : ''}</p>
        </div>
      )}

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2"
        style={{ backgroundColor: '#16A34A' }}>
        <Plus size={18}/> Nouvel objectif d'épargne
      </button>

      {goals.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🐖</p>
          <p className="font-semibold text-ink">Aucun objectif d'épargne</p>
          <p className="text-sm text-ink-soft mt-1">
            Fonds d'urgence, vacances, nouvelle télé, voiture...
            Fixe un objectif et commence à mettre de côté.
          </p>
        </div>
      ) : goals.map(g => {
        const pct  = Math.min(100, (g.saved / g.target) * 100)
        const done = g.saved >= g.target
        return (
          <div key={g.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{g.emoji}</span>
                <div>
                  <p className="font-bold text-ink">{g.name}</p>
                  {done
                    ? <p className="text-xs text-positive font-bold">✅ Objectif atteint !</p>
                    : <p className="text-xs text-ink-soft">{formatAmount(g.target - g.saved)} restant</p>
                  }
                </div>
              </div>
              <button
                className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft
                           hover:text-danger flex items-center justify-center"
                onClick={() => {
                  const u = goals.filter(x => x.id !== g.id)
                  setGoals(u); saveSavings(u)
                }}>
                <Trash2 size={14}/>
              </button>
            </div>

            <div className="w-full h-3 bg-mist-dark rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: done ? '#16A34A' : '#2563EB' }}/>
            </div>

            <div className="flex justify-between text-xs">
              <span className="font-mono font-bold text-accent">{formatAmount(g.saved)}</span>
              <span className="font-mono text-ink-soft">
                {pct.toFixed(0)}% · objectif {formatAmount(g.target)}
              </span>
            </div>

            {addingTo === g.id ? (
              <div className="flex gap-2">
                <input className="input flex-1" type="number"
                  placeholder="Combien tu mets de côté ?"
                  value={addAmount} onChange={e => setAddAmount(e.target.value)} autoFocus/>
                <button className="btn-primary px-4" onClick={() => handleDeposit(g.id)}>OK</button>
                <button className="btn-ghost px-3" onClick={() => setAddingTo(null)}>✕</button>
              </div>
            ) : (
              <button
                className="w-full py-3 text-sm font-bold text-positive bg-positive-light
                           rounded-2xl active:scale-95 transition-all"
                onClick={() => { setAddingTo(g.id); setAddAmount('') }}>
                + Mettre de l'argent de côté
              </button>
            )}
          </div>
        )
      })}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvel objectif d'épargne</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <p className="text-sm text-ink-soft">
              Fixe un montant cible. Tu ajouteras de l'argent quand tu peux, sans contrainte de date.
              Pour un objectif avec date limite, utilise l'onglet Projets.
            </p>
            <div>
              <label className="label">Icône</label>
              <div className="flex gap-2 flex-wrap">
                {EMOJIS.map(e => (
                  <button key={e}
                    className={`text-2xl p-2 rounded-2xl transition-colors
                      ${form.emoji === e ? 'bg-accent-light' : 'bg-mist'}`}
                    onClick={() => setForm(f => ({...f, emoji: e}))}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Nom de l'objectif</label>
              <input className="input" placeholder="Ex: Fonds d'urgence, Vacances..."
                value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant cible (Rs)</label>
              <input className="input" type="number" placeholder="Ex: 50000"
                value={form.target} onChange={e => setForm(f => ({...f, target: e.target.value}))}/>
            </div>
            <button className="btn-primary w-full py-4" onClick={handleAdd}
              style={{ backgroundColor: '#16A34A' }}>
              Créer l'objectif
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
