import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'
import { ShotFrame } from '../primitives/ShotFrame'

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

export function Security() {
  return (
    <section id="security" className="relative bg-[#06080b] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="Private by architecture."
          sub="Not a policy promise — a consequence of where the software runs."
        />

        <div className="mt-16 flex flex-col gap-px overflow-hidden rounded-2xl border border-white/6 bg-white/6">
          {FACTS.map((f, i) => (
            <Reveal key={f.fact} delay={i * 0.06} direction="none">
              <div className="grid gap-2 bg-[#0b0f14] px-7 py-6 md:grid-cols-[1fr_1.4fr] md:gap-10">
                <p className="text-sm font-semibold text-[#f4f5f7]">{f.fact}</p>
                <p className="text-sm leading-relaxed text-[#9ba3af]">{f.means}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-10">
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
