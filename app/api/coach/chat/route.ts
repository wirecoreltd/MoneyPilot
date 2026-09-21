import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, rateLimit } from '@/lib/serverAuth'
import { loadMonthSnapshot, loadProfile } from '@/lib/data'
import { buildCoachPlan, computeHealthScore, computeMonthSummary, currentYearMonth } from '@/lib/finance'
import { buildChatContext } from '@/lib/coachContext'
import { COACH_CHAT_PROMPT } from '@/lib/coachAI'
import { groqChat } from '@/lib/groq'
import type { LlmMessage } from '@/lib/groq'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const auth = await getUserFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  if (!rateLimit(`chat:${auth.user.id}`, 30, 60 * 60_000)) {
    return NextResponse.json({ error: 'Trop de messages, réessaie dans quelques minutes.' }, { status: 429 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Requête invalide' }, { status: 400 }) }

  // Le client n'envoie que la conversation ; on la nettoie et on la borne.
  const history: LlmMessage[] = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-10)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }))
  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Message manquant' }, { status: 400 })
  }

  try {
    const [profile, snap] = await Promise.all([
      loadProfile(auth.client, auth.user.id),
      loadMonthSnapshot(auth.client, auth.user.id, currentYearMonth()),
    ])
    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })

    const summary = computeMonthSummary(snap)
    const health = computeHealthScore(summary, snap.debts)
    const plan = buildCoachPlan(snap, summary)
    const context = buildChatContext(profile, summary, health, plan)

    const reply = await groqChat({
      messages: [{ role: 'system', content: `${COACH_CHAT_PROMPT}\n\nContexte utilisateur :\n${context}` }, ...history],
      maxTokens: 600,
    })
    return NextResponse.json({ reply: reply.trim() || "Je suis là pour t'aider. Pose-moi une question sur tes finances." })
  } catch (e) {
    console.error('coach-chat:', e)
    return NextResponse.json({ error: 'Le coach est indisponible pour le moment.' }, { status: 502 })
  }
}
