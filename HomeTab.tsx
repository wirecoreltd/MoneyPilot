'use client'
import { useState, useRef, useEffect } from 'react'
import { Plus, X, MessageCircle, Send, ChevronRight, AlertCircle, Clock, Target, CheckCircle2 } from 'lucide-react'
import {
  Transaction, TransactionType, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  BudgetCategory, addTransaction, getBudgets, formatAmount, UserProfile,
} from '@/lib/storage'
import { currentYearMonth, isoDate, monthLabel } from '@/lib/finance'
import { useMonthSummary } from '@/lib/useMonthSummary'
import { useSpendingLines } from '@/lib/useSpendingLines'
import { computeBudgetStatuses, earliestCycleStart } from '@/lib/budgetPeriods'
import { authedPost } from '@/lib/apiClient'
import CoachTip from './CoachTip'

export type MoneySubTab = 'transactions' | 'revenus' | 'factures' | 'dettes' | 'epargne' | 'budget'

interface Props {
  transactions: Transaction[]
  onUpdate: () => void
  profile: UserProfile
  onGoToMoney: (sub: MoneySubTab) => void
  onGoToProjects: () => void
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }

type Tone = 'danger' | 'warning' | 'accent'
interface Todo { key: string; tone: Tone; title: string; detail: string; go: MoneySubTab }

const TONE: Record<Tone, { icon: typeof AlertCircle; text: string; bg: string; order: number }> = {
  danger:  { icon: AlertCircle, text: 'text-danger',  bg: 'bg-danger-light',  order: 0 },
  warning: { icon: Clock,       text: 'text-warning', bg: 'bg-warning-light', order: 1 },
  accent:  { icon: Target,      text: 'text-accent',  bg: 'bg-accent-light',  order: 2 },
}

const emptyForm = {
  type: 'expense' as TransactionType,
  amount: '',
  category: EXPENSE_CATEGORIES[0],
  note: '',
  date: new Date().toISOString().slice(0, 10),
}

// Montant tant que les chiffres ne sont pas chargés -> « — »
const amt = (v: number | undefined) => (v === undefined ? '—' : formatAmount(v))
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// ─── Chat coach (inchangé, isolé dans son composant) ──────────────────────────

function CoachChat({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    const next: ChatMessage[] = [...messages, { role: 'user', content: userMsg }]
    setMessages(next)
    setLoading(true)
    try {
      // Le contexte financier est construit côté serveur : on n'envoie que la conversation.
      const { reply } = await authedPost<{ reply: string }>('/api/coach-chat', { messages: next })
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'Désolé, je rencontre un problème. Réessaie dans un moment.'
      setMessages(prev => [...prev, { role: 'assistant', content: msg }])
    }
    setLoading(false)
  }

  return (
    <div className="bottom-sheet bg-black/40">
      <div className="bg-white rounded-t-3xl w-full max-w-lg flex flex-col" style={{ height: '80vh' }}>
        <div className="flex items-center justify-between p-5 border-b border-mist-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center">
              <span className="text-xl">🤖</span>
            </div>
            <div>
              <p className="font-bold text-ink text-sm">Coach IA</p>
              <p className="text-xs text-positive">● En ligne</p>
            </div>
          </div>
          <button className="btn-icon bg-mist" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">💬</p>
              <p className="font-semibold text-ink">Pose-moi une question</p>
              <p className="text-sm text-ink-soft mt-1">J'ai accès à toutes tes données financières</p>
              <div className="mt-4 space-y-2">
                {['Est-ce que je peux me permettre une voiture à crédit ?', 'Comment réduire mes dépenses ce mois ?', 'Quelle dette rembourser en premier ?'].map(q => (
                  <button key={q} onClick={() => setInput(q)}
                    className="block w-full text-left text-xs bg-mist text-ink-soft p-3 rounded-2xl hover:bg-mist-dark transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed
                ${m.role === 'user' ? 'bg-accent text-white rounded-br-sm' : 'bg-mist text-ink rounded-bl-sm'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-mist p-3 rounded-2xl rounded-bl-sm flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-ink-soft animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="p-4 border-t border-mist-dark flex gap-2">
          <input className="input flex-1" placeholder="Pose ta question..."
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()} />
          <button onClick={send} disabled={!input.trim() || loading}
            className="w-12 h-12 rounded-2xl bg-accent text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all flex-shrink-0">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Accueil ──────────────────────────────────────────────────────────────────

export default function HomeTab({ transactions, onUpdate, profile, onGoToMoney, onGoToProjects }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [budgets, setBudgets] = useState<BudgetCategory[]>([])

  const ym = currentYearMonth()
  const { snapshot, summary, health, plan, error, reload } = useMonthSummary(ym, transactions)

  // Plafonds : même règle que l'onglet Budget (cycle courant de chaque plafond)
  useEffect(() => {
    getBudgets().then(setBudgets).catch(e => console.error('Budgets:', e))
  }, [])
  const { lines } = useSpendingLines(earliestCycleStart(budgets), transactions)
  const budgetStatuses = computeBudgetStatuses(budgets, lines)

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const projects = snapshot?.projects ?? []

  // ── Reste à vivre + barre « dépensé / revenus » ──
  const free = summary?.remainingToLive
  const freeIsNegative = free !== undefined && free < 0
  const hasIncome = !!summary && summary.income > 0
  const spentPct = hasIncome ? Math.min(100, Math.max(0, (summary!.totalOut / summary!.income) * 100)) : 0

  // ── « À faire » : 3 lignes maximum, les plus urgentes d'abord ──
  function buildTodos(): Todo[] {
    if (!snapshot || !summary) return []
    const items: Todo[] = []
    const today = isoDate(new Date())

    if (summary.income <= 0) {
      items.push({ key: 'income', tone: 'accent', title: 'Ajoute tes revenus du mois', detail: 'Pour calculer ton reste à vivre', go: 'revenus' })
    }

    // Factures du mois encore impayées
    const paidBy: Record<string, number> = {}
    snapshot.facturePayments.forEach(p => { paidBy[p.factureId] = (paidBy[p.factureId] || 0) + p.amount })
    const unpaid = snapshot.factures.filter(f => f.amount - (paidBy[f.id] || 0) > 0)
    const remainingOf = (fs: typeof unpaid) => sum(fs.map(f => f.amount - (paidBy[f.id] || 0)))
    const late = unpaid.filter(f => f.dueDate && f.dueDate.slice(0, 10) < today)
    const upcoming = unpaid.filter(f => !late.includes(f))
    if (late.length > 0) {
      items.push({
        key: 'bills-late', tone: 'danger', go: 'factures',
        title: late.length === 1 ? `Facture « ${late[0].name} » en retard` : `${late.length} factures en retard`,
        detail: `${formatAmount(remainingOf(late))} à régler`,
      })
    }
    if (upcoming.length > 0) {
      items.push({
        key: 'bills-due', tone: 'warning', go: 'factures',
        title: upcoming.length === 1 ? `Facture « ${upcoming[0].name} » à payer` : `${upcoming.length} factures à payer`,
        detail: `${formatAmount(remainingOf(upcoming))} restant ce mois`,
      })
    }

    // Dettes : échéance dépassée, puis mensualités du mois
    const overdueDebts = snapshot.debts.filter(d =>
      d.type === 'owe' && !d.recurring && d.remaining > 0 && d.dueDate && d.dueDate.slice(0, 10) < today)
    if (overdueDebts.length > 0) {
      items.push({
        key: 'debt-late', tone: 'danger', go: 'dettes',
        title: overdueDebts.length === 1 ? `Dette « ${overdueDebts[0].person} » en retard` : `${overdueDebts.length} dettes en retard`,
        detail: 'Échéance dépassée',
      })
    }
    if (summary.debtRemaining > 0) {
      items.push({
        key: 'debt-due', tone: 'warning', go: 'dettes',
        title: 'Mensualités de dettes à payer',
        detail: `${formatAmount(summary.debtRemaining)} restant ce mois`,
      })
    }

    // Plafonds de budget
    const over = budgetStatuses.filter(b => b.status === 'over')
    const near = budgetStatuses.filter(b => b.status === 'near')
    if (over.length > 0) {
      items.push({
        key: 'budget-over', tone: 'danger', go: 'budget',
        title: over.length === 1 ? `Plafond « ${over[0].name} » dépassé` : `${over.length} plafonds dépassés`,
        detail: over.length === 1 ? `${formatAmount(over[0].spent)} sur ${formatAmount(over[0].limit)}` : over.map(b => b.name).join(', '),
      })
    }
    if (near.length > 0) {
      items.push({
        key: 'budget-near', tone: 'warning', go: 'budget',
        title: near.length === 1 ? `Plafond « ${near[0].name} » bientôt atteint` : `${near.length} plafonds bientôt atteints`,
        detail: near.length === 1 ? `${Math.round(near[0].pct)} % utilisé` : near.map(b => b.name).join(', '),
      })
    }

    return items.sort((a, b) => TONE[a.tone].order - TONE[b.tone].order).slice(0, 3)
  }
  const todos = buildTodos()

  // ── Conseil du Coach ──
  function buildTip(): string {
    if (!summary || !plan) return 'Je prépare ton point du mois…'
    if (plan.alerts.length > 0) return plan.alerts[0]
    if (summary.income <= 0) return "Ajoute tes revenus du mois pour que le Coach t'aide."
    if (summary.remainingToLive <= 0) {
      return `${profile.firstName}, tes dépenses et charges du mois dépassent tes revenus. Jette un œil à ton budget pour voir où ajuster.`
    }
    const save = Math.min(plan.savingsSuggestion, Math.floor(summary.remainingToLive))
    return `${profile.firstName}, il te reste ${formatAmount(summary.remainingToLive)} à vivre ce mois.${save > 0 ? ` Mets ${formatAmount(save)} de côté dès maintenant !` : ''}`
  }

  async function handleSubmit() {
    if (saving || !form.amount || Number(form.amount) <= 0) return
    setSaving(true)
    try {
      await addTransaction({ ...form, amount: Number(form.amount) })
    } catch (e) {
      console.error('Ajout de transaction échoué :', e)
      window.alert("Impossible d'enregistrer la transaction. Réessaie.")
      setSaving(false)
      return // on garde le formulaire ouvert et rempli
    }
    setForm(emptyForm)
    setShowForm(false)
    setSaving(false)
    onUpdate()
    reload()
  }

  return (
    <div className="space-y-4">

      {error && (
        <div className="card bg-red-50 border border-red-100 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700">Impossible de charger tes chiffres : {error}</p>
          <button onClick={reload} className="text-xs font-semibold text-red-700 underline flex-shrink-0">Réessayer</button>
        </div>
      )}

      {/* ── 1. Reste à vivre : le seul gros chiffre de la page ── */}
      <div className="card-lg space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink-soft capitalize">{monthLabel(ym)}</p>
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider mt-2">Reste à vivre</p>
            <p className={`text-4xl font-bold font-mono mt-1 ${freeIsNegative ? 'text-danger' : 'text-ink'}`}>{amt(free)}</p>
          </div>
          {health?.complete && (
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
              style={{ color: health.color, backgroundColor: `${health.color}1A` }}
            >
              {health.score}/100
            </span>
          )}
        </div>

        {hasIncome ? (
          <div className="space-y-1.5">
            <div className="w-full h-2 bg-mist-dark rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${spentPct >= 100 ? 'bg-danger' : 'bg-accent'}`}
                style={{ width: `${spentPct}%` }}
              />
            </div>
            <p className="text-xs text-ink-soft">
              {formatAmount(summary!.totalOut)} dépensés sur {formatAmount(summary!.income)} de revenus
            </p>
          </div>
        ) : summary ? (
          <button onClick={() => onGoToMoney('revenus')} className="text-xs font-semibold text-accent">
            Ajoute tes revenus pour voir où tu en es
          </button>
        ) : null}
      </div>

      {/* ── 2. À faire (3 lignes max) ── */}
      {summary && (
        todos.length === 0 ? (
          <div className="card flex items-center gap-3">
            <CheckCircle2 size={20} className="text-positive flex-shrink-0" />
            <p className="text-sm font-semibold text-ink">Tout est à jour ce mois-ci</p>
          </div>
        ) : (
          <div className="card">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-1">À faire</p>
            {todos.map(t => {
              const cfg = TONE[t.tone]
              const Icon = cfg.icon
              return (
                <button
                  key={t.key}
                  onClick={() => onGoToMoney(t.go)}
                  className="w-full flex items-center gap-3 py-3 border-b border-mist last:border-0 text-left active:scale-[0.99] transition-all"
                >
                  <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={18} className={cfg.text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{t.title}</p>
                    <p className="text-xs text-ink-soft truncate">{t.detail}</p>
                  </div>
                  <ChevronRight size={16} className="text-ink-soft flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )
      )}

      {/* ── 3. Deux chiffres ── */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onGoToMoney('epargne')} className="card text-left active:scale-95 transition-all">
          <p className="text-xs text-ink-soft">Épargné ce mois</p>
          <p className="text-lg font-bold font-mono text-ink mt-1">{amt(summary?.savedNet)}</p>
        </button>
        <button onClick={() => onGoToMoney('dettes')} className="card text-left active:scale-95 transition-all">
          <p className="text-xs text-ink-soft">Dettes payées</p>
          <p className="text-lg font-bold font-mono text-ink mt-1">
            {!summary ? '—' : summary.debtDue > 0 ? `${formatAmount(summary.debtPaid)}` : 'Aucune'}
          </p>
          {summary && summary.debtDue > 0 && (
            <p className="text-[11px] text-ink-soft">sur {formatAmount(summary.debtDue)} prévus</p>
          )}
        </button>
      </div>

      {/* ── Projets : une seule ligne ── */}
      {projects.length > 0 && (
        <button onClick={onGoToProjects} className="card w-full flex items-center justify-between active:scale-[0.99] transition-all">
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <p className="text-sm font-semibold text-ink">
              {projects.length} projet{projects.length > 1 ? 's' : ''} en cours
            </p>
          </div>
          <ChevronRight size={16} className="text-ink-soft" />
        </button>
      )}

      {/* ── 4. Coach ── */}
      <CoachTip message={buildTip()} />
      <button onClick={() => setShowChat(true)} className="btn-ghost w-full gap-2">
        <MessageCircle size={16} /> Poser une question au coach
      </button>

      {/* ── 5. Action principale ── */}
      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2 text-base py-4">
        <Plus size={20} /> Ajouter une transaction
      </button>

      {/* ── Formulaire d'ajout ── */}
      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvelle transaction</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button
                className={`flex-1 py-3 text-sm font-bold ${form.type === 'expense' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({ ...f, type: 'expense', category: EXPENSE_CATEGORIES[0] }))}>
                💸 Dépense
              </button>
              <button
                className={`flex-1 py-3 text-sm font-bold ${form.type === 'income' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({ ...f, type: 'income', category: INCOME_CATEGORIES[0] as any }))}>
                💰 Revenu
              </button>
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input text-2xl font-bold" type="number" placeholder="0"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: Courses Jumbo"
                value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <button className="btn-primary w-full py-4 text-base" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {showChat && <CoachChat onClose={() => setShowChat(false)} />}
    </div>
  )
}
