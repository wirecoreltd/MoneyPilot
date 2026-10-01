'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Pencil, History, ChevronDown, Check, ChevronRight } from 'lucide-react'
import {
  Debt,
  getDebts, addDebt, updateDebt, deleteDebt,
  formatAmount, currentYearMonth, hasStarted,
} from '@/lib/storage'
import CoachTip from '../../CoachTip'
import { supabase } from '@/lib/supabase'
import { debtEndLabel } from '@/lib/finance'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'
import { useCustomCategories, CategoryManager } from './categories'

const startLabel = (ymd: string) => new Date(ymd).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

interface DebtPaymentHistory {
  id: string
  debtId: string
  amount: number
  paidAt: string
  note?: string
  category?: string
}
