'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, X, Pencil, ChevronDown, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ─── Catégories unifiées ──────────────────────────────────────────────────────
// Utilisées par transactions, budget, dettes ET factures
export const DEFAULT_CATEGORIES = [
  'Logement', 'Alimentation', 'Transport', 'Santé', 'Loisirs',
  'Vêtements', 'Éducation', 'Factures', 'Restaurants', 'Épargne', 'Autre'
]

// "transport   SCOLAIRE" -> "Transport scolaire"
function toProper(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ').toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// A→Z (accents gérés), "Autre" toujours en dernier
function getAllCategories(custom: string[]): string[] {
  const merged = [
    ...DEFAULT_CATEGORIES.filter(c => c !== 'Autre'),
    ...custom.filter(c => c !== 'Autre' && !DEFAULT_CATEGORIES.includes(c)),
  ]
  const sorted = Array.from(new Set(merged)).sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' })
  )
  return [...sorted, 'Autre']
}

// Déplace tout ce qui utilise une catégorie supprimée vers "Autre"
async function reassignCategoryToAutre(cat: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const uid = user.id

  // historique de remboursements : pas de user_id, on passe par les dettes concernées
  const { data: affectedDebts, error: affectedError } = await supabase
    .from('debts').select('id').eq('user_id', uid).eq('category', cat)
  if (affectedError) throw affectedError
  const debtIds = (affectedDebts ?? []).map(d => d.id)

  const results = await Promise.all([
    supabase.from('transactions').update({ category: 'Autre' }).eq('user_id', uid).eq('category', cat),
    supabase.from('factures').update({ category: 'Autre' }).eq('user_id', uid).eq('category', cat),
    supabase.from('debts').update({ category: 'Autre' }).eq('user_id', uid).eq('category', cat),
    debtIds.length > 0
      ? supabase.from('debt_payment_history').update({ category: 'Autre' }).in('debt_id', debtIds)
      : Promise.resolve({ error: null }),
  ])
  const failed = results.find(r => r.error)
  if (failed?.error) throw failed.error

  // Plafond du budget : fusionné dans "Autre" s'il existe déjà, sinon renommé
  const { data: bud, error: budError } = await supabase
    .from('budget_categories').select('id, name').eq('user_id', uid).in('name', [cat, 'Autre'])
  if (budError) throw budError
  const old = (bud ?? []).find(b => b.name === cat)
  const hasAutre = (bud ?? []).some(b => b.name === 'Autre')
  if (old) {
    const { error } = hasAutre
      ? await supabase.from('budget_categories').delete().eq('id', old.id)
      : await supabase.from('budget_categories').update({ name: 'Autre' }).eq('id', old.id)
    if (error) throw error
  }
}

// Renomme une catégorie partout (transactions, factures, dettes, historique, budget)
async function renameCategoryEverywhere(oldName: string, newName: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const uid = user.id

  const { data: affectedDebts, error: affectedError } = await supabase
    .from('debts').select('id').eq('user_id', uid).eq('category', oldName)
  if (affectedError) throw affectedError
  const debtIds = (affectedDebts ?? []).map(d => d.id)

  const results = await Promise.all([
    supabase.from('transactions').update({ category: newName }).eq('user_id', uid).eq('category', oldName),
    supabase.from('factures').update({ category: newName }).eq('user_id', uid).eq('category', oldName),
    supabase.from('debts').update({ category: newName }).eq('user_id', uid).eq('category', oldName),
    debtIds.length > 0
      ? supabase.from('debt_payment_history').update({ category: newName }).in('debt_id', debtIds)
      : Promise.resolve({ error: null }),
    supabase.from('budget_categories').update({ name: newName }).eq('user_id', uid).eq('name', oldName),
  ])
  const failed = results.find(r => r.error)
  if (failed?.error) throw failed.error
}

// Hook partagé par Transactions, Budget, Dettes et Factures
function loadLegacyCustomCategories(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('moneyapp_custom_categories') || '[]') }
  catch { return [] }
}

export function useCustomCategories(onChanged?: () => void) {
  const [customCategories, setCustomCategories] = useState<string[]>([])

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data, error } = await supabase.from('custom_categories').select('name').eq('user_id', user.id)
        if (error) { console.error(error); return }
        let names = (data ?? []).map(r => r.name)

        const legacy = loadLegacyCustomCategories().filter(
          c => !names.some(n => n.toLowerCase() === c.toLowerCase())
        )
        if (legacy.length > 0) {
          const { error: e2 } = await supabase.from('custom_categories')
            .insert(legacy.map(name => ({ user_id: user.id, name })))
          if (!e2) {
            names = [...names, ...legacy]
            localStorage.removeItem('moneyapp_custom_categories')
          }
        }
        setCustomCategories(names)
      } catch (e) {
        console.error('Chargement des catégories échoué :', e)
      }
    })()
  }, [])

  async function addCustom(cat: string) {
    const proper = toProper(cat)
    if (!proper || customCategories.some(c => c.toLowerCase() === proper.toLowerCase())) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')
      const { error } = await supabase.from('custom_categories').insert({ user_id: user.id, name: proper })
      if (error) throw error
      setCustomCategories(prev => [...prev, proper])
    } catch {
      window.alert("Impossible d'ajouter la catégorie. Réessaie.")
    }
  }

  async function removeCustom(cat: string) {
    await reassignCategoryToAutre(cat)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('custom_categories').delete().eq('user_id', user!.id).eq('name', cat)
    if (error) throw error
    setCustomCategories(prev => prev.filter(c => c !== cat))
    onChanged?.()
  }

  async function renameCustom(oldName: string, newName: string) {
    const proper = toProper(newName)
    if (!proper) throw new Error('Le nom ne peut pas être vide.')
    if (proper === oldName) return
    const exists = [...DEFAULT_CATEGORIES, ...customCategories]
      .some(c => c !== oldName && c.toLowerCase() === proper.toLowerCase())
    if (exists) throw new Error('Cette catégorie existe déjà.')
    await renameCategoryEverywhere(oldName, proper)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('custom_categories').update({ name: proper }).eq('user_id', user!.id).eq('name', oldName)
    if (error) throw error
    setCustomCategories(prev => prev.map(c => (c === oldName ? proper : c)))
    onChanged?.()
  }

  return { customCategories, addCustom, removeCustom, renameCustom }
}

// ─── Category Manager ─────────────────────────────────────────────────────────
type CategoryContext = 'transactions' | 'budget' | 'dettes' | 'epargne' | 'factures' | 'revenus'

export function CategoryManager({
  value, onChange, customCategories, onAddCustom, onRemoveCustom, onRenameCustom, context = 'transactions'
}: {
  value: string
  onChange: (v: string) => void
  customCategories: string[]
  onAddCustom: (cat: string) => void
  onRemoveCustom: (cat: string) => Promise<void>
  onRenameCustom: (oldName: string, newName: string) => Promise<void>
  context?: CategoryContext
}) {
  const [newCat, setNewCat] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const allCats = getAllCategories(customCategories)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleAdd() {
    const proper = toProper(newCat)
    if (!proper) return
    const existing = allCats.find(c => c.toLowerCase() === proper.toLowerCase())
    if (existing) onChange(existing)
    else { onAddCustom(proper); onChange(proper) }
    setNewCat('')
  }

  async function handleRemove(cat: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return
    if (!window.confirm(`Supprimer « ${cat} » ?\nLes montants de cette catégorie seront déplacés vers « Autre ».`)) return
    setBusy(true)
    try {
      await onRemoveCustom(cat)
      if (value === cat) onChange('Autre')
    } catch {
      window.alert('Impossible de supprimer la catégorie. Réessaie.')
    }
    setBusy(false)
  }

  async function handleRename(oldCat: string) {
    if (busy) return
    setBusy(true)
    try {
      await onRenameCustom(oldCat, editValue)
      if (value === oldCat) onChange(toProper(editValue))
      setEditingCat(null)
    } catch (e) {
      window.alert(e instanceof Error && e.message ? e.message : 'Impossible de modifier la catégorie. Réessaie.')
    }
    setBusy(false)
  }

  const contextMsg: Record<CategoryContext, string> = {
    transactions: '💡 Cette catégorie s\'affiche dans <strong>Dettes</strong>, <strong>Factures</strong> et <strong>Budget</strong>',
    budget:       '💡 Cette catégorie s\'affiche dans <strong>Dettes</strong>, <strong>Factures</strong> et <strong>Transactions</strong>',
    dettes:       '💡 Cette catégorie s\'affiche dans <strong>Budget</strong>, <strong>Factures</strong> et <strong>Transactions</strong>',
    epargne:      '💡 Cette catégorie s\'affiche dans <strong>Budget</strong> et <strong>Transactions</strong>',
    factures:     '💡 Cette catégorie s\'affiche dans <strong>Budget</strong>, <strong>Dettes</strong> et <strong>Transactions</strong>',
    revenus:      '💡 Source de revenu personnalisée',
  }

  return (
    <div ref={ref} className="space-y-2">
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="input flex items-center justify-between text-left w-full">
          <span className={value ? 'text-ink' : 'text-gray-400'}>{value || 'Choisir...'}</span>
          <ChevronDown size={16} className={`text-ink-soft transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}/>
        </button>
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-mist-dark rounded-2xl shadow-xl overflow-hidden">
            <div className="max-h-56 overflow-y-auto">
              {allCats.map(c => {
                const removable = customCategories.includes(c)

                if (editingCat === c) {
                  return (
                    <div key={c} className="flex items-center gap-2 px-3 py-2 bg-accent-light">
                      <input autoFocus className="input flex-1 py-1.5 text-sm" value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(c)
                          if (e.key === 'Escape') setEditingCat(null)
                        }}/>
                      <button type="button" disabled={busy || !editValue.trim()} onClick={() => handleRename(c)}
                        className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center disabled:opacity-40 flex-shrink-0">
                        <Check size={14}/>
                      </button>
                      <button type="button" onClick={() => setEditingCat(null)}
                        className="w-7 h-7 rounded-lg bg-mist text-ink-soft flex items-center justify-center flex-shrink-0">
                        <X size={14}/>
                      </button>
                    </div>
                  )
                }

                return (
                  <div key={c} onClick={() => { onChange(c); setOpen(false) }}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-mist transition-colors ${value === c ? 'bg-accent-light' : ''}`}>
                    <div className="flex items-center gap-2">
                      {value === c && <Check size={14} className="text-accent"/>}
                      <span className="text-sm text-ink">{c}</span>
                    </div>
                    {removable && (
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={busy}
                          onClick={e => { e.stopPropagation(); setEditingCat(c); setEditValue(c) }}
                          className="w-6 h-6 rounded-lg hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center disabled:opacity-40">
                          <Pencil size={12}/>
                        </button>
                        <button type="button" disabled={busy} onClick={e => handleRemove(c, e)}
                          className="w-6 h-6 rounded-lg hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center disabled:opacity-40">
                          <X size={12}/>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input className="input flex-1 py-2 text-sm" placeholder="Nouvelle catégorie..."
          value={newCat} onChange={e => setNewCat(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}/>
        <button onClick={handleAdd} disabled={!newCat.trim()}
          className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-40 flex-shrink-0">
          <Plus size={16}/>
        </button>
      </div>

      {customCategories.length > 0 && (
        <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2"
          dangerouslySetInnerHTML={{ __html: contextMsg[context] }}/>
      )}
    </div>
  )
}
