import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

function MaintenanceChart() {
  return (
    <svg viewBox="0 0 200 80" className="w-full" aria-hidden>
      <path d="M8 20 C 60 22, 90 45, 192 62" fill="none" stroke="#5eead4" strokeWidth="1.5" strokeLinecap="round" />
      <text x="8" y="12" fill="#6b7280" fontSize="8">maintenance effort</text>
      <text x="150" y="76" fill="#6b7280" fontSize="8">time →</text>
    </svg>
  )
}

function LockMark() {
  return (
    <svg viewBox="0 0 200 80" className="w-full" aria-hidden>
      <rect x="84" y="34" width="32" height="26" rx="6" fill="none" stroke="#5eead4" strokeWidth="1.5" />
      <path d="M90 34v-7a10 10 0 0 1 20 0v7" fill="none" stroke="#5eead4" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="100" cy="47" r="2.5" fill="#5eead4" />
      <text x="100" y="74" textAnchor="middle" fill="#6b7280" fontSize="8">stays on your machines</text>
    </svg>
  )
}

function CostChart() {
  return (
    <svg viewBox="0 0 200 80" className="w-full" aria-hidden>
      <path d="M8 62 C 60 55, 120 35, 192 12" fill="none" stroke="#6b7280" strokeWidth="1.2" strokeDasharray="3 4" strokeLinecap="round" />
      <path d="M8 58 L 192 58" fill="none" stroke="#5eead4" strokeWidth="1.5" strokeLinecap="round" />
      <text x="120" y="20" fill="#6b7280" fontSize="8">per-run agents</text>
      <text x="140" y="52" fill="#5eead4" fontSize="8">Conxa</text>
      <text x="8" y="76" fill="#6b7280" fontSize="8">usage →</text>
    </svg>
  )
}

const OUTCOMES = [
  {
    title: 'Self-healing',
    chain: 'Screens change → skills adapt → fewer breakages to chase.',
    body: 'Most screen changes are handled on the spot, with zero AI cost. Your team stops babysitting automation.',
    chart: <MaintenanceChart />,
  },
  {
    title: 'Local execution',
    chain: 'Runs on your machines → logins never leave → shorter security review.',
    body: 'Nothing sensitive is sent to us. The conversation with your security team gets a lot easier.',
    chart: <LockMark />,
  },
  {
    title: 'Unlimited runs',
    chain: 'Pay to build → run for free → costs stay flat as usage grows.',
    body: "Executions aren't metered. The workflow that runs 10,000 times costs the same as the one that runs once.",
    chart: <CostChart />,
  },
]

export function Outcomes() {
  return (
    <section id="outcomes" className="relative bg-[#0b0f14] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="Less maintenance. Lower cost. More trust."
          sub="Every capability answers the only question that matters: what does it do for the business?"
        />

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {OUTCOMES.map((o, i) => (
            <Reveal key={o.title} delay={i * 0.1}>
              <div className="flex h-full flex-col rounded-2xl border border-white/6 bg-[#0f1620] p-7">
                <div className="mb-6 rounded-xl bg-[#0b0f14] p-4">{o.chart}</div>
                <h3 className="text-base font-semibold text-white">{o.title}</h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[#5eead4]">{o.chain}</p>
                <p className="mt-3 text-sm leading-relaxed text-[#9ba3af]">{o.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

      </div>
    </section>
  )
}
