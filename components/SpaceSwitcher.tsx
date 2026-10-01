'use client'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Plus } from 'lucide-react'
import { useSpaces } from './SpaceContext'
import { createSpace } from '@/lib/spaces'
import { OVERVIEW } from '@/lib/activeSpace'

const EMOJIS = ['👤', '💼', '🚀', '🏠', '🤝', '🎓', '🛒', '🌱']

export default function SpaceSwitcher() {
  const { spaces, activeId, active, isOverview, select, reload } = useSpaces()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('💼')
  const [kind, setKind] = useState<'perso' | 'pro'>('pro')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setCreating(false) }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleCreate() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const s = await createSpace(name, emoji, kind)
      await reload()
      select(s.id)
      setName(''); setCreating(false); setOpen(false)
    } catch {
      window.alert("Impossible de créer l'espace. Réessaie.")
    }
    setBusy(false)
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white border border-mist-dark text-sm font-bold text-ink">
        <span>{isOverview ? '📊' : active?.emoji}</span>
        <span>{isOverview ? "Vue d'ensemble" : active?.name}</span>
        <ChevronDown size={16} className={`text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-[240px] bg-white border border-mist-dark rounded-2xl shadow-xl overflow-hidden">
          {spaces.map(s => (
            <div key={s.id} onClick={() => { select(s.id); setOpen(false) }}
              className={`flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-mist ${activeId === s.id ? 'bg-accent-light' : ''}`}>
              {activeId === s.id && <Check size={14} className="text-accent"/>}
              <span>{s.emoji}</span>
              <span className="text-sm text-ink flex-1">{s.name}</span>
              <span className="text-[10px] text-ink-soft uppercase">{s.kind}</span>
            </div>
          ))}

          {spaces.length > 1 && (
            <div onClick={() => { select(OVERVIEW); setOpen(false) }}
              className={`flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-mist border-t border-mist-dark ${isOverview ? 'bg-accent-light' : ''}`}>
              {isOverview && <Check size={14} className="text-accent"/>}
              <span>📊</span>
              <span className="text-sm text-ink font-semibold">Vue d'ensemble</span>
            </div>
          )}

          {creating ? (
            <div className="p-3 space-y-2 border-t border-mist-dark">
              <input autoFocus className="input py-2 text-sm" placeholder="Nom (ex: Auto-entreprise)"
                value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}/>
              <div className="flex gap-1 flex-wrap">
                {EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setEmoji(e)}
                    className={`text-lg p-1.5 rounded-xl ${emoji === e ? 'bg-accent-light' : 'bg-mist'}`}>{e}</button>
                ))}
              </div>
              <div className="flex rounded-xl overflow-hidden border-2 border-mist-dark">
                <button type="button" onClick={() => setKind('perso')}
                  className={`flex-1 py-1.5 text-xs font-bold ${kind === 'perso' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}>Perso</button>
                <button type="button" onClick={() => setKind('pro')}
                  className={`flex-1 py-1.5 text-xs font-bold ${kind === 'pro' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}>Pro</button>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => setCreating(false)}>Annuler</button>
                <button className="btn-primary flex-1" disabled={busy || !name.trim()} onClick={handleCreate}>Créer</button>
              </div>
            </div>
          ) : (
            <div onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-mist border-t border-mist-dark text-accent">
              <Plus size={14}/><span className="text-sm font-semibold">Nouvel espace</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
