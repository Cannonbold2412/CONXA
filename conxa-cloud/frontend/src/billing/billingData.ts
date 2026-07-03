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
  const currency = (plan.currency || 'INR').toUpperCase()
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

export function formatCompactNumber(value?: number | null) {
  if (value == null) return 'Unlimited'
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatMeterValue(value?: number | null, key?: EntitlementMeterKey) {
  if (value == null) return 'Unlimited'
  if (key === 'human_edit_tokens') return formatCompactNumber(value)
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
