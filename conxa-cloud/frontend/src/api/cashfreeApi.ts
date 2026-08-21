import { apiFetch, json } from '@/lib/apiBase'

export type Plan = {
  tier: string
  name: string
  amount: number
  currency: string
  period?: string | null
  features: string[]
}

export type CreateSubscriptionResponse = {
  subscription_id: string
  auth_link: string
  plan_id: string
  amount: number
  currency: string
  tier: string
}

export type VerifySubscriptionResponse = {
  success: boolean
}

export type CheckoutTier = 'starter' | 'pro' | 'credits_addon_20' | 'credits_addon_50' | 'credits_addon_100' | 'credits_addon_250'

export type AddonOffer = {
  tier: string
  name: string
  amount: number
  currency: string
  period?: string | null
  features: string[]
  compile_credits: number
  human_edit_tokens: number
}

export function listPlans(): Promise<{ plans: Plan[] }> {
  return apiFetch('/subscriptions/plans').then((r) => json<{ plans: Plan[] }>(r))
}

export function listAddons(): Promise<{ addons: AddonOffer[] }> {
  return apiFetch('/subscriptions/addons').then((r) => json<{ addons: AddonOffer[] }>(r))
}

export function createCashfreeSubscription(
  tier: CheckoutTier,
  customer_email?: string,
  customer_phone?: string,
): Promise<CreateSubscriptionResponse> {
  return apiFetch('/subscriptions/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, customer_email, customer_phone }),
  }).then((r) => json<CreateSubscriptionResponse>(r))
}

export function verifyCashfreeSubscription(
  subscription_id: string,
): Promise<VerifySubscriptionResponse> {
  return apiFetch('/subscriptions/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription_id }),
  }).then((r) => json<VerifySubscriptionResponse>(r))
}
