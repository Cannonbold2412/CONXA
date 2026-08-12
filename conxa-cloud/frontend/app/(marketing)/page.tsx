import type { Metadata } from 'next'
import { Hero } from '@/components/marketing/hero/Hero'
import { DemoStory } from '@/components/marketing/sections/DemoStory'
import { TheGap } from '@/components/marketing/sections/TheGap'
import { HowItWorks } from '@/components/marketing/sections/HowItWorks'
import { Examples } from '@/components/marketing/sections/Examples'
import { Reliability } from '@/components/marketing/sections/Reliability'
import { Comparison } from '@/components/marketing/sections/Comparison'
import { Trust } from '@/components/marketing/sections/Trust'
import { PricingTable } from '@/components/marketing/sections/PricingTable'
import { Faq } from '@/components/marketing/sections/Faq'
import { FinalCta } from '@/components/marketing/sections/FinalCta'
import { createPublicPageMetadata } from '@/lib/siteMetadata'

export const metadata: Metadata = createPublicPageMetadata({
  title: 'CONXA',
  description:
    'Do the process once. Conxa turns a cross-system business process into a self-healing skill your AI agents run reliably — locally, on software nobody has to modify. Start free, run it across your team, then ship it to your own customers.',
  path: '/',
})

export default function MarketingPage() {
  return (
    <>
      <Hero />
      <DemoStory />
      <TheGap />
      <HowItWorks />
      <Examples />
      <Reliability />
      <Comparison />
      <Trust />
      <PricingTable compact />
      <Faq />
      <FinalCta />
    </>
  )
}
