'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { Transaction, formatAmount, getMonthLabel } from '@/lib/storage'

interface Props {
  transactions: Transaction[]
}

function StatCard({ label, amount, icon: Icon, color }: {
  label: string; amount: number; icon: React.ElementType; color: string
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`p-2.5 rounded-xl ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-ink-soft uppercase tracking-wide font-medium">{label}</p>
        <p className="text-xl font-bold text-ink font-mono mt-0.5">{formatAmount(amount)}</p>
      </div>
    </div>
  )
}

export default function Dashboard({ transactions }: Props) {
  const { totalIncome, totalExpenses, balance, chartData, recent } = useMemo(() => {
    // Group by month for chart (last 6 months)
    const monthMap: Record<string, { income: number; expenses: number }> = {}
    const now = new Date()

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthMap[ym] = { income: 0, expenses: 0 }
    }

    transactions.forEach(tx => {
      const ym = tx.date.slice(0, 7)
      if (monthMap[ym]) {
        if (tx.type === 'income') monthMap[ym].income += tx.amount
        else monthMap[ym].expenses += tx.amount
      }
    })

    const chartData = Object.entries(monthMap).map(([ym, v]) => ({
      month: getMonthLabel(ym).split(' ')[0],
      Revenus: v.income,
      Dépenses: v.expenses,
    }))

    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentMonthTxs = transactions.filter(t => t.date.startsWith(currentYM))

    const totalIncome = currentMonthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const totalExpenses = currentMonthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const balance = totalIncome - totalExpenses

    const recent = transactions.slice(0, 8)

    return { totalIncome, totalExpenses, balance, chartData, recent }
  }, [transactions])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Tableau de bord</h1>
        <p className="text-sm text-ink-soft mt-1">Ce mois-ci</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Solde"
          amount={balance}
          icon={Wallet}
          color={balance >= 0 ? 'bg-positive-light text-positive' : 'bg-danger-light text-danger'}
        />
        <StatCard label="Revenus" amount={totalIncome} icon={TrendingUp} color="bg-positive-light text-positive" />
        <StatCard label="Dépenses" amount={totalExpenses} icon={TrendingDown} color="bg-danger-light text-danger" />
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-ink mb-4">Évolution sur 6 mois</h2>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-ink-soft">
            <AlertCircle size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Aucune transaction encore</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EAF0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#3A3A3A' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#3A3A3A' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatAmount(v)} contentStyle={{ borderRadius: 12, border: '1px solid #E8EAF0' }} />
              <Bar dataKey="Revenus" fill="#16A34A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Dépenses" fill="#DC2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {recent.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-ink mb-4">Transactions récentes</h2>
          <div className="space-y-2">
            {recent.map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-mist last:border-0">
                <div>
                  <p className="text-sm font-medium text-ink">{tx.note || tx.category}</p>
                  <p className="text-xs text-ink-soft">{tx.category} · {new Date(tx.date).toLocaleDateString('fr-FR')}</p>
                </div>
                <span className={`font-mono text-sm font-semibold ${tx.type === 'income' ? 'text-positive' : 'text-danger'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
