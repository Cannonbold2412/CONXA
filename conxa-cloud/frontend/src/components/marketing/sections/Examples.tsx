import Image from 'next/image'
import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

const SCENARIOS = [
  {
    domain: 'Sales & CRM',
    tool: 'Salesforce and similar',
    once: 'Creating an account, logging a call, moving a deal forward',
    then: 'AI keeps the pipeline updated from a plain-language request',
  },
  {
    domain: 'Finance',
    tool: 'SAP and other ERPs',
    once: 'Entering a vendor invoice with the right codes and approvals',
    then: 'AI handles the routine entry runs, the same way, every time',
  },
  {
    domain: 'Cloud operations',
    tool: 'AWS and other consoles',
    once: 'A routine console task — provisioning, checks, cleanups',
    then: 'AI carries out the run-of-the-mill ops work on request',
  },
  {
    domain: 'HR & onboarding',
    tool: 'People platforms',
    once: 'Setting up a new hire across your HR and access tools',
    then: 'AI takes each new hire through the same proven steps',
  },
  {
    domain: 'Internal tools',
    tool: 'Legacy systems with no API',
    once: 'The workflow only two people in the company know',
    then: "AI operates software that was never going to get an integration",
  },
]

export function Examples() {
  return (
    <section id="examples" className="relative bg-[#0b0f14] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="Works with the tools you already run."
          sub="If a person can do it in a browser, Conxa can learn it. No API required — not even for the twenty-year-old internal system."
        />

        <Reveal className="mt-14">
          <div className="overflow-hidden rounded-2xl border border-white/6 bg-[#06080b]">
            <Image
              src="/marketing/examples-stack.png"
              alt="Several different business systems, each connected by a thin line to one glowing point beneath them"
              width={1570}
              height={1015}
              sizes="(max-width: 1280px) 100vw, 1152px"
              className="w-full"
            />
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s, i) => (
            <Reveal key={s.domain} delay={(i % 3) * 0.08}>
              <div className="flex h-full flex-col rounded-2xl border border-white/6 bg-[#0f1620] p-7">
                <h3 className="text-base font-semibold text-white">{s.domain}</h3>
                <p className="mt-1 text-xs text-[#9ba3af]">{s.tool}</p>
                <div className="mt-6 flex flex-col gap-5">
                  <div>
                    <p className="text-xs font-medium text-[#22d3ee]">Show it once</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#9ba3af]">{s.once}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#5eead4]">AI handles it from then on</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#9ba3af]">{s.then}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal delay={0.16}>
            <div className="flex h-full flex-col items-start justify-center rounded-2xl border border-dashed border-white/10 bg-transparent p-7">
              <h3 className="text-base font-semibold text-[#f4f5f7]">Your workflow here</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#9ba3af]">
                If your team does it every week in a browser, it&apos;s a candidate. Record it once and see.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
