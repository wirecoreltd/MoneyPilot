'use client'
import { useState, useEffect, useMemo } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import {
  Project, getProjects, addProject, updateProject, deleteProject,
  projectMonthlyNeeded, monthsUntil,
  formatAmount,
} from '@/lib/storage'
import CoachTip from './CoachTip'

const TYPE_OPTIONS = [
  { id: 'savings',    emoji: '🐖', label: 'Épargne' },
  { id: 'investment', emoji: '📈', label: 'Investissement' },
  { id: 'purchase',   emoji: '🛒', label: 'Achat' },
  { id: 'upcoming',   emoji: '🔔', label: 'Charges à venir' },
] as const

const EMOJIS = ['✈️','🚗','🏠','📱','💻','🎓','💍','🏖️','🎮','👶','📈','🐖','🏋️','🎸','⛵']

export default function ProjectsTab() {
  const [projects,  setProjects]  = useState<Project[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [addingTo,  setAddingTo]  = useState<string | null>(null)
  const [addAmount, setAddAmount] = useState('')

  const [form, setForm] = useState({
    name: '', emoji: EMOJIS[0],
    type: 'savings' as Project['type'],
    targetAmount: '', savedAmount: '0',
    targetDate: '', monthlyContribution: '', note: '',
  })

  async function reload() {
    const data = await getProjects()
    setProjects(data)
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [])

  async function handleAdd() {
    if (!form.name || !form.targetAmount || !form.targetDate) return
    await addProject({
      name:                form.name,
      emoji:               form.emoji,
      type:                form.type,
      targetAmount:        Number(form.targetAmount),
      savedAmount:         Number(form.savedAmount) || 0,
      targetDate:          form.targetDate,
      monthlyContribution: Number(form.monthlyContribution) || 0,
      note:                form.note || undefined,
    })
    setForm({ name:'', emoji: EMOJIS[0], type:'savings', targetAmount:'', savedAmount:'0',
              targetDate:'', monthlyContribution:'', note:'' })
    setShowForm(false)
    reload()
  }

  async function handleDeposit(id: string) {
    const amt = Number(addAmount)
    if (!amt || amt <= 0) return
    const p = projects.find(x => x.id === id)!
    await updateProject(id, { savedAmount: p.savedAmount + amt })
    setAddingTo(null); setAddAmount('')
    reload()
  }

  async function handleDelete(id: string) {
    await deleteProject(id)
    reload()
  }

  const tip = useMemo(() => {
    const behind = projects.filter(p => {
      const needed = projectMonthlyNeeded(p)
      return needed > p.monthlyContribution && p.monthlyContribution > 0
    })
    if (behind.length > 0)
      return `⚠️ Tu es en retard sur : ${behind.map(p => p.name).join(', ')}. Augmente tes contributions !`
    if (projects.length === 0)
      return `Crée tes projets (vacances, voiture, investissement...) et le Coach t'indique combien épargner chaque mois.`
    return `✅ Tu es dans les temps sur tous tes projets. Continue comme ça !`
  }, [projects])

  const byType = (type: Project['type']) => projects.filter(p => p.type === type)

  if (loading) return <div className="card text-center py-8 text-ink-soft">Chargement...</div>

  return (
    <div className="space-y-4">
      <CoachTip message={tip} />

      <button onClick={() => setShowForm(true)} className="btn-primary w-full gap-2 text-base py-4">
        <Plus size={20}/> Nouveau projet
      </button>

      {projects.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-5xl mb-3">🚀</p>
          <p className="font-bold text-ink">Aucun projet pour l'instant</p>
          <p className="text-sm text-ink-soft mt-1">Vacances, voiture, maison, investissement...</p>
        </div>
      ) : (
        TYPE_OPTIONS.map(({ id: typeId, emoji: typeEmoji, label: typeLabel }) => {
          const list = byType(typeId)
          if (list.length === 0) return null
          return (
            <div key={typeId} className="space-y-3">
              <p className="text-xs font-bold text-ink-soft uppercase tracking-wider flex items-center gap-2">
                {typeEmoji} {typeLabel}
              </p>
              {list.map(p => {
                const pct      = Math.min(100, (p.savedAmount / p.targetAmount) * 100)
                const done     = p.savedAmount >= p.targetAmount
                const months   = monthsUntil(p.targetDate)
                const needed   = projectMonthlyNeeded(p)
                const isBehind = needed > p.monthlyContribution && p.monthlyContribution > 0

                return (
                  <div key={p.id} className={`card-lg space-y-3
                    ${isBehind ? 'border-l-4 border-l-warning' : done ? 'border-l-4 border-l-positive' : ''}`}>

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{p.emoji}</span>
                        <div>
                          <p className="font-bold text-ink">{p.name}</p>
                          <p className="text-xs text-ink-soft">
                            {done ? '✅ Objectif atteint !' : `${months} mois restants · ${new Date(p.targetDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(p.id)}
                        className="w-8 h-8 rounded-xl bg-mist hover:bg-danger-light text-ink-soft hover:text-danger flex items-center justify-center flex-shrink-0">
                        <Trash2 size={14}/>
                      </button>
                    </div>

                    <div className="w-full h-3 bg-mist-dark rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: done ? '#16A34A' : isBehind ? '#D97706' : '#2563EB' }}/>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="font-mono font-bold text-accent">{formatAmount(p.savedAmount)}</span>
                      <span className="font-mono text-ink-soft">{pct.toFixed(0)}% · {formatAmount(p.targetAmount)}</span>
                    </div>

                    {!done && (
                      <div className={`rounded-2xl p-3 text-xs font-medium
                        ${isBehind ? 'bg-warning-light text-warning' : 'bg-positive-light text-positive'}`}>
                        {isBehind
                          ? `⚠️ Il te faut ${formatAmount(needed)}/mois mais tu mets seulement ${formatAmount(p.monthlyContribution)}/mois. Augmente de ${formatAmount(needed - p.monthlyContribution)}.`
                          : `✅ Avec ${formatAmount(needed)}/mois tu arrives à temps en ${new Date(p.targetDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.`
                        }
                      </div>
                    )}

                    {addingTo === p.id ? (
                      <div className="flex gap-2">
                        <input className="input flex-1" type="number"
                          placeholder="Montant à ajouter" value={addAmount}
                          onChange={e => setAddAmount(e.target.value)} autoFocus/>
                        <button className="btn-primary px-4" onClick={() => handleDeposit(p.id)}>OK</button>
                        <button className="btn-ghost px-3" onClick={() => setAddingTo(null)}>✕</button>
                      </div>
                    ) : (
                      <button
                        className="w-full py-3 text-sm font-bold text-accent bg-accent-light rounded-2xl active:scale-95 transition-all"
                        onClick={() => { setAddingTo(p.id); setAddAmount('') }}>
                        + Ajouter de l'argent
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })
      )}

      {showForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouveau projet</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>

            <div>
              <label className="label">Type de projet</label>
              <div className="flex gap-2">
                {TYPE_OPTIONS.map(t => (
                  <button key={t.id}
                    className={`flex-1 py-3 rounded-2xl text-sm font-bold border-2 transition-all
                      ${form.type === t.id ? 'bg-accent text-white border-accent' : 'bg-white text-ink-soft border-mist-dark'}`}
                    onClick={() => setForm(f => ({...f, type: t.id}))}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Icône</label>
              <div className="flex gap-2 flex-wrap">
                {EMOJIS.map(e => (
                  <button key={e}
                    className={`text-2xl p-2 rounded-2xl transition-colors ${form.emoji === e ? 'bg-accent-light' : 'bg-mist'}`}
                    onClick={() => setForm(f => ({...f, emoji: e}))}>
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Nom du projet</label>
              <input className="input" placeholder="Ex: Vacances à Paris, Nouvelle voiture..."
                value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}/>
            </div>

            <div>
              <label className="label">Montant cible (Rs)</label>
              <input className="input" type="number" placeholder="0"
                value={form.targetAmount} onChange={e => setForm(f => ({...f, targetAmount: e.target.value}))}/>
            </div>

            <div>
              <label className="label">Déjà épargné (Rs)</label>
              <input className="input" type="number" placeholder="0"
                value={form.savedAmount} onChange={e => setForm(f => ({...f, savedAmount: e.target.value}))}/>
            </div>

            <div>
              <label className="label">Date cible</label>
              <input className="input" type="date" value={form.targetDate}
                onChange={e => setForm(f => ({...f, targetDate: e.target.value}))}/>
            </div>

            <div>
              <label className="label">Contribution mensuelle actuelle (Rs)</label>
              <input className="input" type="number" placeholder="0"
                value={form.monthlyContribution}
                onChange={e => setForm(f => ({...f, monthlyContribution: e.target.value}))}/>
              {form.targetAmount && form.targetDate && (
                <p className="text-xs text-accent mt-1 font-medium">
                  💡 Il faut environ {formatAmount(
                    Math.ceil(
                      (Number(form.targetAmount) - (Number(form.savedAmount)||0)) /
                      Math.max(1, monthsUntil(form.targetDate))
                    )
                  )}/mois pour atteindre cet objectif.
                </p>
              )}
            </div>

            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex: MCB Step-Up, CIM Banque..."
                value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))}/>
            </div>

            <button className="btn-primary w-full py-4 text-base" onClick={handleAdd}>
              Créer le projet
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
