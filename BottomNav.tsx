'use client'
import { Home, Wallet, BarChart3, Rocket, BrainCircuit } from 'lucide-react'

export type Tab = 'home' | 'money' | 'bilan' | 'projets' | 'coach'

const nav = [
  { id: 'home'    as Tab, label: 'Accueil',  icon: Home         },
  { id: 'money'   as Tab, label: 'Argent',   icon: Wallet       },
  { id: 'bilan'   as Tab, label: 'Bilan',    icon: BarChart3    },
  { id: 'projets' as Tab, label: 'Projets',  icon: Rocket       },
  { id: 'coach'   as Tab, label: 'Coach',    icon: BrainCircuit },
]

export default function BottomNav({ active, onChange }: {
  active: Tab
  onChange: (t: Tab) => void
}) {
  return (
    <>
      {/* Mobile bottom bar */}
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
              {/* Coach gets a subtle glow pill when active */}
              {isCoach && isActive && (
                <span className="absolute top-1.5 inset-x-2 h-8 rounded-xl bg-violet-50 -z-10" />
              )}
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              {label}
              {/* Dot indicator on Coach tab when not active — invites curiosity */}
              {isCoach && !isActive && (
                <span className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-violet-500" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-mist-dark
                        min-h-screen p-5 fixed top-0 left-0 gap-1">
        <div className="mb-8 px-2 pt-2">
          <span className="text-2xl font-bold text-ink tracking-tight">
            Money<span className="text-accent">Pilot</span>
          </span>
          <p className="text-xs text-ink-soft mt-1">Votre copilote financier au quotidien.</p>
        </div>

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
              {/* Subtle badge on desktop to signal AI activity */}
              {isCoach && !isActive && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600">
                  IA
                </span>
              )}
            </button>
          )
        })}
      </aside>
    </>
  )
}
