import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { context } = await req.json()

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un coach financier expert, direct et bienveillant. Tu parles en français.
Tu reçois le profil financier complet d'un utilisateur mauricien.

TON RÔLE : Analyse, identifie les problèmes réels, dis ce qui ne va pas, donne un plan d'action concret et chiffré.

Réponds UNIQUEMENT en JSON valide :
{
  "greeting": "Phrase d'accroche directe (max 20 mots)",
  "situation": "Diagnostic honnête en 2 phrases max",
  "urgency": "low|medium|high|critical",
  "score": number,
  "scoreEvolution": number,
  "contradictions": ["contradiction 1"],
  "actions": [
    {
      "label": "Cette semaine|Ce mois-ci|Dans 3 mois|Dans 6 mois",
      "title": "Titre court et actionnable",
      "detail": "Explication concrète avec chiffres en Rs",
      "impact": "Impact concret ex: Libère +3 500 Rs/mois",
      "priority": "urgent|important|strategy"
    }
  ],
  "insight": "La phrase-clé que seul un vrai coach dirait"
}`,
        },
        { role: 'user', content: context },
      ],
    }),
  })

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''

  try {
    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Parse error', raw: text }, { status: 500 })
  }
}
