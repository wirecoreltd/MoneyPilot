// lib/groq.ts — appel LLM côté serveur uniquement (la clé GROQ_API_KEY ne quitte jamais le serveur).

export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }

export async function groqChat(opts: {
  messages: LlmMessage[]
  json?: boolean
  maxTokens?: number
  timeoutMs?: number
}): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY manquante')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000)
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: opts.maxTokens ?? 1000,
        temperature: 0.4,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        messages: opts.messages,
      }),
    })
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  } finally {
    clearTimeout(timer)
  }
}
