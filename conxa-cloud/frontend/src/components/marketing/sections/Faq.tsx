import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

const QA = [
  {
    q: 'Where do our logins and credentials live?',
    a: 'On your machine, encrypted in the operating system keychain. They are never sent to Conxa and never included in published skills.',
  },
  {
    q: 'Do you run our workflows in your cloud?',
    a: 'No. Execution is 100% local. Our cloud only hosts, versions, and coordinates skills — it has no way to run them.',
  },
  {
    q: 'What data does Conxa receive?',
    a: 'Compact event signals only: a step succeeded, recovered, or failed, and when. No screenshots, no page content, no personal data.',
  },
  {
    q: "What happens when the software's screen changes?",
    a: 'Each step knows its target several ways — its text, its role, its position, how it looks. Most changes are handled on the spot at zero AI cost. Harder cases get an assisted fix, and drift shows up on your dashboard so nothing breaks silently.',
  },
  {
    q: 'Do we need engineers to create a skill?',
    a: 'No. Anyone who can do the workflow can record it. You demonstrate it once in a real browser — no scripting, no setup.',
  },
  {
    q: 'What software does it work with?',
    a: 'Anything that runs in a browser: Salesforce, SAP, cloud consoles, and the internal tools that never got an API.',
  },
  {
    q: "Why not just build an API for the system we need to connect to?",
    a: "For the one system you own, that's often the right call. It's not true for the other four systems in the process that you don't control, and it's not true for the long-tail workflow that's too small to ever get its own sprint. We can put a number on it: the hours this process costs you per month against what building and maintaining five integrations would take, versus recording it once.",
  },
  {
    q: 'What if the software we need to automate blocks bots or requires MFA?',
    a: "We check before we promise. Aggressive bot protection targets datacenter traffic, not an employee's own machine on a corporate IP in a real browser — most line-of-business software has none of it. A fresh one-time code on every login is the one thing that genuinely can't be automated unattended, so we screen for MFA policy, bot protection, terms of service, and session lifetime before any workflow is qualified.",
  },
  {
    q: 'How is this different from Comet or Claude in Chrome?',
    a: "Different category, not a better version of the same one. Those assistants rediscover the interface every run — per-session, non-deterministic, token cost each time — which is right for a person doing a one-off task. Conxa compiles a workflow once and replays it deterministically, with recovery, for a process that runs unattended a thousand times.",
  },
  {
    q: 'What platforms are supported?',
    a: 'Windows today. macOS is on the roadmap.',
  },
  {
    q: 'How does pricing work?',
    a: "You pay to build and publish skills. Running them is free and unlimited — your cost doesn't grow with usage.",
  },
  {
    q: "What if Conxa's cloud goes down?",
    a: 'Your skills keep running locally. Only new skill updates wait until the cloud is back.',
  },
  {
    q: 'Do you have SOC 2 or similar certifications?',
    a: "Not yet — we're early. But our architecture keeps sensitive data on your machines, so most of it never reaches us in the first place.",
  },
]

export function Faq() {
  return (
    <section id="faq" className="relative bg-[#0b0f14] px-6 py-28">
      <div className="mx-auto max-w-3xl">
        <SectionHeader headline="Before you ask." sub="The questions every enterprise team asks ahead of a demo." />

        <div className="mt-14 flex flex-col gap-3">
          {QA.map((item, i) => (
            <Reveal key={item.q} delay={Math.min(i * 0.04, 0.2)} direction="none">
              <details
                open={i === 0}
                className="group rounded-xl border border-white/6 bg-[#0f1620] transition-colors open:border-white/12"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-sm font-medium text-[#f4f5f7] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <svg
                    className="h-4 w-4 shrink-0 text-[#6b7280] transition-transform group-open:rotate-45"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden
                  >
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </summary>
                <p className="px-6 pb-5 text-sm leading-relaxed text-[#9ba3af]">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
