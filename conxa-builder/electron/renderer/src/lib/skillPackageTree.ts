import type { ComponentType } from 'react'
import { FileCode2, FileJson, FileText, ImageIcon } from 'lucide-react'

const ROOT_FILE_ORDER = [
  'skill_package.json', 'README.md', 'CLAUDE.md', 'Claude.md', 'index.md', 'LICENSE',
  'schema.json', 'package.json', 'index.js', 'skill.json', 'README.md', 'index.json',
]
const SKILL_FILE_ORDER = ['SKILL.md', 'execution.json', 'recovery.json', 'input.json', 'manifest.json']

export function orderedSkillPackageKeys(keys: string[]): string[] {
  const set = new Set(keys)
  const head: string[] = []
  for (const k of ROOT_FILE_ORDER) if (set.has(k) && !head.includes(k)) head.push(k)

  const dotDirs = [...keys]
    .filter((k) => /^\.[^/]+\//.test(k))
    .sort((a, b) => a.localeCompare(b))

  const skillSlugs = [
    ...new Set(
      keys
        .map((k) => { const m = /^skills\/([^/]+)\//.exec(k); return m ? m[1] : '' })
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b))

  const mid: string[] = []
  for (const slug of skillSlugs) {
    const prefix = `skills/${slug}/`
    for (const f of SKILL_FILE_ORDER) {
      const kk = `${prefix}${f}`
      if (set.has(kk)) mid.push(kk)
    }
    const rest = keys.filter((k) => k.startsWith(prefix) && !mid.includes(k)).sort((a, b) => a.localeCompare(b))
    mid.push(...rest)
  }

  const used = new Set([...head, ...dotDirs, ...mid])
  const tail = [...keys].filter((k) => !used.has(k)).sort((a, b) => a.localeCompare(b))
  return [...head, ...dotDirs, ...mid, ...tail]
}

export type PathTrieNode = {
  segment: string
  fileKey: string | null
  children: PathTrieNode[]
}

function getOrCreateTrieChild(parent: PathTrieNode, segment: string): PathTrieNode {
  let child = parent.children.find((c) => c.segment === segment)
  if (!child) {
    child = { segment, fileKey: null, children: [] }
    parent.children.push(child)
  }
  return child
}

export function buildPathTrie(orderedPaths: readonly string[]): PathTrieNode {
  const root: PathTrieNode = { segment: '', fileKey: null, children: [] }
  for (const key of orderedPaths) {
    const parts = key.split('/').filter((p) => p.length > 0)
    if (parts.length === 0) continue
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i]!
      const child = getOrCreateTrieChild(cur, segment)
      cur = child
      if (i === parts.length - 1) {
        cur.fileKey = key
      }
    }
  }
  return root
}

export function defaultSkillPackageActiveKey(keys: string[]): string | null {
  if (keys.length === 0) return null
  const ordered = orderedSkillPackageKeys(keys)
  const preferred = ordered.find((k) => k === 'skill_package.json' || k === 'README.md' || k.endsWith('/SKILL.md'))
  return preferred ?? ordered[0] ?? null
}

export function isImageVisualKey(key: string): boolean {
  return /\/visuals\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(key)
}

export function imageMimeFromKey(key: string): string {
  const base = key.slice(key.lastIndexOf('/') + 1).toLowerCase()
  if (base.endsWith('.png')) return 'image/png'
  if (base.endsWith('.jpg') || base.endsWith('.jpeg')) return 'image/jpeg'
  if (base.endsWith('.gif')) return 'image/gif'
  if (base.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

export function base64DecodedBytes(b64: string): number {
  try {
    return atob(b64).length
  } catch {
    return 0
  }
}

export function formatModifiedAt(value: number) {
  return new Date(value * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function relativeTime(unixSeconds: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - unixSeconds
  if (diffSec < 60) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 86_400 * 7) return `${Math.floor(diffSec / 86_400)}d ago`
  return formatModifiedAt(unixSeconds)
}

export function leafFileName(filename: string): string {
  return filename.includes('/') ? filename.slice(filename.lastIndexOf('/') + 1) : filename
}

export function iconForFile(key: string): ComponentType<{ className?: string }> {
  if (key.includes('/visuals/')) return ImageIcon
  if (key.endsWith('.ts')) return FileCode2
  if (key.endsWith('.js')) return FileCode2
  if (key.endsWith('.md')) return FileText
  return FileJson
}

export function labelForFile(filename: string) {
  const leaf = leafFileName(filename)
  if (filename.includes('/visuals/')) return 'Visual'
  if (leaf.endsWith('.ts')) return 'TypeScript'
  if (leaf.endsWith('.js')) return 'JavaScript'
  if (leaf.endsWith('.md')) return 'Markdown'
  if (leaf.endsWith('.json')) return 'JSON'
  return 'File'
}
