'use client'

import { errorMessage } from '@/lib/apiBase'
import { queryKeys } from '@/lib/queryKeys'

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchMe } from '@/api/productApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/product/ProductPrimitives'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Bug, Loader2, Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_ATTACHMENTS = 5
const MAX_TOTAL_BYTES = 25 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

type SubmitArgs = {
  description: string
  pageUrl: string
  contactEmail: string
  files: File[]
  token: string
}

async function submitBugReport({ description, pageUrl, contactEmail, files, token }: SubmitArgs) {
  const apiOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN || '').replace(/\/$/, '')
  if (!apiOrigin) throw new Error('Bug reporting is not configured (missing API origin).')

  const attachments = await Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      content_base64: await fileToBase64(file),
    })),
  )

  const res = await fetch(`${apiOrigin}/api/v1/bug-reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      description,
      page_url: pageUrl,
      contact_email: contactEmail,
      attachments,
    }),
  })

  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    let message = res.statusText || 'Could not send the report.'
    try {
      const parsed = JSON.parse(raw) as { message?: string; detail?: string }
      message = parsed.message || parsed.detail || message
    } catch {
      // non-JSON error body
    }
    throw new Error(message)
  }
}

export function ReportBugPage() {
  const { getToken } = useAuth()
  const meQ = useQuery({ queryKey: queryKeys.me, queryFn: fetchMe })

  const [description, setDescription] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [files, setFiles] = useState<File[]>([])

  useEffect(() => {
    if (meQ.data?.user.email) setContactEmail((prev) => prev || meQ.data.user.email || '')
  }, [meQ.data?.user.email])

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const tooManyFiles = files.length > MAX_ATTACHMENTS
  const tooBig = totalBytes > MAX_TOTAL_BYTES

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('You need to be signed in to send a report.')
      return submitBugReport({ description, pageUrl, contactEmail, files, token })
    },
    onSuccess: () => {
      toast.success('Bug report sent. Thanks for the details.')
      setDescription('')
      setPageUrl('')
      setFiles([])
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Could not send the report.'))
    },
  })

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_ATTACHMENTS + 5))
    e.target.value = ''
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!description.trim() || tooManyFiles || tooBig || mutation.isPending) return
    mutation.mutate()
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="Report a bug"
        description="Send details straight to the team."
        info="Describe what went wrong, optionally attach a screen recording or screenshots, and we'll get it by email."
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
        {meQ.isError ? <ErrorState message={errorMessage(meQ.error)} /> : null}

        <Card className="border-white/8 bg-white/[0.025] shadow-none">
          <CardHeader className="border-b border-white/6 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white">
              <Bug className="size-4 text-zinc-400" />
              What happened
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="bug-description">Describe the problem</Label>
                <textarea
                  id="bug-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={6}
                  maxLength={10_000}
                  placeholder="What did you do, what happened, what did you expect?"
                  className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bug-page-url">Page it happened on (optional)</Label>
                  <Input
                    id="bug-page-url"
                    type="text"
                    value={pageUrl}
                    onChange={(e) => setPageUrl(e.target.value)}
                    placeholder="/settings"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bug-contact-email">Contact email</Label>
                  <Input
                    id="bug-contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bug-attachments">Attachments (screenshots, screen recording)</Label>
                <label
                  htmlFor="bug-attachments"
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:border-white/25 hover:text-zinc-200"
                >
                  <Paperclip className="size-4 shrink-0" />
                  Choose files, or drag them here
                </label>
                <input
                  id="bug-attachments"
                  type="file"
                  multiple
                  accept="image/*,video/*,.log,.txt,.har,.json,.pdf,.zip"
                  onChange={handleFilesChange}
                  className="sr-only"
                />

                {files.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {files.map((file, i) => (
                      <li
                        key={`${file.name}-${i}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-xs text-zinc-300"
                      >
                        <span className="min-w-0 truncate">{file.name}</span>
                        <span className="shrink-0 text-zinc-500">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          aria-label={`Remove ${file.name}`}
                          className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className={cn('text-xs', tooManyFiles || tooBig ? 'text-red-300' : 'text-zinc-500')}>
                  {formatBytes(totalBytes)} of {formatBytes(MAX_TOTAL_BYTES)} · {files.length} of {MAX_ATTACHMENTS} files
                  {tooManyFiles ? ' — remove some files.' : tooBig ? ' — total is too large.' : ''}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-white/6 pt-3">
                <Button
                  type="submit"
                  disabled={!description.trim() || tooManyFiles || tooBig || mutation.isPending}
                >
                  {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Send report
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
