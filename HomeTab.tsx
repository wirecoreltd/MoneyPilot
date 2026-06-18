'use client'
import { useState, useRef, useEffect } from 'react'
import { Plus, X, MessageCircle, Send, Rocket } from 'lucide-react'
import {
  Transaction, TransactionType, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  addTransaction, formatAmount, computeCoachPlan, computeHealthScore,
  currentYearMonth, UserProfile, getSavings, getDebts, Debt,
} from '@/lib/storage'
import CoachTip from './CoachTip'

interface Props {
  transactions: Transaction[]
  onUpdate: () => void
  profile: UserProfile
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

// ─── Daily quotes (not finance-related, rotates by day) ───────────────────────
const DAILY_QUOTES = [
  { text: "La gratitude transforme ce que nous avons en suffisance, et plus encore en abondance.", author: "Melody Beattie" },
  { text: "Chaque matin, nous naissons à nouveau. Ce que nous faisons aujourd'hui compte le plus.", author: "Bouddha" },
  { text: "La discipline est le pont entre les objectifs et les accomplissements.", author: "Jim Rohn" },
  { text: "Il ne s'agit pas d'avoir le temps, il s'agit de faire du temps.", author: "Inconnue" },
  { text: "Votre vie ne s'améliore pas par hasard. Elle s'améliore par le changement.", author: "Jim Rohn" },
  { text: "Le courage n'est pas l'absence de peur, c'est la décision que quelque chose d'autre est plus important.", author: "Ambrose Redmoon" },
  { text: "Prends soin de ton corps. C'est le seul endroit où tu dois vivre.", author: "Jim Rohn" },
  { text: "Chaque expert a été un jour un débutant.", author: "Helen Hayes" },
  { text: "La paix intérieure commence au moment où tu refuses de laisser une personne ou un événement contrôler tes émotions.", author: "Inconnue" },
  { text: "Nous ne voyons pas les choses telles qu'elles sont, nous les voyons telles que nous sommes.", author: "Anaïs Nin" },
  { text: "Ce qui ne nous tue pas nous rend plus forts.", author: "Friedrich Nietzsche" },
  { text: "La plus grande gloire n'est pas de ne jamais tomber, mais de se relever à chaque chute.", author: "Confucius" },
  { text: "Sois le changement que tu veux voir dans le monde.", author: "Gandhi" },
  { text: "La vie, c'est ce qui arrive quand on est occupé à faire d'autres projets.", author: "John Lennon" },
  { text: "Le succès c'est d'aller d'échec en échec sans perdre son enthousiasme.", author: "Winston Churchill" },
  { text: "Un voyage de mille lieues commence toujours par un premier pas.", author: "Lao-Tseu" },
  { text: "La simplicité est la sophistication suprême.", author: "Léonard de Vinci" },
  { text: "Celui qui déplace les montagnes commence par enlever les petites pierres.", author: "Confucius" },
  { text: "Ne juge pas chaque jour à la récolte que tu fais, mais aux graines que tu plantes.", author: "Robert Louis Stevenson" },
  { text: "Tout ce dont tu as besoin existe déjà en toi.", author: "Inconnue" },
  { text: "L'imagination est plus importante que le savoir.", author: "Albert Einstein" },
  { text: "Vis comme si tu devais mourir demain, apprends comme si tu devais vivre toujours.", author: "Gandhi" },
  { text: "La meilleure façon de prédire l'avenir, c'est de le créer.", author: "Peter Drucker" },
  { text: "Ce n'est pas ce qui nous arrive, mais comment nous réagissons qui compte.", author: "Épictète" },
  { text: "Chaque jour est une nouvelle chance de changer ta vie.", author: "Inconnue" },
  { text: "La beauté du monde réside dans la diversité de ses habitants.", author: "Inconnue" },
  { text: "Sois toi-même, les autres sont déjà pris.", author: "Oscar Wilde" },
  { text: "Ce que nous sommes est le résultat de ce que nous avons pensé.", author: "Bouddha" },
  { text: "La vraie richesse, c'est d'avoir peu de besoins.", author: "Épictète" },
  { text: "Rien n'est impossible à qui veut vraiment.", author: "Inconnue" },
  { text: "L'optimisme est une forme de courage.", author: "Inconnue" },
]

function getDailyQuote() {
  const day = new Date().getDate()
  return DAILY_QUOTES[day % DAILY_QUOTES.length]
}

// ─── Animated counter ─────────────────────────────────────────────────────────
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

// ─── Health gauge arc ─────────────────────────────────────────────────────────
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
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={28} fontWeight={700} fill={color} fontFamily="monospace">{animated}</text>
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize={10} fill="#8896B0">/100</text>
    </svg>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, icon, bgClass, colorClass, borderClass,
}: { label: string; value: string; icon: string; bgClass: string; colorClass: string; borderClass: string }) {
  return (
    <div className={`${bgClass} border ${borderClass} rounded-2xl p-4`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-base">{icon}</span>
        <p className={`text-[10px] font-bold uppercase tracking-wider ${colorClass}`}>{label}</p>
      </div>
      <p className={`text-lg font-bold font-mono ${colorClass}`}>{value}</p>
    </div>
  )
}

export default function HomeTab({ transactions, onUpdate, profile }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showAllTx, setShowAllTx] = useState(false)
  const [form, setForm] = useState(empty)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [totalSavings, setTotalSavings] = useState(0)
  const [debts, setDebts] = useState<Debt[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const ym = currentYearMonth()
  const monthTxs = transactions.filter(t => t.date.startsWith(ym))
  const income = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  // Total bills = expense transactions tagged as recurring/bills categories
  const BILL_CATEGORIES = ['Loyer', 'Électricité', 'Eau', 'Internet', 'Téléphone', 'Assurance', 'Abonnement', 'Factures']
  const totalBills = monthTxs
    .filter(t => t.type === 'expense' && BILL_CATEGORIES.some(c => t.category?.includes(c)))
    .reduce((s, t) => s + t.amount, 0)
  const balance = income - expenses
  const owedDebts = debts.filter(d => d.type === 'owe')
  const totalDebt = owedDebts.reduce((s, d) => s + d.remaining, 0)
  const health = computeHealthScore(transactions, [], [], [])
  const plan = computeCoachPlan([], [], [], ym)
  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const dailyQuote = getDailyQuote()

  const healthColor = health.score >= 80 ? '#16A34A' : health.score >= 60 ? '#2563EB' : health.score >= 40 ? '#D97706' : '#DC2626'
  const healthLabel = health.score >= 80 ? 'Excellent' : health.score >= 60 ? 'Bien' : health.score >= 40 ? 'À améliorer' : 'Fragile'

  const tip = plan.alerts[0] ??
    (balance > 0
      ? `${profile.firstName}, tu as ${formatAmount(balance)} de solde ce mois. ${plan.freeMoney > 0 ? `Mets ${formatAmount(plan.savingsSuggestion)} de côté dès maintenant !` : ''}`
      : `Ajoute tes revenus du mois pour que le Coach t'aide.`)

  const displayedTx = showAllTx ? transactions : transactions.slice(0, 5)

  useEffect(() => {
    getSavings().then(gs => setTotalSavings(gs.reduce((s, g) => s + g.saved, 0)))
    getDebts().then(ds => setDebts(ds))
  }, [])

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
      const context = `Profil : ${profile.firstName}, ${profile.situation}, ${profile.children} enfants, Revenu mensuel : ${profile.monthlyIncome} Rs (${profile.incomeType}), Objectif : ${profile.mainGoal}, Dettes : ${profile.hasDebts ? 'oui' : 'non'}. Ce mois : Revenus ${formatAmount(income)}, Dépenses ${formatAmount(expenses)}, Factures ${formatAmount(totalBills)}, Solde ${formatAmount(balance)}. Score santé : ${health.score}/100 (${health.label}). Argent libre estimé : ${formatAmount(plan.freeMoney)}. Total dettes : ${formatAmount(totalDebt)}.`
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

  return (
    <div className="space-y-4">

      {/* ── Logo / Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-xl font-bold tracking-tight text-ink">
            Fin<span className="text-positive">Copilot</span>
          </p>
          <p className="text-[10px] text-ink-soft mt-0.5">Votre copilote financier au quotidien.</p>
        </div>
        <div className="w-11 h-11 rounded-2xl bg-positive flex items-center justify-center">
          <Rocket size={20} className="text-white" />
        </div>
      </div>

      {/* ── 4 KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Revenus" value={formatAmount(income)} icon="💰"
          bgClass="bg-green-50" colorClass="text-green-700" borderClass="border-green-100" />
        <KpiCard label="Total factures" value={formatAmount(totalBills)} icon="🧾"
          bgClass="bg-orange-50" colorClass="text-orange-700" borderClass="border-orange-100" />
        <KpiCard label="Épargne totale" value={formatAmount(totalSavings)} icon="🪙"
          bgClass="bg-teal-50" colorClass="text-teal-700" borderClass="border-teal-100" />
        <KpiCard label="Argent libre" value={formatAmount(plan.freeMoney > 0 ? plan.freeMoney : balance)} icon="📈"
          bgClass="bg-blue-50" colorClass="text-blue-700" borderClass="border-blue-100" />
      </div>

      {/* ── Situation financière (dettes) ─────────────────────────────────── */}
      <div className="card-lg">
        <p className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-3">Situation financière</p>

        {owedDebts.length === 0 ? (
          <p className="text-sm text-ink-soft py-2">Aucune dette enregistrée.</p>
        ) : (
          <div className="space-y-0">
            {owedDebts.map((d, i) => (
              <div key={d.id ?? i} className="flex items-center justify-between py-3 border-b border-mist last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                  <p className="text-sm text-ink">{d.person ?? 'Dette'}</p>
                </div>
                <span className="font-mono text-sm font-bold text-danger">{formatAmount(d.remaining)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Total dettes */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-mist bg-red-50 rounded-xl px-3 py-2.5">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wider">Total dettes restantes</p>
          <span className="font-mono text-base font-bold text-red-700">{formatAmount(totalDebt)}</span>
        </div>
      </div>

      {/* ── Santé financière ─────────────────────────────────────────────── */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Santé financière</p>
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

      {/* ── Coach tip ────────────────────────────────────────────────────── */}
      <CoachTip message={tip} />

      {/* ── Pensée du jour ───────────────────────────────────────────────── */}
      <div className="card border-l-4 border-positive rounded-2xl px-4 py-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <p className="text-[10px] font-bold text-positive uppercase tracking-wider">Pensée du jour</p>
        </div>
        <p className="text-sm text-ink leading-relaxed italic">"{dailyQuote.text}"</p>
        <p className="text-xs text-ink-soft">— {dailyQuote.author}</p>
      </div>

      {/* ── Bouton ajouter ───────────────────────────────────────────────── */}
      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2 text-base py-4">
        <Plus size={20} /> Ajouter une transaction
      </button>

      {/* ── Transactions (toutes, avec toggle) ──────────────────────────── */}
      {transactions.length > 0 && (
        <div className="card space-y-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">
              {showAllTx ? 'Toutes les transactions' : 'Récentes'}
            </p>
            <button
              onClick={() => setShowAllTx(v => !v)}
              className="text-xs text-accent font-semibold">
              {showAllTx ? 'Réduire' : `Voir tout (${transactions.length})`}
            </button>
          </div>
          {displayedTx.map(tx => (
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
        </div>
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
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'expense' ? 'bg-danger text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({ ...f, type: 'expense', category: EXPENSE_CATEGORIES[0] }))}>
                💸 Dépense</button>
              <button className={`flex-1 py-3 text-sm font-bold ${form.type === 'income' ? 'bg-positive text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setForm(f => ({ ...f, type: 'income', category: INCOME_CATEGORIES[0] as any }))}>
                💰 Revenu</button>
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
                    {[
                      'Est-ce que je peux me permettre une voiture à crédit ?',
                      'Comment réduire mes dépenses ce mois ?',
                      'Quelle dette rembourser en premier ?',
                    ].map(q => (
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
