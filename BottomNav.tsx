'use client'
import { Home, Wallet, BarChart3, Rocket, BrainCircuit, CalendarDays } from 'lucide-react'
import type { UserProfile } from '@/lib/storage'

export type Tab = 'home' | 'money' | 'bilan' | 'projets' | 'coach' | 'historique'

const nav = [
  { id: 'home'       as Tab, label: 'Accueil',    icon: Home         },
  { id: 'money'      as Tab, label: 'Argent',     icon: Wallet       },  
  { id: 'bilan'      as Tab, label: 'Bilan',      icon: BarChart3    },
  { id: 'projets'    as Tab, label: 'Projets',    icon: Rocket       },
  { id: 'coach'      as Tab, label: 'Coach',      icon: BrainCircuit },
  { id: 'historique' as Tab, label: 'Synthèse',      icon: CalendarDays },
]

interface Props {
  active: Tab
  onChange: (t: Tab) => void
  profile?: UserProfile | null
  onSignOut?: () => void
}

export default function BottomNav({ active, onChange, profile, onSignOut }: Props) {
  return (
    <>
      {/* ── Mobile bottom bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-mist-dark flex z-50">
        {nav.map(({ id, label, icon: Icon }) => {
          const isCoach = id === 'coach'
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-semibold
                          transition-colors min-h-[56px] relative
                          ${isActive
                            ? isCoach ? 'text-violet-600' : 'text-accent'
                            : 'text-ink-soft'}`}
            >
              {isCoach && isActive && (
                <span className="absolute top-1.5 inset-x-2 h-8 rounded-xl bg-violet-50 -z-10" />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="text-[10px] font-semibold">{label}</span>
              {isCoach && !isActive && (
                <span className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-violet-500" />
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-mist-dark
                        min-h-screen p-5 fixed top-0 left-0 gap-1">
        {/* Logo */}
        <div className="mb-8 px-2 pt-2">
          <span className="text-2xl font-bold text-ink tracking-tight">
            Money<span className="text-accent">Pilot</span>
          </span>
          <p className="text-xs text-ink-soft mt-1">Votre copilote financier au quotidien.</p>
        </div>

        {/* Nav items */}
        {nav.map(({ id, label, icon: Icon }) => {
          const isCoach = id === 'coach'
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold
                          transition-colors text-left min-h-[48px]
                          ${isActive
                            ? isCoach
                              ? 'bg-violet-600 text-white'
                              : 'bg-accent text-white'
                            : isCoach
                              ? 'text-violet-600 hover:bg-violet-50'
                              : 'text-ink-soft hover:bg-mist hover:text-ink'}`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              {label}
              {isCoach && !isActive && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600">
                  IA
                </span>
              )}
            </button>
          )
        })}

        {/* ── Profil + déconnexion en bas de la sidebar ── */}
        {profile && onSignOut && (
          <div className="mt-auto pt-4 border-t border-mist-dark">
            <div className="flex items-center justify-center px-2 py-2">
              <span className="text-lg mr-1">👋</span>
              <p className="text-sm font-bold text-ink truncate">
                {profile.firstName}
              </p>
              <button
                onClick={onSignOut}
                className="ml-7 flex items-center justify-center text-red-500 hover:text-red-600 transition-colors"
              >
                <span className="text-xl">⏻</span>
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
