'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.'
  if (m.includes('email not confirmed')) return 'Confirme ton email avant de te connecter (vérifie ta boîte mail).'
  if (m.includes('already registered')) return 'Un compte existe déjà avec cet email.'
  if (m.includes('rate limit')) return 'Trop de tentatives. Réessaie dans quelques minutes.'
  return 'Une erreur est survenue. Réessaie.'
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit() {
    if (loading) return
    setInfo(null)

    if (!email.trim() || !password) {
      setError('Veuillez remplir tous les champs.')
      return
    }

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères.')
        return
      }
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas.')
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) {
          setError(translateAuthError(error.message))
        } else {
          window.location.href = '/'
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        })
        if (error) {
          setError(translateAuthError(error.message))
        } else if (data.session) {
          // Confirmation email désactivée : l'utilisateur est déjà connecté
          window.location.href = '/'
        } else {
          setInfo('Compte créé ! Clique sur le lien reçu par email, puis connecte-toi.')
          setMode('login')
          setPassword('')
          setConfirmPassword('')
        }
      }
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-xl space-y-5">

        <div className="text-center">
          <img
            src="/moneypilot.png"
            alt="MoneyPilot"
            className="w-16 h-16 mx-auto mb-2 object-contain"
          />

          <span className="text-xl font-bold">
            Money<span className="text-accent">Pilot</span>
          </span>

          <p className="text-sm text-ink-soft mt-1">
            {mode === 'login' ? 'Connecte-toi à ton compte' : 'Crée ton compte'}
          </p>
        </div>

        {error && (
          <div className="bg-danger-light text-danger text-sm p-3 rounded-2xl">
            {error}
          </div>
        )}

        {info && (
          <div className="bg-green-50 text-green-700 text-sm p-3 rounded-2xl">
            {info}
          </div>
        )}

        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            placeholder="ton@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Mot de passe</label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {mode === 'signup' && (
          <div>
            <label className="label">Confirmer le mot de passe</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
        )}

        <button
          className="btn-primary w-full py-4 text-base"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading
            ? 'Chargement...'
            : mode === 'login'
            ? 'Se connecter'
            : 'Créer le compte'}
        </button>

        <button
          className="w-full text-center text-sm text-ink-soft"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
            setInfo(null)
            setPassword('')
            setConfirmPassword('')
          }}
        >
          {mode === 'login'
            ? 'Pas encore de compte ? Créer un compte'
            : 'Déjà un compte ? Se connecter'}
        </button>

      </div>
    </div>
  )
}
