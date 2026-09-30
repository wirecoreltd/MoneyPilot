// lib/groq.ts — appel LLM côté serveur uniquement (la clé GROQ_API_KEY ne quitte jamais le serveur).

export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }

const JSON_HINT = 'Réponds uniquement avec un objet JSON valide, sans texte autour ni balises markdown.'

// Retire les fences ```json et isole le premier objet JSON de la réponse
function extractJson(text: string): string {
  const cleaned = text.replace(/```json|```/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  return start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned
}

export async function groqChat(opts: {
  messages: LlmMessage[]
  json?: boolean
  maxTokens?: number
  timeoutMs?: number
}): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY manquante')

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  const isReasoning = /gpt-oss|qwen3|deepseek-r1/i.test(model)

  async function call(strictJson: boolean, messages: LlmMessage[]): Promise<string> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          // Marge large : un modèle à raisonnement dépense des tokens avant de répondre
          max_tokens: opts.maxTokens ?? (isReasoning ? 4000 : 1500),
          temperature: 0.4,
          ...(isReasoning ? { reasoning_effort: 'low' } : {}),
          ...(strictJson ? { response_format: { type: 'json_object' } } : {}),
          messages,
        }),
      })
      if (!res.ok) throw new Error(`Groq ${res.status} [${model}]: ${(await res.text()).slice(0, 500)}`)
      const data = await res.json()
      return data.choices?.[0]?.message?.content ?? ''
    } finally {
      clearTimeout(timer)
    }
  }

  // Le mot « JSON » doit apparaître dans le prompt en mode JSON
  const messages: LlmMessage[] = opts.json
    ? [{ role: 'system', content: JSON_HINT }, ...opts.messages]
    : opts.messages

  if (!opts.json) return call(false, messages)

  // 1re tentative : mode JSON strict
  try {
    const out = await call(true, messages)
    if (out.trim()) return extractJson(out)
    console.warn('[groq] réponse vide en mode JSON, nouvel essai sans response_format')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('json_validate_failed')) throw e
    console.warn('[groq] json_validate_failed, nouvel essai sans response_format')
  }

  // 2e tentative : sans mode strict, on parse nous-mêmes
  const out = await call(false, messages)
  if (!out.trim()) throw new Error(`Groq [${model}] : réponse vide après retry`)
  return extractJson(out)
}
