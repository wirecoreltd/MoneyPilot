'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Pencil, ChevronDown, Check } from 'lucide-react'
import { formatAmount } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'

interface RevenuSource {
  id: string
  label: string
  amount: number
  type: 'fixed' | 'variable'
  month: string
  date: string
}

