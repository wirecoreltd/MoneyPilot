'use client'
import { useState, useRef, useEffect } from 'react'
import { Plus, X, MessageCircle, Send, ChevronRight, AlertCircle, Clock, Target } from 'lucide-react'
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
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './components/money/PeriodFilter'
import { supabase } from '@/lib/supabase'

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

const DAILY_THOUGHTS = [
  "Chaque petit pas que tu fais aujourd'hui compte, sois fier du chemin parcouru.",
  "Prendre soin de tes finances, c'est aussi prendre soin de toi. Respire, tu avances bien.",
  "Tu n'as pas besoin d'être parfait, juste un peu meilleur qu'hier.",
  "Les erreurs d'argent ne définissent pas ta valeur. Continue d'apprendre, c'est déjà énorme.",
  "Aujourd'hui, accorde-toi un moment de gratitude pour tout ce que tu as déjà construit.",
  "La discipline d'aujourd'hui est la liberté de demain, mais profite aussi de l'instant présent.",
  "Prends soin de ta santé mentale autant que de ton portefeuille, les deux comptent.",
  "Tu fais de ton mieux avec ce que tu as, et c'est largement suffisant.",
  "Un sourire offert aujourd'hui ne coûte rien et vaut une fortune.",
  "Ta famille et tes proches sont ta vraie richesse, n'oublie pas de leur dire.",
  "Le repos n'est pas une perte de temps, c'est un investissement sur toi-même.",
  "Sois patient avec toi-même, les grandes réussites prennent du temps.",
  "Chaque jour est une nouvelle occasion de devenir la meilleure version de toi-même.",
  "La gratitude transforme ce que tu as en suffisance.",
  "Tu as déjà surmonté des défis difficiles, tu peux affronter celui d'aujourd'hui aussi.",
  "Prendre un instant pour souffler aujourd'hui n'est pas une faiblesse, c'est de la sagesse.",
  "Aide quelqu'un aujourd'hui, même un petit geste peut changer sa journée.",
  "Tu n'es pas en retard dans ta vie, tu suis ton propre chemin.",
  "Célèbre tes petites victoires, elles construisent les grandes.",
  "Avoir confiance en toi aujourd'hui, c'est déjà un cadeau que tu te fais.",
  "Le bonheur se trouve souvent dans les choses simples : un café chaud, un rire partagé.",
  "Tu mérites autant de bienveillance envers toi-même que celle que tu donnes aux autres.",
  "Avance à ton rythme, ce qui compte c'est la direction, pas la vitesse.",
  "Prends le temps d'apprécier les gens qui t'entourent aujourd'hui.",
  "Ce n'est pas grave de ne pas tout savoir, l'important est d'essayer.",
  "Ton bien-être d'aujourd'hui prépare ta sérénité de demain.",
  "Respire profondément, tu fais déjà beaucoup mieux que tu ne le penses.",
  "La bienveillance envers toi-même est le point de départ de tout le reste.",
  "Chaque effort que tu fais, même invisible, te rapproche de tes objectifs.",
  "Aujourd'hui est une bonne journée pour être fier de qui tu es en train de devenir.",
]

function getDailyThought(): string {
  const start = new Date(new Date().getFullYear(), 0, 0)
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86400000)
  return DAILY_THOUGHTS[dayOfYear % DAILY_THOUGHTS.length]
}

const amt = (v: number | undefined) => (v === undefined ? '—' : formatAmount(v))
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    let start: number | null = null
    const animate = (ts: number) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      setValue(Math.round((1 - Math.pow(1 - progress, 3)) * target))
      if (progress < 1) raf.current = requestAnimationFrame(animate)
    }
    raf.current = requestAnimationFrame(animate)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, duration])
  return value
}

function HealthArc({ score, color }: { score: number; color: string }) {
  const animated = useCountUp(score)
  const R = 54, cx = 64, cy = 64
  const toRad = (a: number) => (a * Math.PI) / 180
  const startAngle = -210, endAngle = 30
  const arcX = (a: number) => cx + R * Math.cos(toRad(a))
  const arcY = (a: number) => cy + R * Math.sin(toRad(a))
  const fillAngle = startAngle + (animated / 100) * (endAngle - startAngle)
  const trackD = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${R} ${R} 0 1 1 ${arcX(endAngle)} ${arcY(endAngle)}`
  const fillD = animated > 0
    ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${R} ${R} 0 ${fillAngle - startAngle > 180 ? 1 : 0} 1 ${arcX(fillAngle)} ${arcY(fillAngle)}`
    : null
  return (
    <svg width="112" height="84" viewBox="0 0 128 96" style={{ overflow: 'visible' }}>
      <path d={trackD} fill="none" stroke="#E8EAF0" strokeWidth={8} strokeLinecap="round" />
      {fillD && <path d={fillD} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" />}
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={28} fontWeight={800} fill={color} fontFamily="monospace">{animated}</text>
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize={10} fill="#8896B0">/100</text>
    </svg>
  )
}

// ─── Flux sur une période (revenus, factures payées, dettes remboursées) ─────

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d + 1))
}

function chunk<T>(xs: T[], n = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

function usePeriodFlows(from: string, to: string) {
  const [flows, setFlows] = useState<{ incomes: number; bills: number; debts: number } | null>(null)
  const [flowsError, setFlowsError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFlows(null)
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Non authentifié')
        const end = nextDay(to)

        const [incR, facR, debtR] = await Promise.all([
          supabase.from('monthly_incomes').select('amount,received_at,month').eq('user_id', user.id),
          supabase.from('factures').select('id').eq('user_id', user.id),
          supabase.from('debts').select('id,type').eq('user_id', user.id),
        ])
        if (incR.error) throw incR.error
        if (facR.error) throw facR.error
        if (debtR.error) throw debtR.error

        // Même règle que l'onglet Revenus : date de réception, sinon 1er du mois
        const incomes = sum((incR.data ?? [])
          .filter(r => {
            const d = String(r.received_at ?? `${r.month}-01`).slice(0, 10)
            return d >= from && d <= to
          })
          .map(r => Number(r.amount)))

        const facIds = (facR.data ?? []).map(f => f.id)
        const oweIds = (debtR.data ?? []).filter(d => d.type === 'owe').map(d => d.id)

        const [facPays, debtPays] = await Promise.all([
          Promise.all(chunk(facIds).map(ids =>
            supabase.from('facture_payment_history').select('amount')
              .in('facture_id', ids).gte('paid_at', from).lt('paid_at', end))),
          Promise.all(chunk(oweIds).map(ids =>
            supabase.from('debt_payment_history').select('amount')
              .in('debt_id', ids).gte('paid_at', from).lt('paid_at', end))),
        ])
        const total = (rs: any[]) => {
          const bad = rs.find(r => r.error)
          if (bad) throw bad.error
          return sum(rs.flatMap(r => (r.data ?? []).map((x: any) => Number(x.amount))))
        }

        if (!cancelled) {
          setFlows({ incomes, bills: total(facPays), debts: total(debtPays) })
          setFlowsError(null)
        }
      } catch (e: any) {
        console.error('Flux de la période :', e)
        if (!cancelled) setFlowsError(e?.message || 'Erreur de chargement')
      }
    })()
    return () => { cancelled = true }
  }, [from, to, tick])

  return { flows, flowsError, retryFlows: () => setTick(n => n + 1) }
}

// ─── Tuile chiffre : blanche, une info + un contexte, barre facultative ───────

function Tile({ icon, label, value, sub, pct, onClick, wide }: {
  icon: string; label: string; value: string; sub?: string
  pct?: number; onClick: () => void; wide?: boolean
}) {
  return (
    <button onClick={onClick}
      className={`card text-left active:scale-95 transition-all ${wide ? 'col-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <p className="text-[11px] font-semibold text-ink-soft">{label}</p>
        </div>
        <ChevronRight size={12} className="text-ink-soft opacity-50" />
      </div>
      <p className="text-lg font-bold font-mono text-ink">{value}</p>
      {pct !== undefined && (
        <div className="w-full h-1.5 bg-mist-dark rounded-full overflow-hidden mt-2">
          <div className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? 'bg-positive' : 'bg-accent'}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
      )}
      {sub && <p className="text-[11px] text-ink-soft mt-1">{sub}</p>}
    </button>
  )
}

// ─── Chat coach ───────────────────────────────────────────────────────────────

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
            <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center"><span className="text-xl">🤖</span></div>
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
                    className="block w-full text-left text-xs bg-mist text-ink-soft p-3 rounded-2xl hover:bg-mist-dark transition-colors">{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-accent text-white rounded-br-sm' : 'bg-mist text-ink rounded-bl-sm'}`}>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-mist p-3 rounded-2xl rounded-bl-sm flex gap-1">
                {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-ink-soft animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="p-4 border-t border-mist-dark flex gap-2">
          <input className="input flex-1" placeholder="Pose ta question..." value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
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

  // Filtre de période (1J, 5J, 1 mois, 3 mois, Perso) : pilote les 4 tuiles de flux
  const periodState = usePeriod()
  const { period, range } = periodState
  const { flows, flowsError, retryFlows } = usePeriodFlows(range.from, range.to)
  const txInRange = transactions.filter(tx => {
    const d = tx.date.slice(0, 10)
    return d >= range.from && d <= range.to
  })
  const periodExpenses = sum(txInRange.filter(tx => tx.type === 'expense').map(tx => tx.amount))
  const periodTxIncome = sum(txInRange.filter(tx => tx.type === 'income').map(tx => tx.amount))
  const periodIncome = flows ? flows.incomes + periodTxIncome : undefined
  const periodLabel = PERIOD_LABEL[period]

  // Plafonds : même règle que l'onglet Budget (cycle courant de chaque plafond)
  useEffect(() => { getBudgets().then(setBudgets).catch(e => console.error('Budgets:', e)) }, [])
  const { lines } = useSpendingLines(earliestCycleStart(budgets), transactions)
  const budgetStatuses = computeBudgetStatuses(budgets, lines)

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const projects = snapshot?.projects ?? []
  const recent = transactions.slice(0, 3)

  const healthScore = health?.score ?? 0
  const healthColor = health?.color ?? '#8896B0'
  const healthLabel = health?.label ?? 'Chargement…'

  const free = summary?.remainingToLive
  const freeIsNegative = free !== undefined && free < 0
  const hasIncome = !!summary && summary.income > 0
  const spentPct = hasIncome ? Math.min(100, Math.max(0, (summary!.totalOut / summary!.income) * 100)) : 0

  const savingsRate = hasIncome ? `${Math.round((summary!.savedNet / summary!.income) * 100)}%` : '—'
  const debtRate = hasIncome ? `${Math.round((summary!.debtDue / summary!.income) * 100)}%` : '—'
  const safety = summary?.safetyMonths != null ? `${summary.safetyMonths.toFixed(1)}m` : '—'

  // ── « À faire » : 3 lignes maximum, les plus urgentes d'abord ──
  function buildTodos(): Todo[] {
    if (!snapshot || !summary) return []
    const items: Todo[] = []
    const today = isoDate(new Date())

    if (summary.income <= 0) {
      items.push({ key: 'income', tone: 'accent', title: 'Ajoute tes revenus du mois', detail: 'Pour calculer ton reste à vivre', go: 'revenus' })
    }

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
      return
    }
    setForm(emptyForm)
    setShowForm(false)
    setSaving(false)
    onUpdate()
    reload()
  }

  return (
    <div className="space-y-4">

      {(error || flowsError) && (
        <div className="card bg-red-50 border border-red-100 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700">Impossible de charger tes chiffres : {error || flowsError}</p>
          <button onClick={() => { reload(); retryFlows() }} className="text-xs font-semibold text-red-700 underline flex-shrink-0">Réessayer</button>
        </div>
      )}

      {/* ── 1. Reste à vivre : le chiffre principal ── */}
      <div className="card-lg space-y-3">
        <div>
          <p className="text-xs text-ink-soft capitalize">{monthLabel(ym)}</p>
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider mt-1.5">Reste à vivre</p>
          <p className={`text-4xl font-bold font-mono mt-1 ${freeIsNegative ? 'text-danger' : 'text-ink'}`}>{amt(free)}</p>
        </div>
        {hasIncome ? (
          <div className="space-y-1.5">
            <div className="w-full h-2 bg-mist-dark rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${spentPct >= 100 ? 'bg-danger' : 'bg-accent'}`}
                style={{ width: `${spentPct}%` }} />
            </div>
            <p className="text-xs text-ink-soft">
              {formatAmount(summary!.totalOut)} sortis sur {formatAmount(summary!.income)} de revenus
            </p>
          </div>
        ) : summary ? (
          <button onClick={() => onGoToMoney('revenus')} className="text-xs font-semibold text-accent">
            Ajoute tes revenus pour voir où tu en es
          </button>
        ) : null}
      </div>

      {/* ── 2. Filtre de période + chiffres ── */}
      <PeriodFilter {...periodState} activeClass="bg-accent text-white" />

      <div className="grid grid-cols-2 gap-3">
        <Tile icon="💰" label="Revenus" value={amt(periodIncome)}
          sub={`reçus sur ${periodLabel}`} onClick={() => onGoToMoney('revenus')} />
        <Tile icon="💸" label="Dépenses" value={amt(periodExpenses)}
          sub={`dépensées sur ${periodLabel}`} onClick={() => onGoToMoney('transactions')} />
        <Tile icon="🧾" label="Factures" value={amt(flows?.bills)}
          sub={`payées sur ${periodLabel}`} onClick={() => onGoToMoney('factures')} />
        <Tile icon="💳" label="Dettes" value={amt(flows?.debts)}
          sub={`remboursées sur ${periodLabel}`} onClick={() => onGoToMoney('dettes')} />
      </div>

      {/* ── 2. À faire : seulement s'il y a quelque chose ── */}
      {todos.length > 0 && (
        <div className="card">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-1">À faire</p>
          {todos.map(t => {
            const cfg = TONE[t.tone]
            const Icon = cfg.icon
            return (
              <button key={t.key} onClick={() => onGoToMoney(t.go)}
                className="w-full flex items-center gap-3 py-3 border-b border-mist last:border-0 text-left active:scale-[0.99] transition-all">
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
      )}

      <Tile icon="🪙" label="Épargne totale" value={amt(summary?.totalSavings)}
        sub={summary
          ? `${summary.savedNet >= 0 ? '+' : '−'}${formatAmount(Math.abs(summary.savedNet))} ce mois${summary.safetyMonths != null ? ` · ${summary.safetyMonths.toFixed(1)} mois de sécurité` : ''}`
          : undefined}
        onClick={() => onGoToMoney('epargne')} />

      {/* ── 4. Situation financière ── */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Situation financière</p>
            <p className="text-base font-bold mt-0.5" style={{ color: healthColor }}>{healthLabel}</p>
          </div>
          <button onClick={() => setShowChat(true)} aria-label="Poser une question au coach"
            className="w-10 h-10 rounded-2xl bg-accent-light text-accent flex items-center justify-center active:scale-95">
            <MessageCircle size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <HealthArc score={healthScore} color={healthColor} />
          <div className="flex-1 space-y-1.5">
            {(health?.details ?? []).slice(0, 3).map((d, i) => (
              <p key={i} className="text-xs text-ink-soft leading-snug">{d}</p>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-mist">
          {[
            { label: 'Taux épargne', value: savingsRate },
            { label: 'Endettement', value: debtRate },
            { label: 'Mois sécurité', value: safety },
          ].map(m => (
            <div key={m.label} className="text-center">
              <p className="text-sm font-bold font-mono text-ink">{m.value}</p>
              <p className="text-[10px] text-ink-soft mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. Projets ── */}
      {projects.length > 0 && (
        <button onClick={onGoToProjects} className="card w-full text-left active:scale-[0.99] transition-all">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">🎯 Projets ({projects.length})</p>
            <ChevronRight size={14} className="text-ink-soft opacity-50" />
          </div>
          <div className="space-y-2">
            {projects.slice(0, 3).map(p => {
              const pct = p.targetAmount > 0 ? Math.min(100, (p.savedAmount / p.targetAmount) * 100) : 0
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-sm w-5">{p.emoji}</span>
                  <p className="text-xs text-ink font-medium flex-1 truncate">{p.name}</p>
                  <div className="w-20 h-1.5 bg-mist-dark rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#16A34A' : '#3B82F6' }} />
                  </div>
                  <span className="text-[10px] font-mono text-ink-soft w-8 text-right">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
        </button>
      )}

      {/* ── 6. Coach + action ── */}
      <CoachTip message={buildTip()} />

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2 text-base py-4">
        <Plus size={20} /> Ajouter une transaction
      </button>

      {/* ── 7. Récentes (3) ── */}
      {recent.length > 0 && (
        <button onClick={() => onGoToMoney('transactions')} className="card w-full text-left active:scale-[0.99] transition-all">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Récentes</p>
            <span className="text-xs text-accent font-semibold flex items-center gap-0.5">Voir tout <ChevronRight size={12} /></span>
          </div>
          {recent.map(tx => (
            <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-mist last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tx.type === 'income' ? 'bg-positive-light' : 'bg-danger-light'}`}>
                  <span className="text-base">{tx.type === 'income' ? '💰' : '💸'}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{tx.note || tx.category}</p>
                  <p className="text-xs text-ink-soft">{tx.category} · {new Date(tx.date).toLocaleDateString('fr-FR')}</p>
                </div>
              </div>
              <span className={`font-mono text-sm font-bold flex-shrink-0 ml-2 ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
                {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount)}
              </span>
            </div>
          ))}
        </button>
      )}

      {/* ── Pensée du jour : discrète, en bas ── */}
      <p className="text-xs text-ink-soft text-center italic px-6 pb-2">✨ {getDailyThought()}</p>

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvelle transaction</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'expense' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({ ...f, type: 'expense', category: EXPENSE_CATEGORIES[0] }))}>💸 Dépense</button>
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'income' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({ ...f, type: 'income', category: INCOME_CATEGORIES[0] as any }))}>💰 Revenu</button>
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input text-2xl font-bold" type="number" placeholder="0"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: Courses Jumbo" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
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
