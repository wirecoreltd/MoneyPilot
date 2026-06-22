'use client'
import { useState, useRef, useEffect } from 'react'
import { Plus, X, MessageCircle, Send, Wallet, ChevronRight } from 'lucide-react'
import {
  Transaction, TransactionType, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  addTransaction, formatAmount, computeCoachPlan, computeHealthScore,
  currentYearMonth, UserProfile, getSavings, getDebts, getProjects,
  Project, Debt, SavingsGoal,
} from '@/lib/storage'
import CoachTip from './CoachTip'
import { supabase } from '@/lib/supabase'

export type MoneySubTab = 'transactions' | 'revenus' | 'factures' | 'dettes' | 'epargne' | 'budget'
interface Props {
  transactions: Transaction[]
  onUpdate: () => void
  profile: UserProfile
  onGoToMoney: (sub: MoneySubTab) => void
  onGoToProjects: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const empty = {
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
  const diff = Date.now() - start.getTime()
  const dayOfYear = Math.floor(diff / 86400000)
  return DAILY_THOUGHTS[dayOfYear % DAILY_THOUGHTS.length]
}

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    let start: number | null = null
    const animate = (ts: number) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
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
    <svg width="128" height="96" viewBox="0 0 128 96" style={{ overflow: 'visible' }}>
      <path d={trackD} fill="none" stroke="#E8EAF0" strokeWidth={8} strokeLinecap="round" />
      {fillD && <path d={fillD} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" style={{ transition: 'stroke 0.3s' }} />}
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={28} fontWeight={800} fill={color} fontFamily="monospace">{animated}</text>
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize={10} fill="#8896B0">/100</text>
    </svg>
  )
}

export default function HomeTab({ transactions, onUpdate, profile, onGoToMoney, onGoToProjects }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [form, setForm] = useState(empty)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [totalSavings, setTotalSavings] = useState(0)
  const [totalDebt, setTotalDebt] = useState(0)
  const [totalFactures, setTotalFactures] = useState(0)
  const [debts, setDebts] = useState<Debt[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [paidTotal, setPaidTotal] = useState(0)
  const [totalDue, setTotalDue] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const ym = currentYearMonth()
  const monthTxs = transactions.filter(t => t.date.startsWith(ym))
  const income = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalTransactions = expenses
  const balance = income - expenses
  const recent = transactions.slice(0, 5)
  const health = computeHealthScore(transactions, [], [], [])
  const plan = computeCoachPlan([], [], [], ym)
  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const dailyThought = getDailyThought()

  const healthColor = health.score >= 80 ? '#16A34A' : health.score >= 60 ? '#2563EB' : health.score >= 40 ? '#D97706' : '#DC2626'
  const healthLabel = health.score >= 80 ? 'Excellent' : health.score >= 60 ? 'Bien' : health.score >= 40 ? 'À améliorer' : 'Fragile'

  const tip = plan.alerts[0] ??
    (balance > 0
      ? `${profile.firstName}, tu as ${formatAmount(balance)} de solde ce mois. ${plan.freeMoney > 0 ? `Mets ${formatAmount(plan.savingsSuggestion)} de côté dès maintenant !` : ''}`
      : `Ajoute tes revenus du mois pour que le Coach t'aide.`)

  useEffect(() => {
    getSavings().then(gs => setTotalSavings(gs.reduce((s, g) => s + g.saved, 0)))

    getDebts().then(async ds => {
      setDebts(ds)
      setTotalDebt(ds.filter(d => d.type === 'owe').reduce((s, d) => s + d.remaining, 0))

      // ── Dettes du mois : utilise debt_payment_history (bonne table) ──
      const owedDebts = ds.filter(d => d.type === 'owe' && d.minimumPayment > 0)
      const due = owedDebts.reduce((s, d) => s + d.minimumPayment, 0)
      setTotalDue(due)

      if (owedDebts.length > 0) {
        const [year, month] = ym.split('-').map(Number)
        const lastDay = new Date(year, month, 0).getDate()
        const { data } = await supabase
          .from('debt_payment_history')
          .select('amount')
          .in('debt_id', owedDebts.map(d => d.id))
          .gte('paid_at', `${ym}-01`)
          .lte('paid_at', `${ym}-${String(lastDay).padStart(2, '0')}`)
        const paid = (data ?? []).reduce((s, c) => s + Number(c.amount), 0)
        setPaidTotal(paid)
      }
    })

    getProjects().then(setProjects)

    async function loadFactures() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('factures').select('amount').eq('user_id', user.id).eq('month', ym)
      setTotalFactures((data ?? []).reduce((s, f) => s + Number(f.amount), 0))
    }
    loadFactures()
  }, [ym])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) return
    addTransaction({ ...form, amount: Number(form.amount) })
    setForm(empty)
    setShowForm(false)
    onUpdate()
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setChatLoading(true)
    try {
      const context = `Profil : ${profile.firstName}, ${profile.situation}, ${profile.children} enfants, Revenu mensuel : ${profile.monthlyIncome} Rs (${profile.incomeType}), Objectif : ${profile.mainGoal}, Dettes : ${profile.hasDebts ? 'oui' : 'non'}. Ce mois : Revenus ${formatAmount(income)}, Dépenses ${formatAmount(expenses)}, Solde ${formatAmount(balance)}. Score santé : ${health.score}/100 (${health.label}). Argent libre estimé : ${formatAmount(plan.freeMoney)}`
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: `Tu es un coach financier expert, bienveillant et direct. Tu parles en français. Tu as accès aux données financières réelles de l'utilisateur. Réponds de façon concise (3-4 phrases max), pratique et personnalisée. Pas de jargon inutile. Contexte utilisateur : ${context}`,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      })
      const result = await response.json()
      const reply = result.content?.[0]?.text || "Je suis là pour t'aider. Pose-moi une question sur tes finances."
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Désolé, je rencontre un problème. Réessaie dans un moment.' }])
    }
    setChatLoading(false)
  }

  const kpis = [
    {
      label: 'Revenus', value: formatAmount(income),
      icon: '💰', bg: 'bg-green-50', color: 'text-green-700', border: 'border-green-100',
      action: () => onGoToMoney('revenus'),
    },
    {
      label: 'Total transactions', value: formatAmount(totalTransactions),
      icon: '💸', bg: 'bg-orange-50', color: 'text-orange-700', border: 'border-orange-100',
      action: () => onGoToMoney('transactions'),
    },
    {
      label: 'Total factures', value: formatAmount(totalFactures),
      icon: '🧾', bg: 'bg-yellow-50', color: 'text-yellow-700', border: 'border-yellow-100',
      action: () => onGoToMoney('factures'),
    },
    {
      label: 'Dettes du mois',
      value: totalDue > 0 ? `${formatAmount(paidTotal)} / ${formatAmount(totalDue)}` : formatAmount(totalDebt),
      icon: '💳', bg: 'bg-red-50', color: 'text-red-700', border: 'border-red-100',
      action: () => onGoToMoney('dettes'),
    },
    {
      label: 'Épargne totale', value: formatAmount(totalSavings),
      icon: '🪙', bg: 'bg-green-50', color: 'text-green-700', border: 'border-green-100',
      action: () => onGoToMoney('epargne'),
    },
    {
      label: 'Argent libre', value: formatAmount(plan.freeMoney > 0 ? plan.freeMoney : balance),
      icon: '📈', bg: 'bg-blue-50', color: 'text-blue-700', border: 'border-blue-100',
      action: () => onGoToMoney('budget'),
    },
  ]

  return (
    <div className="space-y-4">

      <AppBrandHeader />

      <div className="card bg-purple-50 border border-purple-100">
        <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-1">✨ Pensée du jour</p>
        <p className="text-sm text-purple-800 leading-snug">{dailyThought}</p>
      </div>

      {/* ── KPIs cliquables ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            onClick={kpi.action}
            className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4 text-left active:scale-95 transition-all`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{kpi.icon}</span>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${kpi.color}`}>{kpi.label}</p>
              </div>
              <ChevronRight size={12} className={`${kpi.color} opacity-50`} />
            </div>
            <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
          </button>
        ))}
      </div>

      {/* ── Projets ──────────────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <button
          onClick={onGoToProjects}
          className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-left w-full active:scale-95 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-base">🎯</span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                Projets ({projects.length})
              </p>
            </div>
            <ChevronRight size={12} className="text-blue-700 opacity-50" />
          </div>
          <div className="space-y-2">
            {projects.slice(0, 3).map(p => {
              const pct = Math.min(100, (p.savedAmount / p.targetAmount) * 100)
              const done = p.savedAmount >= p.targetAmount
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-sm w-5">{p.emoji}</span>
                  <p className="text-xs text-blue-800 font-medium flex-1 truncate">{p.name}</p>
                  <div className="w-20 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: done ? '#16A34A' : '#3B82F6' }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-blue-600 w-8 text-right">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
            {projects.length > 3 && (
              <p className="text-[10px] text-blue-500 text-center">+{projects.length - 3} autre{projects.length - 3 > 1 ? 's' : ''}</p>
            )}
          </div>
        </button>
      )}

      {/* ── Situation financière ─────────────────────────────────────────── */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Situation financière</p>
            <p className="text-base font-bold mt-0.5" style={{ color: healthColor }}>{healthLabel}</p>
          </div>
          <button
            onClick={() => setShowChat(true)}
            className="w-10 h-10 rounded-2xl bg-accent-light text-accent flex items-center justify-center active:scale-95">
            <MessageCircle size={18} />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <HealthArc score={health.score} color={healthColor} />
          <div className="flex-1 space-y-2">
            {health.details.slice(0, 3).map((d, i) => (
              <p key={i} className="text-xs text-ink-soft leading-snug">{d}</p>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-mist">
          {[
            { label: 'Taux épargne', value: income > 0 ? `${Math.round((totalSavings / (income || 1)) * 10)}%` : '—' },
            { label: 'Endettement', value: income > 0 ? `${Math.round((totalDebt / (profile.monthlyIncome || 1)) * 100)}%` : '—' },
            { label: 'Mois sécurité', value: expenses > 0 ? `${Math.round(totalSavings / (expenses || 1))}m` : '—' },
          ].map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-sm font-bold font-mono text-ink">{m.value}</p>
              <p className="text-[10px] text-ink-soft mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      <CoachTip message={tip} />

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2 text-base py-4">
        <Plus size={20} /> Ajouter une transaction
      </button>

      {/* ── Transactions récentes cliquables ─────────────────────────────── */}
      {recent.length > 0 && (
        <button
          onClick={() => onGoToMoney('transactions')}
          className="card w-full text-left space-y-1 active:scale-[0.99] transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Récentes</p>
            <span className="text-xs text-accent font-semibold flex items-center gap-0.5">
              Voir tout <ChevronRight size={12} />
            </span>
          </div>
          {recent.map(tx => (
            <div key={tx.id} className="flex items-center justify-between py-3 border-b border-mist last:border-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0
                  ${tx.type === 'income' ? 'bg-positive-light' : 'bg-danger-light'}`}>
                  <span className="text-lg">{tx.type === 'income' ? '💰' : '💸'}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{tx.note || tx.category}</p>
                  <p className="text-xs text-ink-soft">
                    {tx.category} · {new Date(tx.date).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
              <span className={`font-mono text-sm font-bold ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
                {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount)}
              </span>
            </div>
          ))}
        </button>
      )}

      {/* ── Modal : ajouter transaction ───────────────────────────────────── */}
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
            <button className="btn-primary w-full py-4 text-base" onClick={handleSubmit}>Enregistrer</button>
          </div>
        </div>
      )}

      {/* ── Chat coach IA ─────────────────────────────────────────────────── */}
      {showChat && (
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
              <button className="btn-icon bg-mist" onClick={() => setShowChat(false)}><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">💬</p>
                  <p className="font-semibold text-ink">Pose-moi une question</p>
                  <p className="text-sm text-ink-soft mt-1">J'ai accès à toutes tes données financières</p>
                  <div className="mt-4 space-y-2">
                    {['Est-ce que je peux me permettre une voiture à crédit ?', 'Comment réduire mes dépenses ce mois ?', 'Quelle dette rembourser en premier ?'].map(q => (
                      <button key={q} onClick={() => setChatInput(q)}
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
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-mist p-3 rounded-2xl rounded-bl-sm flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-ink-soft animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 border-t border-mist-dark flex gap-2">
              <input className="input flex-1" placeholder="Pose ta question..."
                value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()} />
              <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading}
                className="w-12 h-12 rounded-2xl bg-accent text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all flex-shrink-0">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
