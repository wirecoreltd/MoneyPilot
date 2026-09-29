'use client'
import { useState } from 'react'

export type Period = '1j' | '5j' | '1m' | '3m' | 'custom'

export const PERIODS: { id: Period; label: string }[] = [
  { id: '1j', label: '1J' }, { id: '5j', label: '5J' },
  { id: '1m', label: '1 mois' }, { id: '3m', label: '3 mois' },
  { id: 'custom', label: 'Perso' },
]

export const PERIOD_LABEL: Record<Period, string> = {
  '1j': "aujourd'hui", '5j': 'les 5 derniers jours',
  '1m': 'le dernier mois', '3m': 'les 3 derniers mois', custom: 'la période choisie',
}

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getPeriodRange(p: Period, customFrom: string, customTo: string) {
  if (p === 'custom') return { from: customFrom || '0000-01-01', to: customTo || '9999-12-31' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const from = new Date(today)
  if (p === '5j') from.setDate(from.getDate() - 4)
  if (p === '1m') { from.setMonth(from.getMonth() - 1); from.setDate(from.getDate() + 1) }
  if (p === '3m') { from.setMonth(from.getMonth() - 3); from.setDate(from.getDate() + 1) }
  return { from: toYMD(from), to: toYMD(today) }
}

export function usePeriod(initial: Period = '1m') {
  const [period, setPeriod] = useState<Period>(initial)
  const [customFrom, setCustomFrom] = useState(toYMD(new Date()))
  const [customTo, setCustomTo] = useState(toYMD(new Date()))
  const range = getPeriodRange(period, customFrom, customTo)
  return { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range }
}

type PeriodState = ReturnType<typeof usePeriod>

export default function PeriodFilter({
  period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
  activeClass = 'bg-accent text-white',
}: Omit<PeriodState, 'range'> & { activeClass?: string }) {
  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`flex-1 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
              period === p.id ? `${activeClass} border-transparent` : 'bg-white text-ink-soft border-mist-dark'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Du</label>
            <input className="input" type="date" value={customFrom} max={customTo || undefined}
              onChange={e => setCustomFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Au</label>
            <input className="input" type="date" value={customTo} min={customFrom || undefined}
              onChange={e => setCustomTo(e.target.value)} />
          </div>
        </div>
      )}
    </>
  )
}
