'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Pencil, History, Minus } from 'lucide-react'
import {
  SavingsGoal,
  getSavings, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
  formatAmount,
} from '@/lib/storage'
import CoachTip from '../../CoachTip'
import { supabase } from '@/lib/supabase'

const EMOJIS = ['🏖️','🚗','🏠','💻','📱','✈️','🎓','💍','💰','🎮','👶']

interface SavingsDeposit {
  id: string
  goalId: string
  amount: number
  isWithdrawal: boolean
  note?: string
  depositedAt: string
}

function Confetti({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000)
    return () => clearTimeout(timer)
  }, [onDone])
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    color: ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#10B981','#F97316'][i % 6],
    size: 6 + Math.random() * 8,
  }))
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: `${p.left}%`, top: '-20px',
          width: p.size, height: p.size, backgroundColor: p.color,
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          animation: `confettiFall 3s ${p.delay}s linear forwards`,
        }}/>
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
