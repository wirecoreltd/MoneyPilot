'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Pencil, History } from 'lucide-react'
import { formatAmount, currentYearMonth } from '@/lib/storage'
import CoachTip from '../../CoachTip'
import { supabase } from '@/lib/supabase'
import { estimateVariableAmount } from '@/lib/finance'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'
import { DEFAULT_CATEGORIES, useCustomCategories, CategoryManager } from './categories'

interface Facture {
  id: string
  name: string
  amount: number | null
  estimate?: number
  amountVariable: boolean
  dueDate?: string
  isRecurring: boolean
  category: string
  paid: boolean
  month: string
  note?: string
  createdAt?: string
}

interface FacturePayment {
  id: string
  factureId: string
  amount: number
  paidAt: string
  note?: string
}
