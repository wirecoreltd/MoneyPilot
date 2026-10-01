'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Pencil, ChevronDown, Check } from 'lucide-react'
import { formatAmount } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { readSpaceId, requireWritableSpaceId } from '@/lib/activeSpace'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'

interface RevenuSource {
  id: string
  label: string
  amount: number
  type: 'fixed' | 'variable'
  month: string
  date: string
  spaceId: string
}

// ─── Sources prédéfinies par catégorie ───────────────────────────────────────
const REVENU_PRESETS = [
  {
    group: '💼 Revenus d\'activité',
    items: ['Salaire', 'Prime / Bonus', 'Freelance / Auto-entrepreneur', 'Heures supplémentaires'],
  },
  {
    group: '📈 Revenus du patrimoine',
    items: ['Retour sur investissement', 'Dividendes', 'Loyer perçu', 'Plus-value'],
  },
  {
    group: '🤝 Revenus sociaux / autres',
    items: ['Allocations familiales', 'Pension / Retraite', 'Remboursement', 'Autre'],
  },
]

interface SavedSource { id: string; name: string; type: 'fixed' | 'variable' }

export function RevenusSection() {
  const [revenus, setRevenus] = useState<RevenuSource[]>([])
  const [savedSources, setSavedSources] = useState<SavedSource[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const periodState = usePeriod()
  const { period, range } = periodState
  const [form, setForm] = useState({
    source: '', label: '', amount: '', type: 'fixed' as 'fixed' | 'variable', saveSource: false,
    date: new Date().toISOString().slice(0, 10),
  })
  const sourceRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sourceRef.current && !sourceRef.current.contains(e.target as Node)) setSourceDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    setLoadError(null)
    try {
            const { data: { user } } = await supabase.auth.getUser()
      const spaceId = readSpaceId()
      let incQuery = supabase.from('monthly_incomes').select('*').eq('user_id', user!.id)
      let srcQuery = supabase.from('income_sources').select('*').eq('user_id', user!.id).order('name')
      if (spaceId) { incQuery = incQuery.eq('space_id', spaceId); srcQuery = srcQuery.eq('space_id', spaceId) }
      const [incRes, srcRes] = await Promise.all([incQuery, srcQuery])
      if (incRes.error) throw incRes.error
      if (srcRes.error) throw srcRes.error
      const incData: RevenuSource[] = (incRes.data ?? []).map(r => ({
        id: r.id, label: r.label, amount: Number(r.amount),
        type: r.is_fixed ? 'fixed' : 'variable', month: r.month,
      date: r.received_at ?? `${r.month}-01`,
        spaceId: r.space_id,
      }))
      setRevenus(incData)
      if (incData.length > 0) setOpen(true)
      setSavedSources((srcRes.data ?? []).map(r => ({
        id: r.id, name: r.name, type: r.is_fixed ? 'fixed' : 'variable',
      })))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement')
    }
    setLoading(false)
  }

  function pickSource(name: string, type: 'fixed' | 'variable' = 'fixed') {
  setForm(f => ({
    ...f, source: name, type,
    // pré-remplit le libellé seulement s'il est vide ou s'il n'a pas été modifié à la main
    label: (!f.label.trim() || f.label === f.source) ? name : f.label,
  }))
  setSourceDropdownOpen(false)
}

  function resetForm() {
    setForm({ source: '', label: '', amount: '', type: 'fixed', saveSource: false, date: new Date().toISOString().slice(0, 10) })
    setEditingId(null)
    setShowForm(false)
  }

  function openEdit(r: RevenuSource) {
    setEditingId(r.id)
    setForm({ source: '', label: r.label, amount: String(r.amount), type: r.type, saveSource: false, date: r.date })
    setShowForm(true)
    setOpen(true)
  }

    async function handleAdd() {
    const finalLabel = form.label.trim() || form.source.trim()
    if (!finalLabel || !form.amount || Number(form.amount) <= 0 || !form.date) return
    setSaving(true)

    try {
      // Mode modification
      if (editingId) {
        const { error } = await supabase.from('monthly_incomes').update({
          label: finalLabel,
          amount: Number(form.amount),
          is_fixed: form.type === 'fixed',
          received_at: form.date,
          month: form.date.slice(0, 7),
        }).eq('id', editingId)
        if (error) throw error

        // Si c'est un revenu fixe renommé, on renomme aussi les autres occurrences fixes
        const old = revenus.find(r => r.id === editingId)
        if (old && old.type === 'fixed' && old.label !== finalLabel) {
          const { data: { user } } = await supabase.auth.getUser()
           const { error: renameError } = await supabase.from('monthly_incomes').update({ label: finalLabel })
            .eq('user_id', user!.id).eq('space_id', old.spaceId).eq('label', old.label).eq('is_fixed', true)
          if (renameError) throw renameError
          setRevenus(prev => prev.map(r => r.spaceId === old.spaceId && r.type === 'fixed' && r.label === old.label ? { ...r, label: finalLabel } : r))
        }
        setRevenus(prev => prev.map(r => r.id === editingId
          ? { ...r, label: finalLabel, amount: Number(form.amount), type: form.type,
              date: form.date, month: form.date.slice(0, 7) }
          : r))
        resetForm()
        setSaving(false)
        return
      }

      // Mode création
            const { data: { user } } = await supabase.auth.getUser()
      const spaceId = requireWritableSpaceId()
      const sourceName = (form.source || form.label).trim()
      if (form.saveSource && sourceName) {
        const alreadySaved = savedSources.some(s => s.name.toLowerCase() === sourceName.toLowerCase())
        if (!alreadySaved) {
          const { data: newSrc, error: srcError } = await supabase.from('income_sources').insert({
        user_id: user!.id, label: finalLabel,
        amount: Number(form.amount), is_fixed: form.type === 'fixed',
          }).select().single()
          if (srcError) throw srcError
          if (newSrc) setSavedSources(prev => [...prev, { id: newSrc.id, name: newSrc.name, type: newSrc.is_fixed ? 'fixed' : 'variable' }])
        }
      }
      const { data, error } = await supabase.from('monthly_incomes').insert({
        user_id: user!.id, label: finalLabel,
        amount: Number(form.amount), is_fixed: form.type === 'fixed',
        month: form.date.slice(0, 7), received_at: form.date,
      }).select().single()
      if (error) throw error
      if (data) {
        setRevenus(prev => [...prev, {
          id: data.id, label: data.label, amount: Number(data.amount),
          type: data.is_fixed ? 'fixed' : 'variable', month: data.month,
                    date: data.received_at ?? form.date,
          spaceId: data.space_id,
        }])
      }
      resetForm()
      setOpen(true)
        } catch (e) {
      const msg = e instanceof Error && e.message.startsWith('Choisis') ? e.message : null
      window.alert(msg ?? (editingId ? "Impossible de modifier le revenu. Réessaie." : "Impossible d'ajouter le revenu. Réessaie."))
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const r = revenus.find(x => x.id === id)
    try {
      if (r?.type === 'fixed') {
        if (!window.confirm(`« ${r.label} » est un revenu fixe.\nLe supprimer l'arrête : il ne sera plus recréé chaque mois (l'historique passe en « Variable »).`)) return
        const { data: { user } } = await supabase.auth.getUser()
                const { error: stopError } = await supabase.from('monthly_incomes').update({ is_fixed: false })
          .eq('user_id', user!.id).eq('space_id', r.spaceId).eq('label', r.label).eq('is_fixed', true)
        if (stopError) throw stopError
        setRevenus(prev => prev.map(x => x.spaceId === r.spaceId && x.label === r.label ? { ...x, type: 'variable' } : x))
      }
      const { error } = await supabase.from('monthly_incomes').delete().eq('id', id)
      if (error) throw error
      setRevenus(prev => prev.filter(x => x.id !== id))
    } catch {
      window.alert('Impossible de supprimer le revenu. Réessaie.')
    }
  }

  async function handleDeleteSource(id: string) {
    const { error } = await supabase.from('income_sources').delete().eq('id', id)
    if (error) { window.alert('Impossible de supprimer la source. Réessaie.'); return }
    setSavedSources(prev => prev.filter(s => s.id !== id))
  }

  const filtered = revenus
    .filter(r => r.date >= range.from && r.date <= range.to)
    .sort((a, b) => b.date.localeCompare(a.date))
  const total = filtered.reduce((s, r) => s + r.amount, 0)
  const fixedTotal = filtered.filter(r => r.type === 'fixed').reduce((s, r) => s + r.amount, 0)
  const variableTotal = filtered.filter(r => r.type === 'variable').reduce((s, r) => s + r.amount, 0)

  const customSaved = savedSources.filter(
    s => !REVENU_PRESETS.flatMap(g => g.items).includes(s.name)
  )

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>
  if (loadError) {
    return (
      <div className="card text-center py-8 space-y-3">
        <p className="text-sm text-danger">Impossible de charger tes revenus : {loadError}</p>
        <button className="btn-ghost" onClick={loadAll}>Réessayer</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-2xl">
        <span className="text-base">💡</span>
        <p className="text-xs text-green-700 leading-relaxed">
          <strong>Tes sources de revenus.</strong> Salaire, freelance, loyer perçu, allocations... Ajoute chaque source séparément pour une vision claire.
        </p>
      </div>

      <PeriodFilter {...periodState} activeClass="bg-positive text-white" />

      <button onClick={() => setOpen(o => !o)} className="w-full card bg-positive-light border border-positive/20 text-left">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-positive uppercase tracking-wide">Total revenus · {PERIOD_LABEL[period]}</p>
            <p className="text-3xl font-bold font-mono text-positive mt-1">{formatAmount(total)}</p>
            <p className="text-xs text-positive/70 mt-1">{filtered.length} source{filtered.length > 1 ? 's' : ''} de revenus</p>
          </div>
          <div className={`w-10 h-10 rounded-2xl bg-positive/10 flex items-center justify-center transition-transform ${open ? 'rotate-180' : ''}`}>
            <ChevronDown size={20} className="text-positive"/>
          </div>
        </div>
        {total > 0 && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-positive/20">
            {fixedTotal > 0 && <div><p className="text-[10px] text-positive/60 uppercase font-bold">Fixe</p><p className="text-sm font-mono font-bold text-positive">{formatAmount(fixedTotal)}</p></div>}
            {variableTotal > 0 && <div><p className="text-[10px] text-positive/60 uppercase font-bold">Variable</p><p className="text-sm font-mono font-bold text-positive">{formatAmount(variableTotal)}</p></div>}
          </div>
        )}
      </button>

      {open && (
        <div className="card space-y-2 border-2 border-positive/20">
          {filtered.length === 0 ? (
            <p className="text-sm text-ink-soft text-center py-4">Aucun revenu sur cette période</p>
          ) : filtered.map(r => (
            <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-mist last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-positive-light flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">💰</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{r.label}</p>
                  <p className="text-xs text-ink-soft">{new Date(r.date).toLocaleDateString('fr-FR')}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.type === 'fixed' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                    {r.type === 'fixed' ? 'Fixe' : 'Variable'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-positive">+{formatAmount(r.amount)}</span>
                <button onClick={() => openEdit(r)} className="w-7 h-7 rounded-lg bg-mist hover:bg-accent-light text-ink-soft hover:text-accent flex items-center justify-center"><Pencil size={12}/></button>
                <button onClick={() => handleDelete(r.id)} className="w-7 h-7 rounded-lg bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}

          {showForm ? (
            <div className="space-y-2 pt-2 border-t border-mist">
              <div ref={sourceRef} className="relative">
                <label className="label">Source de revenu</label>
                <button type="button" onClick={() => setSourceDropdownOpen(o => !o)} className="input flex items-center justify-between text-left w-full">
                  <span className={form.source ? 'text-ink' : 'text-gray-400'}>{form.source || 'Choisir une source...'}</span>
                  <ChevronDown size={16} className={`text-ink-soft transition-transform flex-shrink-0 ${sourceDropdownOpen ? 'rotate-180' : ''}`}/>
                </button>
                {sourceDropdownOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-mist-dark rounded-2xl shadow-xl overflow-hidden">
                    <div className="max-h-72 overflow-y-auto">
                      {customSaved.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider px-3 pt-3 pb-1">⭐ Mes sources</p>
                          {customSaved.map(s => (
                            <div key={s.id} onClick={() => pickSource(s.name, s.type)} className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-mist transition-colors">
                              <div className="flex items-center gap-2">
                                {form.source === s.name && <Check size={12} className="text-positive"/>}
                                <span className="text-sm text-ink">{s.name}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${s.type === 'fixed' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                  {s.type === 'fixed' ? 'Fixe' : 'Variable'}
                                </span>
                              </div>
                              <button onClick={e => { e.stopPropagation(); handleDeleteSource(s.id) }} className="w-5 h-5 rounded-md hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center flex-shrink-0"><X size={10}/></button>
                            </div>
                          ))}
                          <div className="h-px bg-mist-dark mx-3 my-1"/>
                        </div>
                      )}
                      {REVENU_PRESETS.map(group => (
                        <div key={group.group}>
                          <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider px-3 pt-2.5 pb-1">{group.group}</p>
                          {group.items.map(item => (
                            <div key={item} onClick={() => pickSource(item)} className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-mist transition-colors ${form.source === item ? 'bg-green-50' : ''}`}>
                              {form.source === item && <Check size={12} className="text-positive flex-shrink-0"/>}
                              <span className="text-sm text-ink">{item}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>                   
                  </div>
                )}
              </div>

              <div>
                <label className="label">Libellé <span className="text-ink-soft font-normal">(libre)</span></label>
                <input className="input" placeholder="Ex: Salaire janvier, Prime de Noël..." value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}/>
              </div>
              <div>
                <label className="label">Montant (Rs)</label>
                <input className="input" type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}/>
              </div>
              <div>
                <label className="label">Date de réception</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}/>
              </div>
              <div className="flex rounded-xl overflow-hidden border-2 border-mist-dark">
                <button className={`flex-1 py-2 text-xs font-bold ${form.type === 'fixed' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`} onClick={() => setForm(f => ({ ...f, type: 'fixed' }))}>📅 Fixe</button>
                <button className={`flex-1 py-2 text-xs font-bold ${form.type === 'variable' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`} onClick={() => setForm(f => ({ ...f, type: 'variable' }))}>📈 Variable</button>
              </div>
              <div onClick={() => setForm(f => ({ ...f, saveSource: !f.saveSource }))} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${form.saveSource ? 'bg-green-50 border-green-200' : 'bg-mist border-mist-dark'}`}>
                <div>
                  <p className="text-xs font-bold text-ink">⭐ Enregistrer cette source</p>
                  <p className="text-[10px] text-ink-soft mt-0.5">Disponible dans le menu la prochaine fois</p>
                </div>
                <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.saveSource ? 'bg-positive' : 'bg-mist-dark'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.saveSource ? 'left-5' : 'left-0.5'}`}/>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={resetForm}>Annuler</button>
                <button className="btn-primary flex-1" style={{ backgroundColor: '#16A34A' }} onClick={handleAdd} disabled={saving}>
                  {saving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="w-full py-3 text-sm font-bold text-positive bg-positive-light hover:bg-green-100 rounded-2xl transition-colors flex items-center justify-center gap-2">
              <Plus size={16}/> Ajouter une source
            </button>
          )}
        </div>
      )}

      {!open && (
        <button onClick={() => { setOpen(true); setTimeout(() => setShowForm(true), 50) }} className="btn-primary w-full gap-2" style={{ backgroundColor: '#16A34A' }}>
          <Plus size={18}/> Ajouter un revenu
        </button>
      )}
    </div>
  )
}
