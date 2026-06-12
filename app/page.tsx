'use client'
import { useState, useEffect } from 'react'
import BottomNav, { Tab } from '../BottomNav'
import HomeTab from '../HomeTab'
import MoneyTab from '../MoneyTab'
import BilanTab from '../BilanTab'
import ProjectsTab from '../ProjectsTab'
import { getTransactions, Transaction } from '@/lib/storage'

export default function Page() {
  const [tab, setTab] = useState<Tab>('home')
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => { setTransactions(getTransactions()) }, [])
  const refresh = () => setTransactions(getTransactions())

  return (
    <div className="min-h-screen bg-mist">
      <BottomNav active={tab} onChange={setTab} />

      {/* Header mobile */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-mist-dark
                         px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-bold text-ink tracking-tight">
          Mon<span className="text-accent">Budget</span>
        </span>
        <span className="text-xs text-ink-soft font-medium">🇲🇺 Mauritius</span>
      </header>

      <main className="md:ml-60 pb-28 md:pb-8 px-4 py-4 md:px-8 md:py-8 max-w-2xl mx-auto md:mx-0">
        {tab === 'home'    && <HomeTab     transactions={transactions} onUpdate={refresh} />}
        {tab === 'money'   && <MoneyTab    transactions={transactions} onUpdate={refresh} />}
        {tab === 'bilan'   && <BilanTab    transactions={transactions} />}
        {tab === 'projets' && <ProjectsTab />}
      </main>
    </div>
  )
}
