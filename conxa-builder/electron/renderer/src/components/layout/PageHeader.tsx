import { type ReactNode, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { usePageHeaderContext } from '@/contexts/PageHeaderContext'

type PageHeaderProps = {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

/** Registers this page's title/description into AppChrome's sticky top bar
 * (next to the user/logout widget) so it's never repeated in the page body.
 * Only renders something here when `actions` are supplied — a right-aligned
 * strip for page-level buttons that stay put in the body. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  const { setHeader } = usePageHeaderContext()

  useEffect(() => {
    setHeader({ title, description })
    return () => setHeader(null)
  }, [title, description, setHeader])

  if (!actions) return null

  return (
    <div className={cn('flex items-center justify-end gap-2 border-b border-white/8 px-4 py-3 sm:px-6', className)}>
      {actions}
    </div>
  )
}
