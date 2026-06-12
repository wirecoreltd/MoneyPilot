'use client'
import { Home, Wallet, BarChart3 } from 'lucide-react'

export type Tab = 'home' | 'money' | 'bilan'

const nav = [
  { id: 'home'  as Tab, label: 'Accueil', icon: Home },
  { id: 'money' as Tab, label: 'Argent',  icon: Wallet },
  { id: 'bilan' as Tab, label: 'Bilan',   icon: BarChart3 },
]

export default function BottomNav({ active, onChange }: {
  active: Tab
  onChange: (t: Tab) => void
}) {
  return (
    <>
      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-mist-dark
                      flex z-50 pb-safe">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-semibold
                        transition-colors min-h-[56px]
                        ${active === id ? 'text-accent' : 'text-ink-soft'}`}
          >
            <Icon size={22} strokeWidth={active === id ? 2.5 : 1.8} />
            {label}
          </button>
        ))}
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-mist-dark
                        min-h-screen p-5 fixed top-0 left-0 gap-1">
        <div className="mb-8 px-2 pt-2">
          <span className="text-2xl font-bold text-ink tracking-tight">
            Mon<span className="text-accent">Budget</span>
          </span>
          <p className="text-xs text-ink-soft mt-1">Finances claires · Mauritius</p>
        </div>
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold
                        transition-colors text-left min-h-[48px]
                        ${active === id
                          ? 'bg-accent text-white'
                          : 'text-ink-soft hover:bg-mist hover:text-ink'}`}
          >
            <Icon size={18} strokeWidth={active === id ? 2.5 : 1.8} />
            {label}
          </button>
        ))}
      </aside>
    </>
  )
}
