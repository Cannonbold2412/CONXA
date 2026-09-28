import { GlowButton } from '../primitives/GlowButton'
import { LEAD, WRAP } from './ui'

export function HomeCta() {
  return (
    <section className="border-t border-white/10 bg-[#06080b] py-24">
      <div className={`${WRAP} flex flex-col gap-8`}>
        <h2 className="max-w-4xl text-[clamp(2.5rem,6.5vw,5.5rem)] font-semibold leading-none tracking-[-0.04em]">
          Bring one process.
          <br />
          <span className="text-cyan-400">See it run.</span>
        </h2>
        <p className={`${LEAD} max-w-xl`}>
          Bring one process your team repeats. We will teach it to your AI agent with you.
        </p>
        <div className="flex flex-wrap gap-3">
          <GlowButton href="#demo">Book a demo</GlowButton>
          <GlowButton href="/docs" variant="ghost">
            Read the docs
          </GlowButton>
        </div>
      </div>
    </section>
  )
}
