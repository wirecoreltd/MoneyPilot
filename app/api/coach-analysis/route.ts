import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, rateLimit } from '@/lib/serverAuth'
import { loadMonthSnapshot, loadProfile } from '@/lib/data'
import { buildCoachPlan, computeHealthScore, computeMonthSummary, currentYearMonth } from '@/lib/finance'
import { buildCoachContext } from '@/lib/coachContext'
import { COACH_ANALYSIS_PROMPT, normalizeAnalysis, parseJson } from '@/lib/coachAI'
import { groqChat } from '@/lib/groq'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Le client n'envoie AUCUN contexte : tout est reconstruit ici depuis la base,
// avec le même moteur de calcul (lib/finance.ts) que l'écran.
export async function POST(req: NextRequest) {
  const auth = await getUserFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  if (!rateLimit(`analysis:${auth.user.id}`, 8, 60 * 60_000)) {
    return NextResponse.json({ error: 'Trop de demandes, réessaie dans quelques minutes.' }, { status: 429 })
  }

  try {
    const month = currentYearMonth()
    const [profile, snap] = await Promise.all([
      loadProfile(auth.client, auth.user.id),
      loadMonthSnapshot(auth.client, auth.user.id, month),
    ])
    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })

    const summary = computeMonthSummary(snap)
    const health = computeHealthScore(summary, snap.debts)
    const plan = buildCoachPlan(snap, summary)
    const context = buildCoachContext(profile, snap, summary, plan, health)

    const text = await groqChat({
      messages: [
        { role: 'system', content: COACH_ANALYSIS_PROMPT },
        { role: 'user', content: context },
      ],
      json: true,
      maxTokens: 2000,
    })
    return NextResponse.json(normalizeAnalysis(parseJson(text), profile.firstName, health))
  } catch (e) {
    console.error('coach-analysis:', e)
    return NextResponse.json({ error: "Analyse indisponible pour le moment." }, { status: 502 })
  }
}
