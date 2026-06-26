import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

const USE_CASES = [
  {
    tag: 'Internal Enterprise Tools',
    headline: 'Run cross-team operations inside private business systems.',
    items: [
      'ERP, finance, HR, and IT admin workflows',
      'Legacy dashboards with multi-step forms',
      'Approval queues and recurring back-office updates',
    ],
    accent: '#22d3ee',
  },
  {
    tag: 'SaaS Platforms',
    headline: 'Make product and admin consoles directly operable.',
    items: [
      'CRM, support, billing, and subscription updates',
      'Customer onboarding and account maintenance',
      'Release coordination across product dashboards',
    ],
    accent: '#5eead4',
  },
  {
    tag: 'Business Web Portals',
    headline: 'Automate partner, vendor, and customer-facing portals.',
    items: [
      'Order, claim, and ticket submission flows',
      'Vendor onboarding and document collection',
      'Status checks, data entry, and report downloads',
    ],
    accent: '#c084fc',
  },
  {
    tag: 'AI Agent Workflows',
    headline: 'Give AI agents reliable browser execution paths.',
    items: [
      'Claude-triggered actions through local MCP skills',
      'Multi-step browser tasks with recovery telemetry',
      'Human-reviewed workflows that execute repeatably',
    ],
    accent: '#f59e0b',
  },
]

export function UseCases() {
  return (
    <section className="relative bg-[#0b0f14] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Use cases"
          headline="Operational intelligence for every workflow."
          sub="From internal tools to customer-facing portals, CONXA executes anywhere a human can navigate a browser."
        />

        <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {USE_CASES.map((uc, i) => (
            <Reveal key={uc.tag} delay={i * 0.1} direction={i % 2 === 0 ? 'left' : 'right'}>
              <div className="flex h-full flex-col rounded-2xl border border-white/6 bg-[#0f1620] p-6">
                <span
                  className="mb-4 inline-flex self-start rounded-full px-3 py-1 text-xs font-medium uppercase tracking-widest"
                  style={{ color: uc.accent, background: `${uc.accent}12`, border: `1px solid ${uc.accent}22` }}
                >
                  {uc.tag}
                </span>
                <h3 className="mb-6 text-lg font-semibold text-white">{uc.headline}</h3>
                <ul className="flex flex-col gap-3">
                  {uc.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[#9ba3af]">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: uc.accent }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
