// lib/spaces.ts
import { supabase } from './supabase'

export interface Space {
  id: string
  name: string
  emoji: string
  kind: 'perso' | 'pro'
  sortOrder: number
}

const map = (r: any): Space => ({
  id: r.id, name: r.name, emoji: r.emoji, kind: r.kind, sortOrder: r.sort_order,
})

export async function fetchSpaces(): Promise<Space[]> {
  const { data, error } = await supabase
    .from('spaces').select('*').eq('archived', false)
    .order('sort_order').order('created_at')
  if (error) throw error
  return (data ?? []).map(map)
}

export async function createSpace(name: string, emoji: string, kind: 'perso' | 'pro'): Promise<Space> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const { count } = await supabase
    .from('spaces').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  const { data, error } = await supabase
    .from('spaces')
    .insert({ user_id: user.id, name: name.trim(), emoji, kind, sort_order: count ?? 0 })
    .select().single()
  if (error) throw error
  return map(data)
}

export async function updateSpace(id: string, fields: { name?: string; emoji?: string; kind?: 'perso' | 'pro' }): Promise<void> {
  const { error } = await supabase.from('spaces').update(fields).eq('id', id)
  if (error) throw error
}

// On archive au lieu de supprimer : les données de l'espace sont conservées.
export async function archiveSpace(id: string): Promise<void> {
  const { error } = await supabase.from('spaces').update({ archived: true }).eq('id', id)
  if (error) throw error
}
