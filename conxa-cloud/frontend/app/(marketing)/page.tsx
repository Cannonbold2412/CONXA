import type { Metadata } from 'next'
import { Hero } from '@/components/marketing/hero/Hero'
import { Problem } from '@/components/marketing/sections/Problem'
import { OldVsNew } from '@/components/marketing/sections/OldVsNew'
import { HowItWorks } from '@/components/marketing/sections/HowItWorks'
import { Examples } from '@/components/marketing/sections/Examples'
import { WhyAiNeedsIt } from '@/components/marketing/sections/WhyAiNeedsIt'
import { Outcomes } from '@/components/marketing/sections/Outcomes'
import { DemoStory } from '@/components/marketing/sections/DemoStory'
import { Architecture } from '@/components/marketing/sections/Architecture'
import { Security } from '@/components/marketing/sections/Security'
import { Faq } from '@/components/marketing/sections/Faq'
import { FinalCta } from '@/components/marketing/sections/FinalCta'
import { createPublicPageMetadata } from '@/lib/siteMetadata'

export const metadata: Metadata = createPublicPageMetadata({
  title: 'CONXA',
  description:
    'Show AI how to use your software once. Conxa turns one demonstration into a reliable, self-healing skill your AI can run — locally, on any web app, no API needed.',
  path: '/',
})

export default function MarketingPage() {
  return (
    <>
      <Hero />
      <Problem />
      <OldVsNew />
      <HowItWorks />
      <Examples />
      <WhyAiNeedsIt />
      <Outcomes />
      <DemoStory />
      <Architecture />
      <Security />
      <Faq />
      <FinalCta />
    </>
  )
}
