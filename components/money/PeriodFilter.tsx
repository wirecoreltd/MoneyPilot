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
  '1m': 'ce mois-ci', '3m': 'les 3 derniers mois', custom: 'la période choisie',
}

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getPeriodRange(p: Period, customFrom: string, customTo: string) {
  if (p === 'custom') return { from: customFrom || '0000-01-01', to: customTo || '9999-12-31' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  // « 1 mois » = le mois calendaire en cours (du 1er au dernier jour), pas les 30 derniers jours
  if (p === '1m') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { from: toYMD(first), to: toYMD(last) }
  }
  const from = new Date(today)
  if (p === '5j') from.setDate(from.getDate() - 4)
  if (p === '3m') { from.setMonth(from.getMonth() - 3); from.setDate(from.getDate() + 1) }
  return { from: toYMD(from), to: toYMD(today) }
}

// « 01 sept. au 30 sept. 2026 » · « 02 oct. 2026 » si un seul jour
export function formatRange(from: string, to: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null
  if (from.startsWith('0000') || to.startsWith('9999')) return null
  const parse = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d) }
  const a = parse(from), b = parse(to)
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
  if (from === to) return fmt(b, true)
  const sameYear = a.getFullYear() === b.getFullYear()
  return `${fmt(a, !sameYear)} au ${fmt(b, true)}`
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

      {(() => {
        const r = getPeriodRange(period, customFrom, customTo)
        const label = formatRange(r.from, r.to)
        return label ? (
          <p className="text-center text-xs font-semibold text-ink-soft">📅 {label}</p>
        ) : null
      })()}

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
