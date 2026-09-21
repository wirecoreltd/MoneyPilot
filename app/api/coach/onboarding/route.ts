import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, rateLimit } from '@/lib/serverAuth'
import { initialScoreFromAnswers } from '@/lib/finance'
import { ONBOARDING_PROMPT, parseJson } from '@/lib/coachAI'
import { groqChat } from '@/lib/groq'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Valeurs autorisées (liste blanche) : rien de "libre" n'atteint le prompt, sauf le prénom nettoyé.
const ALLOWED = {
  situation: ['single', 'couple', 'family', 'single-parent'],
  incomeType: ['fixed', 'variable', 'mixed', 'none'],
  expenseLevel: ['low', 'medium', 'high', 'crisis'],
  debtType: ['none', 'credit', 'personal', 'multiple', 'overdue'],
  savingsLevel: ['none', 'little', 'medium', 'good'],
  mainGoal: ['survive', 'stabilize', 'build', 'prosper'],
  stressLevel: ['none', 'low', 'medium', 'high'],
} as const

const money = (v: unknown) => Math.min(1e8, Math.max(0, Math.round(Number(v) || 0)))

export async function POST(req: NextRequest) {
  const auth = await getUserFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!rateLimit(`onboarding:${auth.user.id}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'Trop de demandes, réessaie plus tard.' }, { status: 429 })
  }

  let a: any
  try { a = (await req.json())?.answers } catch { a = null }
  if (!a || typeof a !== 'object') return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })

  for (const [key, list] of Object.entries(ALLOWED)) {
    if (!(list as readonly string[]).includes(a[key])) {
      return NextResponse.json({ error: `Valeur invalide : ${key}` }, { status: 400 })
    }
  }

  const firstName = String(a.firstName ?? '').replace(/[^\p{L}\p{N} '-]/gu, '').slice(0, 30) || 'Ami'
  const children = Math.min(20, Math.max(0, Math.round(Number(a.children) || 0)))
  const score = initialScoreFromAnswers(a)

  const summary = [
    `Prénom : ${firstName}`,
    `Situation familiale : ${a.situation}${children > 0 ? ` (${children} enfant(s))` : ''}`,
    `Revenu mensuel net : ${money(a.monthlyIncome)} Rs${a.secondIncome ? ` + ${money(a.secondIncome)} Rs (2ème revenu)` : ''}`,
    `Type de revenu : ${a.incomeType}`,
    `Niveau de dépenses : ${a.expenseLevel}`,
    `Situation dettes : ${a.debtType}${a.debtAmount ? ` — capital total estimé : ${money(a.debtAmount)} Rs` : ''}`,
    `Niveau d'épargne : ${a.savingsLevel}`,
    `Objectif principal : ${a.mainGoal}`,
    `Stress financier : ${a.stressLevel}`,
    `Score initial (calculé, fourni) : ${score}/100`,
  ].join('\n')

  try {
    const text = await groqChat({
      messages: [
        { role: 'system', content: ONBOARDING_PROMPT },
        { role: 'user', content: `Profil :\n${summary}` },
      ],
      json: true,
      maxTokens: 900,
    })
    const raw = parseJson(text)
    const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')
    return NextResponse.json({
      score,
      diagnostic: s(raw?.diagnostic, 120),
      problems: (Array.isArray(raw?.problems) ? raw.problems : []).map((p: unknown) => s(p, 200)).filter(Boolean).slice(0, 3),
      plan: (Array.isArray(raw?.plan) ? raw.plan : []).slice(0, 3).map((p: any, i: number) => ({
        priority: i + 1, timeframe: s(p?.timeframe, 40), action: s(p?.action, 300),
      })),
      motivation: s(raw?.motivation, 300),
    })
  } catch (e) {
    console.error('onboarding-analysis:', e)
    return NextResponse.json({ error: 'Analyse indisponible pour le moment.' }, { status: 502 })
  }
}
