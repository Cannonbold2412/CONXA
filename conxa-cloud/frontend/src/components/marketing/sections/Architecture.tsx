import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

const PLANES = [
  {
    name: 'Build Studio',
    where: 'On your machine',
    does: 'Record workflows and compile them into skills — entirely locally.',
    accent: true,
  },
  {
    name: 'Conxa Cloud',
    where: 'Coordination only',
    does: 'Hosts and versions skills, signs updates, collects audit and health signals. It never runs your workflows.',
    accent: false,
  },
  {
    name: 'Customer machines',
    where: 'Where work happens',
    does: 'Claude and other AI agents run the installed skills locally, inside the browser, next to your data.',
    accent: true,
  },
]

const FLOWS = [
  { label: 'Skills flow down', detail: 'versioned, cryptographically signed' },
  { label: 'Event signals flow up', detail: 'succeeded / recovered / failed — nothing more' },
  { label: 'Credentials flow nowhere', detail: 'they never leave the machine they live on' },
]

export function Architecture() {
  return (
    <section id="architecture" className="relative bg-[#0b0f14] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="Everything important runs on your machines."
          sub="The cloud coordinates. It never sees your logins, your data, or your running workflows."
        />

        <div className="mt-16 grid gap-4 lg:grid-cols-3">
          {PLANES.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.1}>
              <div
                className={`flex h-full flex-col rounded-2xl border p-7 ${
                  p.accent ? 'border-[rgba(34,211,238,0.25)] bg-[#0f1620]' : 'border-white/6 bg-[#0b0f14]'
                }`}
              >
                <p className={`text-xs font-medium ${p.accent ? 'text-[#22d3ee]' : 'text-[#6b7280]'}`}>{p.where}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{p.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9ba3af]">{p.does}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {FLOWS.map((f, i) => (
            <Reveal key={f.label} delay={0.2 + i * 0.08}>
              <div className="rounded-xl border border-white/6 bg-transparent px-5 py-4">
                <p className="text-sm font-medium text-[#f4f5f7]">{f.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#9ba3af]">{f.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.3} className="mt-10">
          <p className="mx-auto max-w-2xl text-center text-base leading-relaxed text-[#9ba3af]">
            If our cloud went down tomorrow, your skills would keep running.{' '}
            <span className="text-[#f4f5f7]">That&apos;s what local-first means.</span>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
