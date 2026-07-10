export const ANCHOR_RELATIONS = new Set(['target', 'inside', 'above', 'below', 'near'])

/** "relation:element" editor rows -> anchor objects, as persisted on `signals.anchors` /
 *  `recovery.anchors`. Blank lines are dropped; a line with no `relation:` prefix defaults to
 *  "near". */
export function parseAnchorRows(rows: string[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const line of rows) {
    const t = line.trim()
    if (!t) continue
    const idx = t.indexOf(':')
    if (idx === -1) {
      out.push({ element: t, relation: 'near' })
    } else {
      const left = t.slice(0, idx).trim().toLowerCase()
      const right = t.slice(idx + 1).trim()
      if (!right) continue
      out.push({
        element: right,
        relation: ANCHOR_RELATIONS.has(left) ? left : 'near',
      })
    }
  }
  return out
}

/** Reverse of `parseAnchorRows` — persisted anchor objects -> "relation:element" editor rows. */
export function anchorRowsFromObjects(anchors: Record<string, unknown>[]): string[] {
  return anchors
    .map((a) => {
      const o = a as Record<string, string>
      const element = String(o.element || o.value || o.text || '').trim()
      if (!element) return ''
      const relation = String(o.relation || '').trim().toLowerCase()
      return `${ANCHOR_RELATIONS.has(relation) ? relation : 'near'}:${element}`
    })
    .filter(Boolean)
}
