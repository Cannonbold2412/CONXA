import type { Metadata } from 'next'
import { PricingTable } from '@/components/marketing/sections/PricingTable'
import { Faq } from '@/components/marketing/sections/Faq'
import { FinalCta } from '@/components/marketing/sections/FinalCta'
import { createPublicPageMetadata } from '@/lib/siteMetadata'

export const metadata: Metadata = createPublicPageMetadata({
  title: 'Pricing | CONXA',
  description:
    'Pay for reach, not for runs. Unlimited installs and executions on every tier — you pay for how much of your product you compile and publish.',
  path: '/pricing',
})

export default function PricingPage() {
  return (
    <>
      <PricingTable />
      <Faq />
      <FinalCta />
    </>
  )
}
