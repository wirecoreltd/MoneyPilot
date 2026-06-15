'use client'
import { useState, useEffect, useCallback } from 'react'
import Onboarding from '../Onboarding'
import BottomNav, { Tab } from '../BottomNav'
import HomeTab from '../HomeTab'
import MoneyTab from '../MoneyTab'
import BilanTab from '../BilanTab'
import ProjectsTab from '../ProjectsTab'
import { getTransactions, Transaction, getUserProfile, UserProfile } from '@/lib/storage'

export default function Page() {
  const [profile,      setProfile]      = useState<UserProfile | null>(null)
  const [tab,          setTab]          = useState<Tab>('home')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading,      setLoading]      = useState(true)

  const refresh = useCallback(async () => {
    const txs = await getTransactions()
    setTransactions(txs)
  }, [])

  useEffect(() => {
    async function init() {
      const [p, txs] = await Promise.all([getUserProfile(), getTransactions()])
      setProfile(p)
      setTransactions(txs)
      setLoading(false)
    }
    init()
  }, [])

  function handleOnboardingComplete(p: UserProfile) {
    setProfile(p)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent to-blue-800
                      flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-5xl mb-4 animate-pulse">💰</div>
          <p className="font-bold text-xl">MonBudget</p>
        </div>
      </div>
    )
  }

  if (!profile?.completed) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  return (
    <div className="min-h-screen bg-mist">
      <BottomNav active={tab} onChange={setTab} />
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-mist-dark
                         px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-bold text-ink tracking-tight">
          Mon<span className="text-accent">Budget</span>
        </span>
        <span className="text-xs text-ink-soft font-medium">
          👋 {profile.firstName}
        </span>
      </header>
      <main className="md:ml-60 pb-28 md:pb-8 px-4 py-4 md:px-8 md:py-8 max-w-2xl mx-auto md:mx-0">
        {tab === 'home'    && <HomeTab     transactions={transactions} onUpdate={refresh} profile={profile} />}
        {tab === 'money'   && <MoneyTab    transactions={transactions} onUpdate={refresh} />}
        {tab === 'bilan'   && <BilanTab    transactions={transactions} />}
        {tab === 'projets' && <ProjectsTab />}
      </main>
    </div>
  )
}
