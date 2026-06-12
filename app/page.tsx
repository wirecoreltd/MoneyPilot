'use client'

import { useState, useEffect } from 'react'
import Sidebar from '../Sidebar'
import Dashboard from '../Dashboard'
import Transactions from '../Transactions'
import Budget from '../Budget'
import Savings from '../Savings'
import Debts from '../Debts'
import Coach from '../Coach'
import { getTransactions, Transaction } from '@/lib/storage'

type Tab = 'dashboard' | 'transactions' | 'budget' | 'savings' | 'debts' | 'coach'

export default function Page() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    setTransactions(getTransactions())
  }, [])

  const refresh = () => setTransactions(getTransactions())

  return (
    <div className="min-h-screen bg-mist">
      <Sidebar active={tab} onTabChange={setTab} />
      <main className="md:ml-56 pb-20 md:pb-0 p-4 md:p-8 max-w-4xl">
        {tab === 'dashboard' && <Dashboard transactions={transactions} />}
        {tab === 'transactions' && <Transactions transactions={transactions} onUpdate={refresh} />}
        {tab === 'budget' && <Budget transactions={transactions} />}
        {tab === 'savings' && <Savings />}
        {tab === 'debts' && <Debts />}
        {tab === 'coach' && <Coach />}
      </main>
    </div>
  )
}
