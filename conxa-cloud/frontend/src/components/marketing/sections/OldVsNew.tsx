import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

const FAILED_PATHS = [
  {
    name: 'Traditional automation',
    chain: ['Remembers exact clicks', 'The screen changes', 'Everything breaks', 'Someone fixes it. Again.'],
  },
  {
    name: 'APIs & integrations',
    chain: ['The vendor has to build them', 'Most tools never get one', 'Months of engineering each', 'The long tail stays manual'],
  },
  {
    name: 'Raw AI agents',
    chain: ['Re-figure out every screen', 'Slow, and costly per run', 'A different result every time', 'Fine for demos. Not for work.'],
  },
]

const CONXA_CHAIN = ['Learns the workflow from a person', 'Understands what each step means', 'Keeps working when screens change']

function Chain({ steps, muted }: { steps: string[]; muted: boolean }) {
  return (
    <ul className="flex flex-col">
      {steps.map((step, i) => (
        <li key={step} className="flex flex-col">
          <span className={`text-sm leading-relaxed ${muted ? 'text-[#9ba3af]' : 'text-[#f4f5f7]'}`}>{step}</span>
          {i < steps.length - 1 && (
            <svg className={`my-2 h-4 w-3 ${muted ? 'text-[#6b7280]/50' : 'text-[#22d3ee]'}`} viewBox="0 0 12 16" fill="none" aria-hidden>
              <path d="M6 1v11M2.5 9.5L6 13.5l3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </li>
      ))}
    </ul>
  )
}

export function OldVsNew() {
  return (
    <section id="old-vs-new" className="relative bg-[#0b0f14] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="Automation you don't have to babysit."
          sub="Every existing way of connecting AI to software fails the same test: what happens six months in?"
        />

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {FAILED_PATHS.map((path, i) => (
            <Reveal key={path.name} delay={i * 0.1}>
              <div className="flex h-full flex-col rounded-2xl border border-white/6 bg-[#0f1620] p-7">
                <h3 className="mb-6 text-base font-semibold text-white">{path.name}</h3>
                <Chain steps={path.chain} muted />
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-6">
          <div className="rounded-2xl border border-[rgba(34,211,238,0.25)] bg-[#0f1620] p-8 sm:p-10">
            <h3 className="mb-8 text-base font-semibold text-[#f4f5f7]">Conxa</h3>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-0">
              {CONXA_CHAIN.map((step, i) => (
                <div key={step} className="flex items-center sm:flex-1">
                  <span className="text-sm leading-relaxed text-[#f4f5f7] sm:pr-4">{step}</span>
                  {i < CONXA_CHAIN.length - 1 && (
                    <svg className="mx-2 hidden h-3 w-8 shrink-0 text-[#22d3ee] sm:block" viewBox="0 0 32 12" fill="none" aria-hidden>
                      <path d="M1 6h27M24 2.5L28 6l-4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm leading-relaxed text-[#9ba3af]">
              One demonstration replaces the script that breaks, the API that never ships, and the agent that guesses.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
