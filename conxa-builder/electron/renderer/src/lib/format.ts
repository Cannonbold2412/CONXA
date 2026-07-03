/** Human-readable byte size, e.g. `formatBytes(2_500_000) === "2.4 MB"`.
 * Returns null for missing/non-finite values so callers can hide the field. */
export function formatBytes(value?: number): string | null {
  if (value == null || !Number.isFinite(value)) return null
  const units = ['B', 'KB', 'MB', 'GB']
  let n = value
  let unit = 0
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024
    unit += 1
  }
  const digits = unit === 0 || n >= 100 ? 0 : 1
  return `${n.toFixed(digits)} ${units[unit]}`
}
