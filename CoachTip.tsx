import { Lightbulb } from 'lucide-react'

export default function CoachTip({ message }: { message: string }) {
  return (
    <div className="coach-tip">
      <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
        <Lightbulb size={16} className="text-white" />
      </div>
      <p className="text-sm text-accent font-medium leading-relaxed">{message}</p>
    </div>
  )
}
