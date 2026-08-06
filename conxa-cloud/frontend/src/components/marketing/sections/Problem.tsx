import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'
import { PathVsGuesswork } from '../diagrams/PathVsGuesswork'

const HUMAN_POINTS = [
  'Reads the screen and knows what every button means',
  'Knows the next step without thinking about it',
  'Recovers instantly when something looks different',
]

const AI_POINTS = [
  'Sees the screen for the first time, every time',
  'Guesses its way through menus and forms',
  'One layout change and the whole task falls apart',
]

export function Problem() {
  return (
    <section id="problem" className="relative bg-[#06080b] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="Software was built for people. Not for AI."
          sub="Your team knows Salesforce, SAP, and AWS by heart. An AI agent opening those screens cold — on every single run — gets lost, makes mistakes, and costs more than the work is worth."
        />

        <Reveal className="mt-16">
          <PathVsGuesswork />
        </Reveal>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Reveal direction="left">
            <div className="flex h-full flex-col rounded-2xl border border-white/6 bg-[#0b0f14] p-8">
              <h3 className="mb-6 text-lg font-semibold text-white">Your team, on your software</h3>
              <ul className="flex flex-col gap-4">
                {HUMAN_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm leading-relaxed text-[#9ba3af]">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#5eead4]" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal direction="right" delay={0.1}>
            <div className="flex h-full flex-col rounded-2xl border border-white/6 bg-[#0b0f14] p-8">
              <h3 className="mb-6 text-lg font-semibold text-white">An AI agent, starting from scratch</h3>
              <ul className="flex flex-col gap-4">
                {AI_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm leading-relaxed text-[#9ba3af]">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#6b7280]" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15} className="mt-12 text-center">
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-[#9ba3af] sm:text-lg">
            The fix isn&apos;t smarter guessing. It&apos;s giving AI what your team already has:{' '}
            <span className="text-[#f4f5f7]">knowing the way.</span>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
