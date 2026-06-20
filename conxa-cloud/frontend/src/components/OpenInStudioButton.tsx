'use client'

import { useEffect, useRef, useState } from 'react'
import { Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StudioDownloadDialog } from '@/components/StudioDownloadDialog'

interface Props {
  pluginId?: string
  /** Button size. Defaults to 'sm' (icon-only ghost). Pass 'default' for labelled outline button. */
  size?: 'sm' | 'default'
  /** Override the button label. Only shown when size='default'. Defaults to 'Open in Studio'. */
  label?: string
  /** Render as a filled primary button (e.g. for "Create a Plugin" CTAs). */
  primary?: boolean
}

export function OpenInStudioButton({ pluginId, size = 'sm', label = 'Open in Studio', primary = false }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const deepLink = pluginId
    ? `conxa-studio://open?plugin=${encodeURIComponent(pluginId)}`
    : 'conxa-studio://open'

  function launch(e: React.MouseEvent) {
    e.stopPropagation()

    // Detect whether the deep link successfully opened the app.
    //
    // On Windows, clicking a custom protocol link can trigger a system dialog
    // ("Open this link in Build Studio?"). That dialog causes window.blur even
    // when Studio is NOT installed — so we can't treat any blur as "success."
    //
    // Instead: blur sets didHide=true, but focus returning resets it to false
    // (the user dismissed the dialog without Studio opening). Only if blur
    // fires AND focus never returns within 1500 ms do we assume Studio opened.
    let didHide = false

    function onHide() { didHide = true }
    function onReturn() { didHide = false }

    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('blur', onHide)
    window.addEventListener('focus', onReturn)

    window.location.href = deepLink

    timerRef.current = setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('blur', onHide)
      window.removeEventListener('focus', onReturn)
      timerRef.current = null
      if (!didHide) {
        setDialogOpen(true)
      }
    }, 1500)
  }

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <>
      {primary ? (
        <Button
          variant="default"
          size="sm"
          className="gap-1.5 cursor-pointer"
          onClick={launch}
        >
          <Monitor className="size-3.5" />
          {label}
        </Button>
      ) : size === 'default' ? (
        <Button
          variant="outline"
          size="sm"
          className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white gap-1.5 cursor-pointer"
          onClick={launch}
        >
          <Monitor className="size-3.5" />
          {label}
        </Button>
      ) : (
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-zinc-400 hover:text-white cursor-pointer"
          title="Open in Build Studio"
          onClick={launch}
        >
          <Monitor className="size-4" />
        </Button>
      )}

      <StudioDownloadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
