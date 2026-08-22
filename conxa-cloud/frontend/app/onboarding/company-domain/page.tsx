'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setInstallerDomain } from '@/api/productApi'

export default function CompanyDomainPage() {
  const router = useRouter()
  const [domain, setDomain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await setInstallerDomain(domain.trim())
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that domain.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 px-4">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold text-white">What's your company's domain?</h1>
        <p className="text-sm text-zinc-400">
          Used to name the installers you build and ship to your customers.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="domain">Company domain</Label>
          <Input
            id="domain"
            name="domain"
            placeholder="acme.com"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            aria-invalid={error ? true : undefined}
            autoFocus
            required
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <Button type="submit" disabled={submitting || !domain.trim()}>
          {submitting ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </div>
  )
}
