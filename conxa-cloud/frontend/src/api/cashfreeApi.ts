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

export function listPlans(): Promise<{ plans: Plan[] }> {
  return apiFetch('/subscriptions/plans').then((r) => json<{ plans: Plan[] }>(r))
}

export function createCashfreeSubscription(
  tier: 'starter' | 'pro',
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
