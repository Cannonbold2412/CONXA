import { Reveal } from '../primitives/Reveal'
import { GlowButton } from '../primitives/GlowButton'

export function FinalCta() {
  return (
    <section id="cta" className="relative overflow-hidden bg-[#06080b] px-6 py-32">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: 'radial-gradient(closest-side, #22d3ee, transparent)' }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-[#f4f5f7] sm:text-4xl lg:text-5xl">
            See it on your own software.
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#9ba3af] sm:text-lg">
            Record your first workflow in minutes — or walk through it with us on the tools your team uses every day.
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <GlowButton href="/sign-up">Start for free</GlowButton>
            <GlowButton href="/docs/support" variant="ghost">
              Book a demo
            </GlowButton>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
