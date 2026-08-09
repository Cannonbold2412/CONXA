import Image from 'next/image'
import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

const SCENARIOS = [
  {
    domain: 'Customer onboarding',
    tool: 'CRM → ERP → email → internal tools',
    once: 'Provisioning an account, configuring settings, triggering the welcome sequence — across four logins',
    then: 'AI runs the whole process as one skill, every system updated in step',
  },
  {
    domain: 'Claims intake',
    tool: 'Portal → policy system → finance → notification',
    once: 'Carrying a claim by hand between systems that were never built to talk to each other',
    then: 'AI moves the claim through every stage without a person relaying it',
  },
  {
    domain: 'Vendor onboarding',
    tool: 'Procurement → compliance → ERP → payments',
    once: 'The exact process a services firm gets paid to implement for its clients',
    then: 'AI runs it as a skill instead of a project, for every client whose stack looks the same',
  },
  {
    domain: 'Invoice processing',
    tool: 'Document intake → extraction → accounting → approval',
    once: 'Uploading a vendor invoice, coding it correctly, routing it for sign-off',
    then: 'AI handles the routine entry runs, the same way, every time',
  },
  {
    domain: 'HR onboarding',
    tool: 'HR platform → access/identity → payroll → compliance',
    once: 'Setting up a new hire across every system that needs to know they exist',
    then: 'AI takes each new hire through the same proven steps',
  },
]

export function Examples() {
  return (
    <section id="examples" className="relative bg-[#0b0f14] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="Business processes, not single-app tasks."
          sub="A real process crosses systems nobody fully owns. If a person can carry it between screens, Conxa can learn it — no API required, for any system in the chain."
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
