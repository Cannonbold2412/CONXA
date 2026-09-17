/** Shared display formatters. These were independently reimplemented across
 * 7+ pages/components with the same core logic and slightly different
 * fallback copy — collected here once. Each keeps its own `fallback` param
 * so call sites can still say "Never" vs "No activity yet" vs "Unknown". */

/** A unix-seconds timestamp as "Mon 5, 3:42 PM" — the short list-row format
 *  used across Audit, Fleet, Team, and the release history/audit tables. */
export function formatEpochDateTime(seconds?: number | null, fallback = ''): string {
  if (!seconds) return fallback
  return new Date(seconds * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** A unix-seconds timestamp as a date only (no time) — used where the time of
 *  day isn't meaningful, e.g. an installer/skill-pack version's upload date. */
export function formatEpochDateOnly(seconds?: number | null, fallback = 'Unknown'): string {
  if (!seconds) return fallback
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** A unix-seconds timestamp via the locale's full default format (date, time,
 *  and seconds) — used for release/audit event timestamps where precision
 *  matters more than a compact display. */
export function formatEpochTimestamp(seconds?: number | null, fallback = ''): string {
  if (!seconds) return fallback
  return new Date(seconds * 1000).toLocaleString()
}

/** An ISO datetime string as "Mon 5, 3:42 PM", or `fallback` if absent/invalid. */
export function formatIsoDateTime(value?: string | null, fallback = 'Never'): string {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Currency-formatted amount; falls back to a plain "amount currency" string
 *  for a currency code `Intl.NumberFormat` doesn't recognize — an admin can
 *  type any string into a ROI assumption, so an unknown code must not throw. */
export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${new Intl.NumberFormat().format(amount || 0)} ${currency}`
  }
}

/** A count, or "Unlimited" for a null/undefined limit (the backend's real
 *  sentinel for "no cap" — see entitlements.py's `_limits_from_billing`). */
export function formatCount(value?: number | null): string {
  if (value == null) return 'Unlimited'
  return new Intl.NumberFormat().format(value)
}

/** snake_case or lowercase → Title Case, e.g. "basic_member" → "Basic Member". */
export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
