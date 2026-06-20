'use client'

import { useState } from 'react'
import { Monitor, Download, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { getStudioManifest } from '@/api/pluginApi'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StudioDownloadDialog({ open, onOpenChange }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const manifest = await getStudioManifest()
      if (manifest.win_url) {
        window.open(manifest.win_url, '_blank', 'noopener')
        setDownloaded(true)
      }
    } finally {
      setDownloading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) setDownloaded(false)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <Monitor className="size-5 text-zinc-400" />
            <DialogTitle>
              {downloaded ? 'Installer downloading…' : 'Get Conxa Build Studio'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {downloaded
              ? 'Run the downloaded installer, then come back here and click "Create a Plugin" to start recording.'
              : 'Build Studio is a Windows desktop app where you record and publish workflows. Download it once, then use it to create plugins.'}
          </DialogDescription>
        </DialogHeader>

        {downloaded ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <div className="text-xs text-emerald-300 leading-relaxed">
                  <p className="font-medium mb-0.5">Next steps</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-emerald-400">
                    <li>Run the downloaded <span className="font-mono">.exe</span> installer</li>
                    <li>Launch Conxa Build Studio</li>
                    <li>Come back and click &quot;Create a Plugin&quot;</li>
                  </ol>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleDownload}
                disabled={downloading}
              >
                <Download className="size-3.5" />
                {downloading ? 'Getting link…' : 'Download again'}
              </Button>
              <Button size="sm" className="flex-1" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-white/8 bg-white/[0.03] px-4 py-3 text-xs text-zinc-400 leading-relaxed">
              <p className="font-medium text-zinc-300 mb-1.5">How it works</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Download and run the Build Studio installer below</li>
                <li>Record a browser workflow inside Build Studio</li>
                <li>Publish — your plugin appears here automatically</li>
              </ol>
            </div>
            <Button
              className="w-full"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              <Download className="size-3.5" />
              {downloading ? 'Getting download link…' : 'Download Build Studio for Windows'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
