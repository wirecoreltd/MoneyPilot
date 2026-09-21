// lib/apiClient.ts — côté navigateur : POST authentifié vers nos routes /api/*
import { supabase } from './supabase'

export async function authedPost<T>(url: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Session expirée, reconnecte-toi.')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Erreur ${res.status}`)
  return json as T
}
