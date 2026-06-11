import Dashboard from '../Dashboard'
import { getTransactions } from '@/lib/storage'

export default function Page() {
  const transactions = getTransactions()

  return <Dashboard transactions={transactions} />
}
