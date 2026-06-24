'use client'
import { useState, useEffect, useCallback } from 'react'
import Onboarding from '../Onboarding'
import BottomNav, { Tab } from '../BottomNav'
import HomeTab from '../HomeTab'
import MoneyTab from '../MoneyTab'
import BilanTab from '../BilanTab'
import CoachTab from '../coach'
import ProjectsTab from '../ProjectsTab'
import HistoriqueTab from '../HistoriqueTab'
import { getTransactions, Transaction, getUserProfile, UserProfile } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { LogOut } from "lucide-react"

export type MoneySubTab = 'transactions' | 'budget' | 'dettes' | 'epargne' | 'factures' | 'revenus'

export default function Page() {
  const [profile,      setProfile]      = useState<UserProfile | null>(null)
  const [tab,          setTab]          = useState<Tab>('home')
  const [moneySubTab,  setMoneySubTab]  = useState<MoneySubTab>('transactions')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading,      setLoading]      = useState(true)

  const refresh = useCallback(async () => {
    const txs = await getTransactions()
    setTransactions(txs)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }
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

  function goToMoney(sub: MoneySubTab) {
    setMoneySubTab(sub)
    setTab('money')
  }

  function goToProjects() {
    setTab('projets')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent to-blue-800 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-5xl mb-4 animate-pulse">⏳</div>
          <p className="font-bold text-xl">MoneyPilot</p>
        </div>
      </div>
    )
  }

  if (!profile?.completed) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  return (
    <div className="min-h-screen bg-mist">

      {/* ── Header mobile uniquement ── */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-mist-dark">
        <div className="flex items-center justify-between px-4 py-3">

          {/* Logo gauche */}
          <div>
            <span className="text-lg font-bold text-ink tracking-tight">
              Money<span className="text-accent">Pilot</span>
            </span>
            <p className="text-xs text-ink-soft mt-0.5">
              Votre copilote financier au quotidien.
            </p>
          </div>

          {/* User + déconnexion droite */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <span className="text-base">👋</span>
              <p className="text-sm font-bold text-ink">{profile.firstName}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center text-red-500 hover:text-red-600 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>

        </div>
      </header>

      {/* ── Sidebar desktop ── */}
      <BottomNav
        active={tab}
        onChange={setTab}
        profile={profile}
        onSignOut={handleSignOut}
      />

      {/* ── Contenu principal ── */}
      <main className="md:ml-60 pb-28 md:pb-8 px-4 py-4 md:px-8 md:py-8 max-w-2xl mx-auto md:mx-0">

        {tab === 'home' && (
          <HomeTab
            transactions={transactions}
            onUpdate={refresh}
            profile={profile}
            onGoToMoney={goToMoney}
            onGoToProjects={goToProjects}
          />
        )}

        {tab === 'money' && (
          <MoneyTab
            transactions={transactions}
            onUpdate={refresh}
            initialSubTab={moneySubTab}
            onSubTabChange={setMoneySubTab}
          />
        )}

        {tab === 'historique' && <HistoriqueTab />}
        {tab === 'bilan'      && <BilanTab transactions={transactions} />}
        {tab === 'projets'    && <ProjectsTab />}
        {tab === 'coach'      && <CoachTab />}

      </main>
    </div>
  )
}
