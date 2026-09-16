'use client'

import { useState } from 'react'
import { Check, Copy, KeySquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ClaimPage({ grantId }: { grantId: string }) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(grantId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — the code is still visible/selectable below.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0d10] px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-4 text-center text-sm font-medium tracking-wide text-zinc-500">CONXA</p>
        <Card className="border-white/8 bg-white/[0.025] text-zinc-100 shadow-none">
          <CardHeader className="border-b border-white/8 pb-4">
            <div className="mb-1 flex items-center gap-2">
              <KeySquare className="size-5 text-zinc-400" />
              <CardTitle className="text-white">You&apos;ve been granted a Conxa Execute seat</CardTitle>
            </div>
            <CardDescription className="text-zinc-500">
              A workspace admin invited you to use Conxa Execute — their AI Usage Credits pool pays
              for your chat, no card or key needed from you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-500">Invite code</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-200">
                  {grantId}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                  onClick={copyCode}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-white/8 bg-black/20 px-4 py-3 text-xs leading-relaxed text-zinc-400">
              <p className="mb-1.5 font-medium text-zinc-300">To redeem it</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open Conxa Execute</li>
                <li>Sign in with the email address this invite was sent to</li>
                <li>Go to Settings and paste the code above under &quot;Have an invite code?&quot;</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
