'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Pencil } from 'lucide-react'
import {
  Transaction, BudgetCategory,
  getBudgets, addBudget, updateBudget, deleteBudget,
  formatAmount,
} from '@/lib/storage'
import CoachTip from '../../CoachTip'
import { budgetStatus, isoDate } from '@/lib/finance'
import { useSpendingLines } from '@/lib/useSpendingLines'
import {
  sumByCategory, sumCategory, durationLabel, BUDGET_DURATIONS,
  budgetCycle, isCustomBudget,
} from '@/lib/budgetPeriods'
import PeriodFilter, { usePeriod, PERIOD_LABEL } from './PeriodFilter'
import { useCustomCategories, CategoryManager } from './categories'

const COLORS = ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#10B981','#F97316']
