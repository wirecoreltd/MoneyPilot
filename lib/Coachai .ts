// lib/coachAI.ts — prompts + normalisation des réponses du LLM (serveur).
import { urgencyFromScore } from './finance'
import type { HealthScore } from './finance'

export const COACH_ANALYSIS_PROMPT = `Tu es un coach financier expert, direct et bienveillant. Tu parles en français à un utilisateur mauricien (montants en Rs).

Tu reçois son profil et des chiffres DÉJÀ CALCULÉS par l'application : score de santé, reste à vivre, plan du mois, dettes, épargne, projets, historique. Ces chiffres sont fiables : ne les recalcule pas et ne les contredis pas. Le score est fourni : ne le modifie pas et n'en invente pas d'autre.

RÈGLE SUR LES DETTES : la charge d'une dette = sa MENSUALITÉ. Le capital restant est du contexte : ne le compare JAMAIS au revenu mensuel.

RÈGLES STRICTES :
1. N'invente aucun nom de dette, d'épargne, de projet ni aucun chiffre absent du contexte. Utilise les noms exacts.
2. Si une cible snowball est indiquée, recommande d'augmenter le paiement de CETTE dette avec le montant suggéré.
3. Si une dette est presque soldée, propose de rediriger la mensualité libérée vers l'épargne ou la dette suivante (nomme les deux).
4. Utilise l'historique des 3 derniers mois pour repérer les tendances ; cite les mois et les montants.
5. Chaque "detail" contient au moins un chiffre réel et, si possible, un nom réel.
6. Si des données manquent (ex. aucun revenu saisi), dis-le au lieu de supposer.
7. budgetRecommendation : répartis la "Marge du mois" en catégories concrètes selon les dépenses réelles ; "current" = moyenne réelle des 3 derniers mois pour la catégorie (0 si aucune donnée).

Réponds UNIQUEMENT en JSON valide, sans texte avant ni après :
{
  "greeting": "Accroche directe et personnalisée (max 20 mots)",
  "situation": "Diagnostic honnête en 2-3 phrases, avec chiffres et noms réels",
  "contradictions": ["Observation précise nommant une dette/épargne/catégorie réelle avec son chiffre"],
  "actions": [
    { "label": "Cette semaine|Ce mois-ci|Dans 3 mois|Dans 6 mois", "title": "Titre court et actionnable",
      "detail": "Explication concrète avec chiffres et noms réels", "impact": "Impact chiffré", "priority": "urgent|important|strategy" }
  ],
  "budgetRecommendation": [ { "category": "Nom", "emoji": "emoji", "recommended": 0, "current": 0 } ],
  "insight": "La phrase-clé que seul un vrai coach dirait, ancrée dans la situation réelle"
}`

export const COACH_CHAT_PROMPT = `Tu es un coach financier expert, bienveillant et direct. Tu parles en français. Tu as accès aux chiffres réels de l'utilisateur (ci-dessous). Réponds de façon concise (3-4 phrases max), pratique et personnalisée, sans jargon. N'invente aucun chiffre absent du contexte. La charge d'une dette est sa mensualité, jamais son capital total.`

export const ONBOARDING_PROMPT = `Tu es un coach financier bienveillant. Tu parles en français. Tu reçois le profil d'un nouvel utilisateur mauricien (montants en Rs) et son score initial, DÉJÀ calculé : ne le modifie pas.
Réponds UNIQUEMENT en JSON :
{
  "diagnostic": "Résumé de la situation en 10 mots max",
  "problems": ["problème urgent 1", "problème 2"],
  "plan": [
    {"priority": 1, "timeframe": "Ce mois-ci", "action": "action concrète et chiffrée"},
    {"priority": 2, "timeframe": "Dans 3 mois", "action": "action concrète et chiffrée"},
    {"priority": 3, "timeframe": "Dans 6 mois", "action": "action concrète et chiffrée"}
  ],
  "motivation": "Message personnalisé de 1-2 phrases"
}
Maximum 3 problèmes. Base-toi uniquement sur les informations fournies.`

export function parseJson(text: string): any {
  const clean = text.replace(/```json|```/g, '').trim()
  try { return JSON.parse(clean) } catch {
    const a = clean.indexOf('{'); const b = clean.lastIndexOf('}')
    if (a >= 0 && b > a) return JSON.parse(clean.slice(a, b + 1))
    throw new Error('Réponse IA illisible')
  }
}

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(/\s/g, '')) : v
  return typeof n === 'number' && isFinite(n) ? n : 0
}
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(v as string) ? (v as T) : fallback

/** Le LLM n'a plus la main sur score / urgence : ils viennent du calcul déterministe. */
export function normalizeAnalysis(raw: any, firstName: string, health: HealthScore) {
  return {
    greeting: str(raw?.greeting, 200) || `${firstName}, voici ton analyse.`,
    situation: str(raw?.situation, 700),
    urgency: urgencyFromScore(health.score),
    score: health.score,
    scoreEvolution: 0, // sera calculé quand un historique de scores sera stocké
    contradictions: (Array.isArray(raw?.contradictions) ? raw.contradictions : []).map((c: unknown) => str(c)).filter(Boolean).slice(0, 4),
    actions: (Array.isArray(raw?.actions) ? raw.actions : []).slice(0, 5).map((a: any) => ({
      label: str(a?.label, 40), title: str(a?.title, 120), detail: str(a?.detail, 700), impact: str(a?.impact, 200),
      priority: oneOf(a?.priority, ['urgent', 'important', 'strategy'] as const, 'important'),
    })),
    budgetRecommendation: (Array.isArray(raw?.budgetRecommendation) ? raw.budgetRecommendation : []).slice(0, 10).map((b: any) => ({
      category: str(b?.category, 60), emoji: str(b?.emoji, 8) || '📦',
      recommended: Math.max(0, Math.round(num(b?.recommended))), current: Math.max(0, Math.round(num(b?.current))),
    })),
    insight: str(raw?.insight, 400),
  }
}
