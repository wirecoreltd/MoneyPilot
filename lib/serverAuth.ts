// lib/serverAuth.ts — À n'utiliser que dans les routes API (serveur).
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Lit "Authorization: Bearer <access_token>", vérifie le JWT auprès de Supabase et renvoie
 * un client qui agit AU NOM de l'utilisateur (donc les policies RLS s'appliquent aussi côté serveur).
 * Suppose NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY (adapte si ton lib/supabase.ts utilise d'autres noms).
 */
export async function getUserFromRequest(req: Request): Promise<{ client: SupabaseClient; user: User } | null> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return null
  return { client, user: data.user }
}

// Limiteur en mémoire. Sur Vercel chaque instance serverless a son propre compteur :
// c'est un garde-fou "au mieux" contre l'abus. Pour une limite stricte, brancher Upstash Redis.
const hits = new Map<string, number[]>()

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  if (recent.length >= limit) { hits.set(key, recent); return false }
  recent.push(now)
  hits.set(key, recent)
  return true
}
