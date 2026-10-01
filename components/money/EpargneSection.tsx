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
