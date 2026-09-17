import { type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <Card className="border-dashed border-white/10 bg-white/[0.025] shadow-none">
      <CardContent className="flex min-h-48 flex-col items-center justify-center px-6 py-8 text-center">
        <p className="text-sm font-medium text-white">{title}</p>
        {description ? <p className="mt-1 max-w-md text-sm text-zinc-500">{description}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </CardContent>
    </Card>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2 text-sm text-red-100">
      <AlertCircle className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-zinc-400">
      <Loader2 className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  )
}
