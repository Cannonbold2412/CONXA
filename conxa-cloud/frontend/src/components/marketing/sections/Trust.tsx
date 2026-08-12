import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'
import { ShotFrame } from '../primitives/ShotFrame'

const PLANES = [
  {
    name: 'Build Studio',
    where: 'On your machine',
    does: 'Records processes and compiles them into skills — entirely locally.',
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
    where: 'Where the work happens',
    does: 'Claude and other AI agents run the installed skills locally, in the browser, next to your data.',
    accent: true,
  },
]

const FLOWS = [
  { label: 'Skills flow down', detail: 'versioned, cryptographically signed' },
  { label: 'Event signals flow up', detail: 'succeeded / recovered / failed — nothing more' },
  { label: 'Credentials flow nowhere', detail: 'they never leave the machine they live on' },
]

const FACTS = [
  {
    fact: 'Logins stay in your OS keychain, encrypted',
    means: 'Browser sessions are encrypted with AES-256-GCM on the machine they belong to. We never receive them.',
  },
  {
    fact: 'Published skills contain no credentials',
    means: 'Packaging strips anything sensitive by design. A skill is instructions, never secrets.',
  },
  {
    fact: 'Every update is cryptographically signed',
    means: 'Skill updates are Ed25519-signed and hash-verified before a single byte is trusted.',
  },
  {
    fact: 'Only admins publish, and everything is logged',
    means: 'Publishing is role-gated, and every change records who did what, when, and from where.',
  },
  {
    fact: 'We receive event signals, not your data',
    means: 'Telemetry is compact status codes — succeeded, recovered, failed. No screenshots, no page content, no personal data.',
  },
]

export function Trust() {
  return (
    <section id="security" className="relative bg-[#06080b] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="The answer your security team asks for first."
          sub="Credentials, screen contents and business records stay on the machine they started on. The cloud hosts, versions and bills — it does not execute. That isn't a policy promise; it's a consequence of where the software runs."
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

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {FLOWS.map((f, i) => (
            <Reveal key={f.label} delay={0.2 + i * 0.08}>
              <div className="rounded-xl border border-white/6 px-5 py-4">
                <p className="text-sm font-medium text-[#f4f5f7]">{f.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#9ba3af]">{f.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15} className="mt-10">
          <p className="mx-auto max-w-2xl text-center text-base leading-relaxed text-[#9ba3af]">
            If our cloud went down tomorrow, your skills would keep running.{' '}
            <span className="text-[#f4f5f7]">That&apos;s what local-first means.</span>
          </p>
        </Reveal>

        <div className="mt-20 flex flex-col gap-px overflow-hidden rounded-2xl border border-white/6 bg-white/6">
          {FACTS.map((f, i) => (
            <Reveal key={f.fact} delay={i * 0.06} direction="none">
              <div className="grid gap-2 bg-[#0b0f14] px-7 py-6 md:grid-cols-[1fr_1.4fr] md:gap-10">
                <p className="text-sm font-semibold text-[#f4f5f7]">{f.fact}</p>
                <p className="text-sm leading-relaxed text-[#9ba3af]">{f.means}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-6">
          <ShotFrame
            src="/marketing/screenshots/shot_audit.png"
            alt="The audit log: every publish and administrative action with who did it, what changed, and when"
            label="Every change, on the record"
          />
        </Reveal>
      </div>
    </section>
  )
}
