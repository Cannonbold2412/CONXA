import { useState } from 'react'
import { ExternalLink, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

const DOCS_ORIGIN = 'https://www.conxa.in'
export const TERMS_URL = `${DOCS_ORIGIN}/docs/terms`
export const PRIVACY_URL = `${DOCS_ORIGIN}/docs/privacy`

export interface LegalDocument {
  id: string
  title: string
  url: string
  sha256: string
}

export interface LegalStatus {
  version: string
  documents: LegalDocument[]
  accepted: boolean
  accepted_at: number | null
}

const KEY_TERMS = [
  'Build Studio is licensed to you, not sold. You may install and run it on the number of machines your plan covers, for your own organization’s use.',
  'You may not modify, reverse-engineer, decompile, or tamper with Build Studio or its licensing, update, and integrity checks — except where applicable law says that restriction cannot apply.',
  'You may not resell, rent, sublicense, white-label, or otherwise give Build Studio itself to anyone else, or run it as a service on someone else’s behalf.',
  'What you build is yours. The skill packages and installers you create with Build Studio can be used, distributed, and sold to your own end customers, subject to your plan.',
  'Recordings, screenshots, and built packages stay on this machine unless you publish, upload, or send them. Sign-in tokens are held in the operating system credential store.',
  'Your acceptance is recorded against your Conxa account — who accepted, which version, and when — so both sides have a record of the agreement.',
]

/** Falls back to the well-known doc URLs if the cloud sent an unexpected shape. */
function docUrl(documents: LegalDocument[], id: string, fallback: string): string {
  return documents.find((d) => d.id === id)?.url || fallback
}

export function LegalGateScreen({
  status,
  onAccept,
}: {
  status: LegalStatus
  onAccept: (payload: { version: string; document_hashes: Record<string, string> }) => Promise<void>
  }) {
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleContinue() {
    setSubmitting(true)
    setError(null)
    try {
      await onAccept({
        version: status.version,
        document_hashes: Object.fromEntries(status.documents.map((d) => [d.id, d.sha256])),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your acceptance. Try again.')
      setSubmitting(false)
    }
  }

  const open = (url: string) => () => {
    void window.conxa.openExternal(url)
  }

  return (
    <div
      className="fixed inset-x-0 top-10 bottom-0 z-[9999] flex items-center justify-center bg-[#090b0d] p-6"
      aria-modal="true"
      role="dialog"
      aria-label="Terms and Privacy"
    >
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#0d0f12] p-8 shadow-2xl">
        <div className="mb-6 flex justify-center">
          <div className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <Layers className="size-6 text-white/70" />
          </div>
        </div>

        <h1 className="mb-1 text-center text-xl font-semibold text-white">
          Terms &amp; Privacy
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-400">
          Before you use Conxa Build Studio, please accept the Terms and Conditions and the
          Privacy Policy.
        </p>

        <ul className="mb-6 min-h-0 space-y-3 overflow-y-auto rounded-lg border border-white/8 bg-black/20 p-4">
          {KEY_TERMS.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed text-zinc-300">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-white/30" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="mb-6 text-xs text-zinc-500">
          This summary is for convenience only. The full documents govern.{' '}
          <button
            type="button"
            onClick={open(docUrl(status.documents, 'terms', TERMS_URL))}
            className="inline-flex items-center gap-1 text-zinc-300 underline underline-offset-2 hover:text-white"
          >
            Terms and Conditions <ExternalLink className="size-3" />
          </button>{' '}
          &middot;{' '}
          <button
            type="button"
            onClick={open(docUrl(status.documents, 'privacy', PRIVACY_URL))}
            className="inline-flex items-center gap-1 text-zinc-300 underline underline-offset-2 hover:text-white"
          >
            Privacy Policy <ExternalLink className="size-3" />
          </button>
        </p>

        <label className="mb-6 flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
          <Checkbox
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            className="mt-0.5"
          />
          <span>
            I have read and agree to the Conxa Terms and Conditions and Privacy Policy, and I
            am authorized to accept them for my organization.
          </span>
        </label>

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={!agreed || submitting}
          onClick={handleContinue}
        >
          {submitting ? 'Recording…' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
