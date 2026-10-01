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
import { ensureRecurring } from '@/lib/recurring'
import { getTransactions, Transaction, getUserProfile, UserProfile } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { LogOut } from 'lucide-react'
import { SpaceProvider } from '@/components/SpaceContext'
import SpaceSwitcher from '@/components/SpaceSwitcher'

export type MoneySubTab = 'transactions' | 'budget' | 'dettes' | 'epargne' | 'factures' | 'revenus'

function PageContent() {
  const [profile,      setProfile]      = useState<UserProfile | null>(null)
  const [tab,          setTab]          = useState<Tab>('home') // identique côté serveur ET premier rendu client
  const [moneySubTab,  setMoneySubTab]  = useState<MoneySubTab>('transactions')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState<string | null>(null)

  // Restaure l'onglet actif après l'hydratation
    useEffect(() => {
    const saved = localStorage.getItem('activeTab')
    if (saved) setTab(saved as Tab)
    const savedSub = localStorage.getItem('moneySubTab')
    const validSubs = ['transactions', 'budget', 'dettes', 'epargne', 'factures', 'revenus']
    if (savedSub && validSubs.includes(savedSub)) setMoneySubTab(savedSub as MoneySubTab)
  }, [])

  function handleSubTabChange(sub: MoneySubTab) {
    setMoneySubTab(sub)
    localStorage.setItem('moneySubTab', sub)
  }

  const refresh = useCallback(async () => {
    try {
      const txs = await getTransactions()
      setTransactions(txs)
    } catch (e) {
      console.error('Rafraîchissement des transactions échoué :', e)
    }
  }, [])

  const init = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    let redirecting = false
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session) {
        redirecting = true
        window.location.href = '/login'
        return
      }
      try { await ensureRecurring(supabase, session.user.id) }
      catch (e) { console.error('Récurrents non générés :', e) } // ne bloque pas l'app

      const [p, txs] = await Promise.all([getUserProfile(), getTransactions()])
      setProfile(p)
      setTransactions(txs)
    } catch (e) {
      console.error('Chargement échoué :', e)
      setProfile(null)
      setLoadError(e instanceof Error && e.message ? e.message : 'Erreur de chargement')
    } finally {
      if (!redirecting) setLoading(false)
    }
  }, [])

  useEffect(() => { init() }, [init])

  function handleOnboardingComplete(p: UserProfile) {
    setProfile(p)
  }

  function goToMoney(sub: MoneySubTab) {
    setMoneySubTab(sub)
    setTab('money')
    localStorage.setItem('activeTab', 'money')
  }

  function goToProjects() {
    setTab('projets')
    localStorage.setItem('activeTab', 'projets')
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

  // Échec de chargement : on n'affiche JAMAIS l'onboarding dans ce cas
  if (loadError) {
    return (
      <div className="min-h-screen bg-mist flex items-center justify-center px-4">
        <div className="card text-center py-8 space-y-3 max-w-sm w-full">
          <p className="text-3xl">⚠️</p>
          <p className="font-semibold text-ink">Impossible de charger tes données</p>
          <p className="text-sm text-danger">{loadError}</p>
          <button className="btn-primary w-full" onClick={init}>Réessayer</button>
          <button className="btn-ghost w-full" onClick={handleSignOut}>Se déconnecter</button>
        </div>
      </div>
    )
  }

  // Chargement réussi et profil réellement absent ou incomplet
  if (!profile?.completed) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  return (
    <div className="min-h-screen bg-mist">

      {/* ── Header mobile uniquement ── */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-mist-dark">
        <div className="flex items-center justify-between px-4 py-3">

          {/* Logo gauche */}
          <div className="flex items-center gap-2">
            <img src="/moneypilot.png" alt="MoneyPilot" className="h-8 w-auto" />
            <div>
              <span className="text-lg font-bold text-ink tracking-tight">
                Money<span className="text-accent">Pilot</span>
              </span>
              <p className="text-xs text-orange-400 mt-0.5">
                Votre copilote financier au quotidien.
              </p>
            </div>
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
        onChange={(t) => {
          setTab(t)
          localStorage.setItem('activeTab', t)
        }}
        profile={profile}
        onSignOut={handleSignOut}
      />

      {/* ── Contenu principal ── */}
            <main className="md:ml-60 pb-28 md:pb-8 px-4 py-4 md:px-8 md:py-8 max-w-2xl mx-auto md:mx-0">

        <div className="mb-4">
          <SpaceSwitcher />
        </div>

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
            onSubTabChange={handleSubTabChange}
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

export default function Page() {
  return (
    <SpaceProvider>
      <PageContent />
    </SpaceProvider>
  )
}

