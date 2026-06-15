'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [mode,     setMode]     = useState<'login' | 'signup'>('login')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState<string | null>(null)

  async function handleSubmit() {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else window.location.href = '/'
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setSuccess('Compte créé ! Vérifie ton email pour confirmer, puis connecte-toi.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-xl space-y-5">
        <div className="text-center">
          <p className="text-4xl mb-2">💰</p>
          <h1 className="text-2xl font-bold text-ink">MonBudget</h1>
          <p className="text-sm text-ink-soft mt-1">
            {mode === 'login' ? 'Connecte-toi à ton compte' : 'Crée ton compte'}
          </p>
        </div>

        {error && (
          <div className="bg-danger-light text-danger text-sm p-3 rounded-2xl">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-positive-light text-positive text-sm p-3 rounded-2xl">
            {success}
          </div>
        )}

        <div>
          <label className="label">Email</label>
          <input className="input" type="email" placeholder="ton@email.com"
            value={email} onChange={e => setEmail(e.target.value)}/>
        </div>

        <div>
          <label className="label">Mot de passe</label>
          <input className="input" type="password" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}/>
        </div>

        <button className="btn-primary w-full py-4 text-base" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </button>

        <button
          className="w-full text-center text-sm text-ink-soft"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setSuccess(null) }}>
          {mode === 'login'
            ? "Pas encore de compte ? Créer un compte"
            : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  )
}
