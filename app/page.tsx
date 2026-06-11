'use client'

import { useState, useEffect } from 'react'
import Sidebar from '../Sidebar'
import Dashboard from '../Dashboard'
import Transactions from '../Transactions'
import Budget from '../Budget'
import Savings from '../Savings'
import Debts from '../Debts'
import {
  getTransactions, getBudgets, getSavings, getDebts,
  Transaction, BudgetCategory, SavingsGoal, Debt
} from '@/lib/storage'

type Tab = 'dashboard' | 'transactions' | 'budget' | 'savings' | 'debts'

export default function Page() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [budgets, setBudgets] = useState<BudgetCategory[]>([])
  const [savings, setSavings] = useState<SavingsGoal[]>([])
  const [debts, setDebts] = useState<Debt[]>([])

  // Charge toutes les données depuis localStorage (côté client uniquement)
  useEffect(() => {
    setTransactions(getTransactions())
    setBudgets(getBudgets())
    setSavings(getSavings())
    setDebts(getDebts())
  }, [])

  const refresh = () => {
    setTransactions(getTransactions())
    setBudgets(getBudgets())
    setSavings(getSavings())
    setDebts(getDebts())
  }

  return (
    <div className="min-h-screen bg-mist">
      <Sidebar active={tab} onTabChange={setTab} />

      {/* Offset pour sidebar desktop */}
      <main className="md:ml-56 pb-20 md:pb-0 p-4 md:p-8 max-w-4xl">
        {tab === 'dashboard' && <Dashboard transactions={transactions} />}
        {tab === 'transactions' && <Transactions transactions={transactions} onchange={refresh} />}
        {tab === 'budget' && <Budget transactions={transactions} budgets={budgets} onchange={refresh} />}
        {tab === 'savings' && <Savings savings={savings} onchange={refresh} />}
        {tab === 'debts' && <Debts debts={debts} onchange={refresh} />}
      </main>
    </div>
  )
}
