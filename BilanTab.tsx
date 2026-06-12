'use client'
import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import {
  Transaction, RecurringCharge, MonthlyIncome,
  getRecurringCharges, saveRecurringCharges,
  getMonthlyIncomes, saveMonthlyIncomes,
  computeCoachPlan, currentYearMonth, getMonthLabel,
  formatAmount, RECURRING_CATEGORIES
} from '@/lib/storage'
import CoachTip from './CoachTip'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'

interface Props { transactions: Transaction[] }

const CATEGORY_EMOJI: Record<string, string> = {
  logement:'🏠', transport:'🚗', assurance:'🛡️',
  école:'🎓', alimentation:'🛒', factures:'⚡', autre:'📦'
}

export default function BilanTab({ transactions }: Props) {
  const month = currentYearMonth()
  const plan = computeCoachPlan(month)

  const [charges, setCharges] = useState<RecurringCharge[]>(getRecurringCharges)
  const [incomes, setIncomes] = useState<MonthlyIncome[]>(() =>
    getMonthlyIncomes().filter(i => i.month === month))
  const [showChargeForm, setShowChargeForm] = useState(false)
  const [showIncomeForm, setShowIncomeForm] = useState(false)

  const [cf, setCf] = useState({
    name:'', amount:'', type:'fixed' as 'fixed'|'variable',
    category:'logement' as RecurringCharge['category'],
    frequency:'monthly' as 'monthly'|'yearly'|'once', note:''
  })
  const [inf, setInf] = useState({ label:'', amount:'', isFixed: true })

  function reload() {
    setCharges(getRecurringCharges())
    setIncomes(getMonthlyIncomes().filter(i => i.month === month))
  }

  function addCharge() {
    if (!cf.name || !cf.amount) return
    const updated = [...getRecurringCharges(), {
      id: crypto.randomUUID(), name: cf.name, amount: Number(cf.amount),
      type: cf.type, category: cf.category, frequency: cf.frequency,
      note: cf.note || undefined
    }]
    saveRecurringCharges(updated)
    setCf({ name:'', amount:'', type:'fixed', category:'logement', frequency:'monthly', note:'' })
    setShowChargeForm(false); reload()
  }

  function addIncome() {
    if (!inf.label || !inf.amount) return
    const all = getMonthlyIncomes()
    saveMonthlyIncomes([...all, {
      id: crypto.randomUUID(), label: inf.label,
      amount: Number(inf.amount), isFixed: inf.isFixed, month
    }])
    setInf({ label:'', amount:'', isFixed: true })
    setShowIncomeForm(false); reload()
  }

  // Graphique 6 mois
  const now = new Date()
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const txs = transactions.filter(t => t.date.startsWith(ym))
    return {
      month: getMonthLabel(ym).split(' ')[0],
      Revenus: txs.filter(t => t.type==='income').reduce((s,t)=>s+t.amount,0),
      Dépenses: txs.filter(t => t.type==='expense').reduce((s,t)=>s+t.amount,0),
    }
  })

  const tip = plan.alerts[0] ??
    (plan.freeMoney > 0
      ? `Ce mois tu as ${formatAmount(plan.freeMoney)} libres. Suggestion : ${formatAmount(plan.snowballSuggestion)} dettes · ${formatAmount(plan.savingsSuggestion)} épargne · ${formatAmount(plan.leisureSuggestion)} loisirs.`
      : `Ajoute tes revenus du mois pour voir ton plan complet.`)

  return (
    <div className="space-y-4">
      <CoachTip message={tip} />

      {/* Plan du mois */}
      {plan.totalIncome > 0 && (
        <div className="card-lg space-y-3">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Plan du mois</p>
          {[
            { label: 'Revenus', amount: plan.totalIncome, sign: '+', color: 'text-positive' },
            { label: 'Charges fixes', amount: plan.fixedCharges, sign: '−', color: 'text-danger' },
            { label: 'Minimums dettes', amount: plan.debtMinimums, sign: '−', color: 'text-danger' },
            { label: 'Variable (15%)', amount: plan.variableEstimate, sign: '−', color: 'text-warning' },
          ].map((r, i) => (
            <div key={i} className="flex justify-between items-center py-1 border-b border-mist last:border-0">
              <span className="text-sm text-ink-soft">{r.label}</span>
              <span className={`font-mono text-sm font-bold ${r.color}`}>
                {r.sign} {formatAmount(r.amount)}
              </span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-1">
            <span className="font-bold text-ink">Argent libre</span>
            <span className={`font-mono font-bold text-xl ${plan.freeMoney > 0 ? 'text-positive' : 'text-danger'}`}>
              {formatAmount(plan.freeMoney)}
            </span>
          </div>
          {plan.freeMoney > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { label: '🎯 Dettes', amount: plan.snowballSuggestion, color: 'bg-danger-light text-danger' },
                { label: '🐖 Épargne', amount: plan.savingsSuggestion, color: 'bg-accent-light text-accent' },
                { label: '🎉 Loisirs', amount: plan.leisureSuggestion, color: 'bg-positive-light text-positive' },
              ].map((s, i) => (
                <div key={i} className={`${s.color} rounded-2xl p-3 text-center`}>
                  <p className="text-xs font-semibold">{s.label}</p>
                  <p className="font-mono font-bold text-sm mt-1">{formatAmount(s.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Graphique */}
      {transactions.length > 0 && (
        <div className="card">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-4">6 derniers mois</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EAF0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatAmount(v)}
                contentStyle={{ borderRadius: 12, border: '1px solid #E8EAF0', fontSize: 12 }} />
              <Bar dataKey="Revenus" fill="#16A34A" radius={[6,6,0,0]} />
              <Bar dataKey="Dépenses" fill="#DC2626" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Revenus du mois */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Revenus ce mois</p>
          <button onClick={() => setShowIncomeForm(true)}
            className="w-9 h-9 rounded-xl bg-accent-light text-accent flex items-center justify-center">
            <Plus size={18}/>
          </button>
        </div>
        {incomes.length === 0
          ? <p className="text-sm text-ink-soft text-center py-3">Aucun revenu saisi</p>
          : incomes.map(inc => (
            <div key={inc.id} className="flex items-center justify-between py-2 border-b border-mist last:border-0">
              <div>
                <p className="text-sm font-semibold text-ink">{inc.label}</p>
                <p className="text-xs text-ink-soft">{inc.isFixed ? 'Fixe' : 'Variable'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-positive">+{formatAmount(inc.amount)}</span>
                <button className="btn-icon bg-mist hover:bg-danger-light text-ink-soft hover:text-danger"
                  onClick={() => { saveMonthlyIncomes(getMonthlyIncomes().filter(i => i.id !== inc.id)); reload() }}>
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))
        }
      </div>

      {/* Charges récurrentes */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Charges récurrentes</p>
          <button onClick={() => setShowChargeForm(true)}
            className="w-9 h-9 rounded-xl bg-accent-light text-accent flex items-center justify-center">
            <Plus size={18}/>
          </button>
        </div>
        {charges.length === 0
          ? <p className="text-sm text-ink-soft text-center py-3">Aucune charge enregistrée</p>
          : charges.map(c => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-mist last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">{CATEGORY_EMOJI[c.category]}</span>
                <div>
                  <p className="text-sm font-semibold text-ink">{c.name}</p>
                  <p className="text-xs text-ink-soft capitalize">
                    {c.frequency === 'monthly' ? 'mensuel' : c.frequency === 'yearly' ? 'annuel' : 'unique'}
                    {c.type === 'variable' && ' · variable'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-danger">
                    −{formatAmount(c.frequency === 'yearly' ? c.amount/12 : c.amount)}
                  </span>
                  {c.frequency === 'yearly' && <p className="text-xs text-ink-soft">/mois</p>}
                </div>
                <button className="btn-icon bg-mist hover:bg-danger-light text-ink-soft hover:text-danger"
                  onClick={() => { saveRecurringCharges(getRecurringCharges().filter(x => x.id !== c.id)); reload() }}>
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))
        }
      </div>

      {/* Modal revenu */}
      {showIncomeForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Ajouter un revenu</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowIncomeForm(false)}><X size={20}/></button>
            </div>
            <div>
              <label className="label">Source</label>
              <input className="input" placeholder="Ex: Salaire, Freelance..." value={inf.label}
                onChange={e => setInf(f => ({...f, label: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input" type="number" placeholder="0" value={inf.amount}
                onChange={e => setInf(f => ({...f, amount: e.target.value}))}/>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold
                ${inf.isFixed ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setInf(f => ({...f, isFixed: true}))}>Fixe</button>
              <button className={`flex-1 py-3 text-sm font-bold
                ${!inf.isFixed ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setInf(f => ({...f, isFixed: false}))}>Variable</button>
            </div>
            <button className="btn-primary w-full py-4" onClick={addIncome}>Enregistrer</button>
          </div>
        </div>
      )}

      {/* Modal charge */}
      {showChargeForm && (
        <div className="bottom-sheet bg-black/40">
          <div className="bottom-sheet-content">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink">Nouvelle charge récurrente</h2>
              <button className="btn-icon bg-mist" onClick={() => setShowChargeForm(false)}><X size={20}/></button>
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input" placeholder="Ex: Loyer, Assurance..." value={cf.name}
                onChange={e => setCf(f => ({...f, name: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Montant (Rs)</label>
              <input className="input" type="number" placeholder="0" value={cf.amount}
                onChange={e => setCf(f => ({...f, amount: e.target.value}))}/>
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={cf.category}
                onChange={e => setCf(f => ({...f, category: e.target.value as RecurringCharge['category']}))}>
                {RECURRING_CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fréquence</label>
              <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
                {(['monthly','yearly','once'] as const).map(f => (
                  <button key={f}
                    className={`flex-1 py-3 text-xs font-bold
                      ${cf.frequency === f ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}
                    onClick={() => setCf(x => ({...x, frequency: f}))}>
                    {f === 'monthly' ? 'Mensuel' : f === 'yearly' ? 'Annuel' : 'Unique'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex rounded-2xl overflow-hidden border-2 border-mist-dark">
              <button className={`flex-1 py-3 text-sm font-bold
                ${cf.type === 'fixed' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setCf(f => ({...f, type:'fixed'}))}>Fixe</button>
              <button className={`flex-1 py-3 text-sm font-bold
                ${cf.type === 'variable' ? 'bg-accent text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setCf(f => ({...f, type:'variable'}))}>Variable</button>
            </div>
            <button className="btn-primary w-full py-4" onClick={addCharge}>Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  )
}
