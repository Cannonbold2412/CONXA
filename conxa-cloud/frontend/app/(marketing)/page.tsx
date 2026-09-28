import type { Metadata } from 'next'
import { DemoStory } from '@/components/marketing/sections/DemoStory'
import { HomeHero } from '@/components/marketing/home/HomeHero'
import { Problem } from '@/components/marketing/home/Problem'
import { Steps } from '@/components/marketing/home/Steps'
import { SelfRepair } from '@/components/marketing/home/SelfRepair'
import { Processes } from '@/components/marketing/home/Processes'
import { LocalFirst } from '@/components/marketing/home/LocalFirst'
import { HomePricing } from '@/components/marketing/home/HomePricing'
import { HomeFaq } from '@/components/marketing/home/HomeFaq'
import { HomeCta } from '@/components/marketing/home/HomeCta'
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
      <HomeHero />
      <DemoStory />
      <Problem />
      <Steps />
      <SelfRepair />
      <Processes />
      <LocalFirst />
      <HomePricing />
      <HomeFaq />
      <HomeCta />
    </>
  )
}
