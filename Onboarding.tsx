'use client'
import { useState } from 'react'
import { UserProfile, saveUserProfile } from '@/lib/storage'
import { initialScoreFromAnswers } from '@/lib/finance'
import { authedPost } from '@/lib/apiClient'

interface Props { onComplete: (profile: UserProfile) => void }

// ─── Types ────────────────────────────────────────────────────────────────────
type Step =
  | 'welcome'
  | 'situation'
  | 'income'
  | 'expenses'
  | 'debts'
  | 'savings'
  | 'goal'
  | 'stress'
  | 'analysis'

interface PlanStep { priority: number; timeframe: string; action: string }
interface OnboardingAnalysis {
  diagnostic: string
  problems: string[]
  plan: PlanStep[]
  motivation: string
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const SITUATIONS = [
  { id: 'single',        emoji: '👤', label: 'Célibataire',  desc: 'Je vis seul(e)' },
  { id: 'couple',        emoji: '👫', label: 'En couple',    desc: 'Deux revenus possibles' },
  { id: 'family',        emoji: '👨‍👩‍👧', label: 'Famille',     desc: 'Avec enfant(s) à charge' },
  { id: 'single-parent', emoji: '👩‍👧', label: 'Parent solo', desc: 'Seul(e) avec enfant(s)' },
]

const INCOME_TYPES = [
  { id: 'fixed',    emoji: '📅', label: 'Fixe',     desc: 'Salaire stable chaque mois' },
  { id: 'variable', emoji: '📈', label: 'Variable', desc: 'Freelance, commissions...' },
  { id: 'mixed',    emoji: '🔀', label: 'Mixte',    desc: 'Fixe + revenus variables' },
  { id: 'none',     emoji: '⏸️', label: 'Sans revenu', desc: 'Chômage, étudiant...' },
]

const EXPENSE_LEVELS = [
  { id: 'low',    emoji: '✅', label: 'Maîtrisées',   desc: 'Je sais où va mon argent', pct: '< 50%' },
  { id: 'medium', emoji: '⚠️', label: 'Correctes',   desc: 'Quelques dépenses excessives', pct: '50–70%' },
  { id: 'high',   emoji: '🔴', label: 'Élevées',     desc: 'Je dépense trop, j\'en suis conscient(e)', pct: '70–90%' },
  { id: 'crisis', emoji: '🆘', label: 'Hors contrôle', desc: 'Mes dépenses dépassent mes revenus', pct: '> 100%' },
]

const DEBT_TYPES = [
  { id: 'none',      emoji: '✅', label: 'Aucune dette',    desc: 'Je suis libre de toute dette' },
  { id: 'credit',    emoji: '🏦', label: 'Crédit bancaire', desc: 'Prêt voiture, immobilier...' },
  { id: 'personal',  emoji: '🤝', label: 'Dettes perso',   desc: 'Famille, amis...' },
  { id: 'multiple',  emoji: '💳', label: 'Plusieurs dettes', desc: 'Crédits + dettes diverses' },
  { id: 'overdue',   emoji: '🚨', label: 'Dettes en retard', desc: 'Paiements manqués, rappels...' },
]

const SAVINGS_LEVELS = [
  { id: 'none',    emoji: '🪹', label: 'Rien du tout',   desc: 'Je n\'ai pas d\'épargne' },
  { id: 'little',  emoji: '🌱', label: '< 3 mois',      desc: 'Petit coussin de sécurité' },
  { id: 'medium',  emoji: '🌿', label: '3–6 mois',      desc: 'Fonds d\'urgence correct' },
  { id: 'good',    emoji: '🌳', label: '> 6 mois',      desc: 'Bonne réserve financière' },
]

const GOALS = [
  { id: 'survive',   emoji: '🆘', label: 'Survivre',     desc: 'Payer mes factures, finir le mois' },
  { id: 'stabilize', emoji: '⚖️', label: 'Me stabiliser', desc: 'Contrôler mes dépenses, stopper les dettes' },
  { id: 'build',     emoji: '🏗️', label: 'Construire',   desc: 'Épargner, préparer l\'avenir' },
  { id: 'prosper',   emoji: '🚀', label: 'Prospérer',    desc: 'Investir, faire fructifier mon patrimoine' },
]

const STRESS_LEVELS = [
  { id: 'none',   emoji: '😌', label: 'Aucun stress',      desc: 'Les finances ne m\'inquiètent pas' },
  { id: 'low',    emoji: '😐', label: 'Léger',             desc: 'Parfois je m\'inquiète un peu' },
  { id: 'medium', emoji: '😟', label: 'Modéré',            desc: 'L\'argent m\'occupe l\'esprit régulièrement' },
  { id: 'high',   emoji: '😰', label: 'Très stressant',    desc: 'Les finances impactent mon quotidien' },
]

// Plan de secours si l'analyse IA est indisponible (le score, lui, est toujours réel).
function fallbackAnalysis(firstName: string): OnboardingAnalysis {
  return {
    diagnostic: 'Prêt à démarrer',
    problems: ['Lance-toi en enregistrant tes premières transactions'],
    plan: [
      { priority: 1, timeframe: "Aujourd'hui", action: 'Ajoute tes revenus du mois en cours' },
      { priority: 2, timeframe: 'Cette semaine', action: 'Note toutes tes dépenses fixes' },
      { priority: 3, timeframe: 'Ce mois-ci', action: 'Identifie où tu peux économiser 10%' },
    ],
    motivation: `${firstName}, la meilleure décision financière que tu puisses prendre, c'est de commencer maintenant.`,
  }
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
const STEPS_ORDER: Step[] = ['welcome', 'situation', 'income', 'expenses', 'debts', 'savings', 'goal', 'stress', 'analysis']

function ProgressBar({ step }: { step: Step }) {
  const idx = STEPS_ORDER.indexOf(step)
  const total = STEPS_ORDER.length - 1 // don't count 'analysis' as a user step
  const pct = Math.round((idx / (total - 1)) * 100)
  return (
    <div className="w-full mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Étape {idx + 1} / {total}</span>
        <span className="text-xs font-bold text-white/80">{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-white/20 rounded-full">
        <div
          className="h-full bg-white rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Option card ──────────────────────────────────────────────────────────────
function OptionCard({
  emoji, label, desc, badge, selected, onClick, color = 'blue'
}: {
  emoji: string; label: string; desc: string; badge?: string
  selected: boolean; onClick: () => void; color?: 'blue' | 'red' | 'green' | 'orange'
}) {
  const colors = {
    blue:   { border: 'border-blue-400',   bg: 'bg-blue-50',   check: 'bg-blue-500' },
    red:    { border: 'border-red-400',    bg: 'bg-red-50',    check: 'bg-red-500' },
    green:  { border: 'border-green-400',  bg: 'bg-green-50',  check: 'bg-green-500' },
    orange: { border: 'border-orange-400', bg: 'bg-orange-50', check: 'bg-orange-500' },
  }
  const c = colors[color]
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]
        ${selected ? `${c.border} ${c.bg}` : 'border-white/20 bg-white/10 hover:bg-white/15'}`}
    >
      <span className="text-2xl flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-bold text-sm ${selected ? 'text-gray-800' : 'text-white'}`}>{label}</p>
          {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white/80">{badge}</span>}
        </div>
        <p className={`text-xs mt-0.5 leading-snug ${selected ? 'text-gray-500' : 'text-white/60'}`}>{desc}</p>
      </div>
      {selected && (
        <div className={`w-6 h-6 rounded-full ${c.check} flex items-center justify-center flex-shrink-0`}>
          <span className="text-white text-xs font-bold">✓</span>
        </div>
      )}
    </button>
  )
}

// ─── Coach message bubble ─────────────────────────────────────────────────────
function CoachBubble({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
        <span className="text-xl">🤖</span>
      </div>
      <div className="bg-white/15 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-3 flex-1">
        <p className="text-sm text-white leading-relaxed">{message}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [aiLoading, setAiLoading] = useState(false)
  const [analysis, setAnalysis] = useState<OnboardingAnalysis | null>(null)
  const [initialScore, setInitialScore] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [data, setData] = useState({
    firstName: '',
    situation: '' as UserProfile['situation'],
    children: 0,
    monthlyIncome: '' as string,
    secondIncome: '' as string,
    incomeType: '' as UserProfile['incomeType'],
    expenseLevel: '',
    debtType: '',
    debtAmount: '' as string,
    savingsLevel: '',
    mainGoal: '' as UserProfile['mainGoal'],
    stressLevel: '',
    hasDebts: false,
  })

  // ── Navigation ───────────────────────────────────────────────────────────────
  function next(s: Step) { setStep(s) }

  // ── Dynamic coach messages ────────────────────────────────────────────────────
  function getCoachMessage(): string {
    switch (step) {
      case 'welcome':
        return "Bonjour ! Je suis ton coach financier. Je vais analyser ta situation pour te donner un plan d'action personnalisé. Sois honnête — plus tu l'es, meilleurs seront mes conseils."
      case 'situation':
        return `${data.firstName ? `Enchanté ${data.firstName} !` : 'Enchanté !'} D'abord, dis-moi ta situation familiale — elle détermine tes besoins et priorités financières.`
      case 'income':
        return "Parlons de tes revenus. C'est la base de tout plan financier. Je veux comprendre ce qui rentre réellement chaque mois."
      case 'expenses':
        return "Maintenant les dépenses. Sois honnête avec toi-même — c'est la clé pour identifier où tu perds de l'argent."
      case 'debts':
        return "Les dettes, c'est souvent le frein n°1 à la liberté financière. Dis-moi ta réalité — sans jugement."
      case 'savings':
        return "L'épargne, c'est ton filet de sécurité. Même une petite réserve peut tout changer en cas de coup dur."
      case 'goal':
        return "Maintenant la question la plus importante : qu'est-ce que tu veux vraiment accomplir financièrement ?"
      case 'stress':
        return "Dernière question — le stress financier est réel et impacte toutes les décisions. Sois honnête."
      default:
        return ''
    }
  }

  // ── Analyse : score par règles (finance.ts) + texte par l'IA (route serveur) ───
  async function generateAnalysis() {
    // Le score ne dépend jamais du modèle : il est calculé ici, à partir des réponses.
    setInitialScore(initialScoreFromAnswers({
      incomeType: data.incomeType,
      expenseLevel: data.expenseLevel,
      debtType: data.debtType,
      savingsLevel: data.savingsLevel,
      stressLevel: data.stressLevel,
    }))
    setStep('analysis')
    setAiLoading(true)

    try {
      const { analysis: result } = await authedPost<{ analysis: OnboardingAnalysis }>('/api/onboarding-analysis', {
        answers: {
          firstName: data.firstName,
          situation: data.situation,
          children: data.children,
          monthlyIncome: Number(data.monthlyIncome) || 0,
          secondIncome: Number(data.secondIncome) || 0,
          incomeType: data.incomeType,
          expenseLevel: data.expenseLevel,
          debtType: data.debtType,
          debtAmount: Number(data.debtAmount) || 0,
          savingsLevel: data.savingsLevel,
          mainGoal: data.mainGoal,
          stressLevel: data.stressLevel,
        },
      })
      setAnalysis(result)
    } catch {
      setAnalysis(fallbackAnalysis(data.firstName))
    }
    setAiLoading(false)
  }

  // ── Finish onboarding ─────────────────────────────────────────────────────────
  async function finish() {
    if (saving) return
    setSaving(true)
    setSaveError(null)

    const profile: UserProfile = {
      completed: true,
      firstName: data.firstName || 'Ami',
      situation: data.situation || 'single',
      children: data.children,
      monthlyIncome: Number(data.monthlyIncome) || 0,
      incomeType: data.incomeType || 'fixed',
      mainGoal: data.mainGoal || 'stabilize',
      hasDebts: data.debtType !== 'none' && data.debtType !== '',
      currency: 'MUR',
      language: 'fr',
      createdAt: new Date().toISOString(),
      // Champs supplémentaires (nécessitent les colonnes correspondantes dans `profiles`).
      // Si l'utilisateur passe l'introduction, on n'invente ni score ni plan.
      secondIncome: Number(data.secondIncome) || 0,
      debtAmount: Number(data.debtAmount) || 0,
      expenseLevel: data.expenseLevel || undefined,
      debtType: data.debtType || undefined,
      savingsLevel: data.savingsLevel || undefined,
      stressLevel: data.stressLevel || undefined,
      coachPlan: analysis ? JSON.stringify(analysis) : undefined,
      initialScore: analysis ? initialScore : undefined,
    } as any

    try {
      await saveUserProfile(profile)
      onComplete(profile)
    } catch {
      setSaveError("Impossible d'enregistrer ton profil pour le moment. Vérifie ta connexion et réessaie.")
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  const coachMsg = getCoachMessage()

  const scoreColor = initialScore >= 70 ? '#16A34A' : initialScore >= 40 ? '#D97706' : '#DC2626'
  const scoreLabel = initialScore >= 70 ? 'Bonne situation' : initialScore >= 40 ? 'À améliorer' : 'Situation urgente'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E40AF] via-[#2563EB] to-[#0EA5E9] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* ── WELCOME ─────────────────────────────────────────────────────── */}
        {step === 'welcome' && (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-white/20 backdrop-blur flex items-center justify-center">
                <span className="text-4xl">🤖</span>
              </div>
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight">MoneyPilot</h1>
                <p className="text-white/70 text-sm mt-1">Ton coach financier personnel</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🤖</span>
                <p className="text-white text-sm leading-relaxed">
                  Bonjour ! Je suis ton coach financier IA. Je vais te poser <strong>8 questions clés</strong> pour analyser ta situation et te donner un <strong>plan d'action personnalisé</strong>.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">🔒</span>
                <p className="text-white/80 text-sm leading-relaxed">
                  Tes réponses restent privées. Plus tu es honnête, meilleur sera ton plan.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 space-y-4 shadow-2xl">
              <label className="block">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Ton prénom</p>
                <input
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 bg-gray-50 text-lg font-semibold text-gray-800 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                  placeholder="Ex: Marie, Jean..."
                  value={data.firstName}
                  onChange={e => setData(d => ({ ...d, firstName: e.target.value }))}
                  autoFocus
                />
              </label>
              <button
                className="w-full py-4 bg-blue-600 text-white font-bold text-base rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40 shadow-lg shadow-blue-500/30"
                onClick={() => next('situation')}
                disabled={!data.firstName.trim()}
              >
                Commencer mon analyse →
              </button>
            </div>
          </div>
        )}

        {/* ── SITUATION ───────────────────────────────────────────────────── */}
        {step === 'situation' && (
          <div className="space-y-4">
            <ProgressBar step={step} />
            <CoachBubble message={coachMsg} />
            <div className="space-y-3">
              <h2 className="text-xl font-black text-white">Ta situation familiale</h2>
              {SITUATIONS.map(s => (
                <OptionCard
                  key={s.id}
                  emoji={s.emoji} label={s.label} desc={s.desc}
                  selected={data.situation === s.id}
                  onClick={() => setData(d => ({ ...d, situation: s.id as any }))}
                  color="blue"
                />
              ))}
            </div>

            {(data.situation === 'family' || data.situation === 'single-parent') && (
              <div className="bg-white/10 rounded-2xl p-4">
                <p className="text-white text-sm font-semibold mb-3">Nombre d'enfants à charge :</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, '5+'].map((n, i) => (
                    <button
                      key={n}
                      onClick={() => setData(d => ({ ...d, children: i + 1 }))}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all
                        ${data.children === i + 1 ? 'bg-white text-blue-600' : 'bg-white/20 text-white'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              className="w-full py-4 bg-white text-blue-600 font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
              onClick={() => next('income')}
              disabled={!data.situation}
            >
              Continuer →
            </button>
          </div>
        )}

        {/* ── INCOME ──────────────────────────────────────────────────────── */}
        {step === 'income' && (
          <div className="space-y-4">
            <ProgressBar step={step} />
            <CoachBubble message={coachMsg} />
            <h2 className="text-xl font-black text-white">Tes revenus mensuels</h2>

            <div className="space-y-3">
              {INCOME_TYPES.map(t => (
                <OptionCard
                  key={t.id}
                  emoji={t.emoji} label={t.label} desc={t.desc}
                  selected={data.incomeType === t.id}
                  onClick={() => setData(d => ({ ...d, incomeType: t.id as any }))}
                  color="blue"
                />
              ))}
            </div>

            {data.incomeType && data.incomeType !== 'none' && (
              <div className="bg-white rounded-2xl p-4 space-y-3 shadow-lg">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    {data.incomeType === 'variable' ? 'Revenu moyen / mois (Rs)' : 'Revenu net / mois (Rs)'}
                  </label>
                  <input
                    type="number"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-lg font-bold text-gray-800 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    placeholder="Ex: 35000"
                    value={data.monthlyIncome}
                    onChange={e => setData(d => ({ ...d, monthlyIncome: e.target.value }))}
                  />
                </div>
                {data.situation === 'couple' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                      2ème revenu du foyer (Rs) — optionnel
                    </label>
                    <input
                      type="number"
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-base font-semibold text-gray-800 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                      placeholder="Ex: 28000"
                      value={data.secondIncome}
                      onChange={e => setData(d => ({ ...d, secondIncome: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            )}

            <button
              className="w-full py-4 bg-white text-blue-600 font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
              onClick={() => next('expenses')}
              disabled={!data.incomeType || (data.incomeType !== 'none' && !data.monthlyIncome)}
            >
              Continuer →
            </button>
          </div>
        )}

        {/* ── EXPENSES ────────────────────────────────────────────────────── */}
        {step === 'expenses' && (
          <div className="space-y-4">
            <ProgressBar step={step} />
            <CoachBubble message={coachMsg} />
            <h2 className="text-xl font-black text-white">Tes dépenses actuelles</h2>
            <p className="text-white/70 text-sm">Quel % de tes revenus dépenses-tu ?</p>

            <div className="space-y-3">
              {EXPENSE_LEVELS.map(e => (
                <OptionCard
                  key={e.id}
                  emoji={e.emoji} label={e.label} desc={e.desc} badge={e.pct}
                  selected={data.expenseLevel === e.id}
                  onClick={() => setData(d => ({ ...d, expenseLevel: e.id }))}
                  color={e.id === 'low' ? 'green' : e.id === 'crisis' ? 'red' : e.id === 'high' ? 'red' : 'orange'}
                />
              ))}
            </div>

            <button
              className="w-full py-4 bg-white text-blue-600 font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
              onClick={() => next('debts')}
              disabled={!data.expenseLevel}
            >
              Continuer →
            </button>
          </div>
        )}

        {/* ── DEBTS ───────────────────────────────────────────────────────── */}
        {step === 'debts' && (
          <div className="space-y-4">
            <ProgressBar step={step} />
            <CoachBubble message={coachMsg} />
            <h2 className="text-xl font-black text-white">Ta situation dettes</h2>

            <div className="space-y-3">
              {DEBT_TYPES.map(d => (
                <OptionCard
                  key={d.id}
                  emoji={d.emoji} label={d.label} desc={d.desc}
                  selected={data.debtType === d.id}
                  onClick={() => setData(prev => ({ ...prev, debtType: d.id, hasDebts: d.id !== 'none' }))}
                  color={d.id === 'none' ? 'green' : d.id === 'overdue' ? 'red' : d.id === 'multiple' ? 'red' : 'orange'}
                />
              ))}
            </div>

            {data.debtType && data.debtType !== 'none' && (
              <div className="bg-white rounded-2xl p-4 shadow-lg">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Montant total estimé de tes dettes (Rs)
                </label>
                <input
                  type="number"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-lg font-bold text-gray-800 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                  placeholder="Ex: 150000"
                  value={data.debtAmount}
                  onChange={e => setData(d => ({ ...d, debtAmount: e.target.value }))}
                />
              </div>
            )}

            <button
              className="w-full py-4 bg-white text-blue-600 font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
              onClick={() => next('savings')}
              disabled={!data.debtType}
            >
              Continuer →
            </button>
          </div>
        )}

        {/* ── SAVINGS ─────────────────────────────────────────────────────── */}
        {step === 'savings' && (
          <div className="space-y-4">
            <ProgressBar step={step} />
            <CoachBubble message={coachMsg} />
            <h2 className="text-xl font-black text-white">Ton épargne actuelle</h2>
            <p className="text-white/70 text-sm">En nombre de mois de dépenses couverts</p>

            <div className="space-y-3">
              {SAVINGS_LEVELS.map(s => (
                <OptionCard
                  key={s.id}
                  emoji={s.emoji} label={s.label} desc={s.desc}
                  selected={data.savingsLevel === s.id}
                  onClick={() => setData(d => ({ ...d, savingsLevel: s.id }))}
                  color={s.id === 'good' ? 'green' : s.id === 'none' ? 'red' : 'orange'}
                />
              ))}
            </div>

            <button
              className="w-full py-4 bg-white text-blue-600 font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
              onClick={() => next('goal')}
              disabled={!data.savingsLevel}
            >
              Continuer →
            </button>
          </div>
        )}

        {/* ── GOAL ────────────────────────────────────────────────────────── */}
        {step === 'goal' && (
          <div className="space-y-4">
            <ProgressBar step={step} />
            <CoachBubble message={coachMsg} />
            <h2 className="text-xl font-black text-white">Ton objectif financier</h2>

            <div className="space-y-3">
              {GOALS.map(g => (
                <OptionCard
                  key={g.id}
                  emoji={g.emoji} label={g.label} desc={g.desc}
                  selected={data.mainGoal === g.id}
                  onClick={() => setData(d => ({ ...d, mainGoal: g.id as any }))}
                  color={g.id === 'prosper' || g.id === 'build' ? 'green' : g.id === 'survive' ? 'red' : 'blue'}
                />
              ))}
            </div>

            <button
              className="w-full py-4 bg-white text-blue-600 font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
              onClick={() => next('stress')}
              disabled={!data.mainGoal}
            >
              Continuer →
            </button>
          </div>
        )}

        {/* ── STRESS ──────────────────────────────────────────────────────── */}
        {step === 'stress' && (
          <div className="space-y-4">
            <ProgressBar step={step} />
            <CoachBubble message={coachMsg} />
            <h2 className="text-xl font-black text-white">Ton niveau de stress financier</h2>

            <div className="space-y-3">
              {STRESS_LEVELS.map(s => (
                <OptionCard
                  key={s.id}
                  emoji={s.emoji} label={s.label} desc={s.desc}
                  selected={data.stressLevel === s.id}
                  onClick={() => setData(d => ({ ...d, stressLevel: s.id }))}
                  color={s.id === 'none' ? 'green' : s.id === 'high' ? 'red' : s.id === 'medium' ? 'orange' : 'blue'}
                />
              ))}
            </div>

            <button
              className="w-full py-4 bg-white text-blue-600 font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
              onClick={generateAnalysis}
              disabled={!data.stressLevel}
            >
              Analyser ma situation 🔍
            </button>
          </div>
        )}

        {/* ── ANALYSIS ────────────────────────────────────────────────────── */}
        {step === 'analysis' && (
          <div className="space-y-4">
            {aiLoading ? (
              <div className="text-center py-16 space-y-6">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-white/20 flex items-center justify-center">
                  <span className="text-4xl animate-pulse">🤖</span>
                </div>
                <div>
                  <p className="text-white font-bold text-xl">Analyse en cours...</p>
                  <p className="text-white/60 text-sm mt-2">Je construis ton plan personnalisé</p>
                </div>
                <div className="flex justify-center gap-2">
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className="w-2.5 h-2.5 rounded-full bg-white animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <div className="bg-white/10 rounded-2xl p-4 text-left space-y-2">
                  {['Analyse de ta situation...', 'Calcul de tes priorités...', 'Construction du plan...'].map((msg, i) => (
                    <p key={i} className="text-white/70 text-sm flex items-center gap-2">
                      <span className="animate-pulse">⚡</span> {msg}
                    </p>
                  ))}
                </div>
              </div>
            ) : analysis ? (
              <div className="space-y-4">
                {/* Score card */}
                <div className="bg-white rounded-3xl p-6 shadow-2xl">
                  <div className="text-center mb-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Ton score financier initial</p>
                    <div className="relative w-32 h-32 mx-auto">
                      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="#F1F5F9" strokeWidth="10"/>
                        <circle
                          cx="60" cy="60" r="50" fill="none"
                          stroke={scoreColor} strokeWidth="10"
                          strokeDasharray={`${2 * Math.PI * 50}`}
                          strokeDashoffset={`${2 * Math.PI * 50 * (1 - initialScore / 100)}`}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 1s ease' }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <p className="text-3xl font-black" style={{ color: scoreColor }}>{initialScore}</p>
                        <p className="text-xs text-gray-400">/100</p>
                      </div>
                    </div>
                    <p className="font-bold text-base mt-2" style={{ color: scoreColor }}>{scoreLabel}</p>
                    <p className="text-sm text-gray-500 mt-1">{analysis.diagnostic}</p>
                  </div>
                </div>

                {/* Problems */}
                {analysis.problems.length > 0 && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 space-y-2">
                    <p className="text-white font-bold text-sm uppercase tracking-wide mb-3">🔍 Points à traiter</p>
                    {analysis.problems.map((p, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-orange-300 text-sm flex-shrink-0 mt-0.5">▸</span>
                        <p className="text-white/80 text-sm">{p}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Plan */}
                <div className="bg-white rounded-3xl p-5 shadow-xl space-y-3">
                  <p className="font-black text-gray-800 text-base">🗺️ Ton plan d'action</p>
                  {analysis.plan.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-white text-sm"
                        style={{ backgroundColor: i === 0 ? '#DC2626' : i === 1 ? '#D97706' : '#16A34A' }}>
                        {p.priority}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{p.timeframe}</p>
                        <p className="text-sm font-semibold text-gray-700 mt-0.5">{p.action}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Motivation */}
                <div className="bg-white/10 rounded-2xl p-4">
                  <p className="text-white text-sm leading-relaxed text-center italic">"{analysis.motivation}"</p>
                </div>

                <button
                  onClick={finish}
                  disabled={saving}
                  className="w-full py-4 bg-white text-blue-600 font-black text-base rounded-2xl active:scale-[0.98] transition-all shadow-2xl disabled:opacity-60"
                >
                  {saving ? 'Enregistrement...' : 'Démarrer MoneyPilot 🚀'}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {/* Skip on first screen */}
        {step === 'welcome' && (
          <button
            onClick={finish}
            disabled={saving}
            className="w-full mt-4 text-white/40 text-xs py-2 hover:text-white/60 transition-colors disabled:opacity-40"
          >
            Passer l'introduction
          </button>
        )}

        {/* Erreur de sauvegarde du profil */}
        {saveError && (
          <p className="mt-4 text-center text-sm text-white bg-red-500/30 rounded-2xl p-3">{saveError}</p>
        )}
      </div>
    </div>
  )
}
