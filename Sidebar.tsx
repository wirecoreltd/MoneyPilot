'use client'
import { LayoutDashboard, ArrowLeftRight, Target, PiggyBank, HandCoins, Brain } from 'lucide-react'

type Tab = 'dashboard' | 'transactions' | 'budget' | 'savings' | 'debts' | 'coach'

interface SidebarProps {
  active: Tab
  onTabChange: (tab: Tab) => void
}

const nav = [
  { id: 'dashboard' as Tab, label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'transactions' as Tab, label: 'Transactions', icon: ArrowLeftRight },
  { id: 'budget' as Tab, label: 'Budget', icon: Target },
  { id: 'savings' as Tab, label: 'Épargne', icon: PiggyBank },
  { id: 'debts' as Tab, label: 'Dettes', icon: HandCoins },
  { id: 'coach' as Tab, label: 'Coach', icon: Brain },
]

export default function Sidebar({ active, onTabChange }: SidebarProps) {
  return (
    <>
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-mist-dark min-h-screen p-4 fixed top-0 left-0">
        <div className="mb-8 px-2 pt-2">
          <span className="text-xl font-bold text-ink tracking-tight">Mon<span className="text-accent">Budget</span></span>
          <p className="text-xs text-ink-soft mt-0.5">Finances claires</p>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onTabChange(id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                active === id ? 'bg-accent-light text-accent' : 'text-ink-soft hover:bg-mist hover:text-ink'
              }`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>
      </aside>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-mist-dark flex z-50">
        {nav.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => onTabChange(id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors ${
              active === id ? 'text-accent' : 'text-ink-soft'
            }`}>
            <Icon size={18} />
            <span className="hidden xs:block">{label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
