'use client'
import { useState, useRef, useEffect } from 'react'
import { Plus, X, MessageCircle, Send, TrendingUp, TrendingDown, Wallet, Shield } from 'lucide-react'
import {
  Transaction, TransactionType, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  addTransaction, formatAmount, computeCoachPlan, computeHealthScore,
  currentYearMonth, UserProfile, getSavings, getDebts,
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
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={28} fontWeight={800} fill={color} fontFamily="monospace">{animated}</text>
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize={10} fill="#8896B0">/100</text>
    </svg>
  )
}

export default function HomeTab({ transactions, onUpdate, profile }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [form, setForm] = useState(empty)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [totalSavings, setTotalSavings] = useState(0)
  const [totalDebt, setTotalDebt] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const ym = currentYearMonth()
  const monthTxs = transactions.filter(t => t.date.startsWith(ym))
  const income = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const balance = income - expenses
  const recent = transactions.slice(0, 5)
  const health = computeHealthScore(transactions, [], [], [])
  const plan = computeCoachPlan([], [], [], ym)
  const netWorth = totalSavings - totalDebt
  const monthName = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const healthColor = health.score >= 80 ? '#16A34A' : health.score >= 60 ? '#2563EB' : health.score >= 40 ? '#D97706' : '#DC2626'
  const healthLabel = health.score >= 80 ? 'Excellent' : health.score >= 60 ? 'Bien' : health.score >= 40 ? 'À améliorer' : 'Fragile'

  const tip = plan.alerts[0] ??
    (balance > 0
      ? `${profile.firstName}, tu as ${formatAmount(balance)} de solde ce mois. ${plan.freeMoney > 0 ? `Mets ${formatAmount(plan.savingsSuggestion)} de côté dès maintenant !` : ''}`
      : `Ajoute tes revenus du mois pour que le Coach t'aide.`)

  useEffect(() => {
    getSavings().then(gs => setTotalSavings(gs.reduce((s, g) => s + g.saved, 0)))
    getDebts().then(ds => setTotalDebt(ds.filter(d => d.type === 'owe').reduce((s, d) => s + d.remaining, 0)))
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
      const reply = result.content?.[0]?.text || 'Je suis là pour t\'aider. Pose-moi une question sur tes finances.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Désolé, je rencontre un problème. Réessaie dans un moment.' }])
    }
    setChatLoading(false)
  }

  return (
    <div className="space-y-4">

      {/* ── Carte héro solde ──────────────────────────────────────────────── */}
      <div className={`rounded-3xl p-5 text-white ${balance >= 0
        ? 'bg-gradient-to-br from-accent to-blue-700'
        : 'bg-gradient-to-br from-danger to-red-700'}`}>
        <p className="text-xs font-semibold opacity-70 uppercase tracking-widest mb-1 capitalize">{monthName}</p>
        <p className="text-5xl font-bold font-mono tracking-tight mb-1">{formatAmount(balance)}</p>
        <p className="text-xs opacity-60 mb-5">solde disponible</p>
        <div className="flex gap-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] opacity-60 uppercase tracking-wide">Revenus</p>
              <p className="text-sm font-bold font-mono">{formatAmount(income)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <TrendingDown size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] opacity-60 uppercase tracking-wide">Dépenses</p>
              <p className="text-sm font-bold font-mono">{formatAmount(expenses)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Patrimoine net', value: formatAmount(netWorth), icon: '💎', bg: 'bg-purple-50', color: 'text-purple-700', border: 'border-purple-100' },
          { label: 'Épargne totale', value: formatAmount(totalSavings), icon: '🐖', bg: 'bg-green-50', color: 'text-green-700', border: 'border-green-100' },
          { label: 'Dette restante', value: formatAmount(totalDebt), icon: '💳', bg: 'bg-red-50', color: 'text-red-700', border: 'border-red-100' },
          { label: 'Argent libre', value: formatAmount(plan.freeMoney > 0 ? plan.freeMoney : balance), icon: '📈', bg: 'bg-blue-50', color: 'text-blue-700', border: 'border-blue-100' },
        ].map((kpi) => (
          <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4`}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">{kpi.icon}</span>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${kpi.color}`}>{kpi.label}</p>
            </div>
            <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
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

        {/* 3 métriques clés */}
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

      {/* ── Bouton ajouter ───────────────────────────────────────────────── */}
      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2 text-base py-4">
        <Plus size={20} /> Ajouter une transaction
      </button>

      {/* ── Transactions récentes ─────────────────────────────────────────── */}
      {recent.length > 0 && (
        <div className="card space-y-1">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-3">Récentes</p>
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
              <span className={`font-mono text-sm font-bold
                ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
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
                      <div key={i} className="w-2 h-2 rounded-full bg-ink-soft animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
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
