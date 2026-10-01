'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Transaction, BudgetCategory,
  EXPENSE_CATEGORIES,
  addTransaction, deleteTransaction,
  getBudgets, formatAmount,
} from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { useSpendingLines } from '@/lib/useSpendingLines'
import {
  durationLabel, computeBudgetStatuses, earliestCycleStart, isCustomBudget,
} from '@/lib/budgetPeriods'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'
import { useCustomCategories, CategoryManager } from './categories'
