import type { EntitlementMeter, EntitlementMeterKey } from '@/api/productApi'
import type { Plan } from '@/api/cashfreeApi'

export function normalizePlan(plan?: string | null) {
  const tier = (plan || 'free').toLowerCase()
  return tier === 'basic' ? 'starter' : tier
}

export function displayPlanName(plan?: string | null) {
  const normalized = normalizePlan(plan)
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function formatPrice(plan: Plan) {
  if (normalizePlan(plan.tier) === 'enterprise') return 'Custom'
  if (!plan.amount) return 'Free'
  if (!plan.currency) {
    // No currency default here — silently assuming INR would show the wrong
    // symbol on a real amount rather than admitting we don't know the unit.
    return plan.amount.toLocaleString()
  }
  const currency = plan.currency.toUpperCase()
  const symbol = currency === 'INR' ? '₹' : `${currency} `
  return `${symbol}${plan.amount.toLocaleString()}`
}

export function formatPeriod(plan: Plan) {
  if (normalizePlan(plan.tier) === 'enterprise') return 'contract'
  if (!plan.amount) return 'forever'
  return plan.period || 'month'
}

export function formatDate(value?: string | null) {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not scheduled'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatUnixDate(value?: number | null) {
  if (!value) return 'Not scheduled'
  return formatDate(new Date(value * 1000).toISOString())
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

/** `null` is the backend's real sentinel for "no limit" (see entitlements.py's
 *  `_limits_from_billing`) — genuinely means unlimited for a `limit`/`remaining`
 *  value. `undefined` means something different: the meter itself hasn't loaded
 *  or doesn't exist, which is never true for `limit`/`remaining` (the API always
 *  sends a number or an explicit null there) but was happening for `used` via a
 *  `meter?.used ?? 0` at the call site — collapsing "we don't know" into "0
 *  used" and, before this, into "Unlimited" too. Keep the two apart. */
export function formatMeterValue(value?: number | null, key?: EntitlementMeterKey) {
  if (value === null) return 'Unlimited'
  if (value === undefined) return '—'
  if (key === 'human_edit_tokens' || key === 'ai_usage_credits') return formatCompactNumber(value)
  return value.toLocaleString()
}

export function meterPercent(meter?: EntitlementMeter) {
  if (!meter || meter.unlimited || !meter.limit) return 0
  return Math.min(100, Math.round((meter.used / meter.limit) * 100))
}

export function meterTone(meter?: EntitlementMeter) {
  if (!meter || meter.unlimited || !meter.limit) return 'neutral'
  const percent = meterPercent(meter)
  if (percent >= 100) return 'danger'
  if (percent >= 80) return 'warning'
  return 'healthy'
}
