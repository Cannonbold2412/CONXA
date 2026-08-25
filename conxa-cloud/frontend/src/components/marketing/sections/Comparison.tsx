import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

/**
 * Business-value reframing of docs/PRD.md §10's comparison. Two rules when editing this:
 *
 * 1. The "wins" line is not a courtesy — a page that claims to beat everyone at everything is
 *    read as marketing and discounted wholesale. Conceding where each alternative is genuinely
 *    better is what makes the rest of the row credible to a technical buyer.
 * 2. Every cell must answer the question the way a buying committee asks it: time-to-value,
 *    who maintains it, what breaks and when, cost structure, legacy reach, distribution.
 *    Feature ticks ("no code") are replaced with outcomes ("days, not months").
 */
const QUESTIONS = [
  'How fast do we see value?',
  'Who on our team can maintain it?',
  'What happens when a screen changes?',
  'Can we trust the output?',
  'What does it really cost us?',
  'Does it work with our legacy / internal tools?',
  'Can we productise it for our own customers?',
] as const

type Cell = string

const ROWS: { name: string; wins: string | null; cells: Cell[]; us?: boolean }[] = [
  {
    name: 'Conxa',
    wins: null,
    us: true,
    cells: [
      'Days — record the process once, done',
      'Anyone who can do the process by hand',
      'It heals itself — no ticket, no downtime',
      'Identical steps, identical result, auditable every run',
      'Runs locally on machines you already pay for',
      'Yes — no API or vendor cooperation required',
      'Yes — ship as an installer under your brand',
    ],
  },
  {
    name: 'Traditional RPA',
    wins: 'Desktop and mainframe apps, and two decades of procurement trust.',
    cells: [
      'Months of vendor-led implementation',
      'Certified RPA developers',
      'Bot breaks; redev project',
      'Yes — but only while nothing changes',
      'Per-bot licences + implementation + maintenance',
      'Yes — that is its strength',
      'No',
    ],
  },
  {
    name: 'Integration platforms (Zapier, Workato, Make)',
    wins: 'Anything API-shaped, plus scheduling and event handling.',
    cells: [
      'Weeks per integration',
      'Ops team + API docs',
      'Breaks if the API changes; wait for the connector fix',
      'Yes, within API limits',
      'Per-task fees that scale with volume',
      'Only if a connector exists',
      'Not really',
    ],
  },
  {
    name: 'In-house engineering (incl. browser scripts)',
    wins: 'Total control over the one system you own — if you have the engineers.',
    cells: [
      'Quarters of dev time',
      'Dedicated engineers',
      'Breaks; goes into the backlog',
      'Yes',
      'Salaries, indefinitely',
      'Yes, if you can build one',
      "You'd have to build distribution yourself",
    ],
  },
  {
    name: 'Generic AI browser agents',
    wins: 'Anything nobody has recorded yet — they decide what, skills decide how.',
    cells: [
      'Instant first run',
      'Prompt-savvy users',
      'Tries something different each time — sometimes wrong',
      'No — non-deterministic',
      'Token bills on every single run',
      'Often yes, unreliably',
      'No',
    ],
  },
]

function Cell({ value }: { value: Cell }) {
  const lead = value.match(/^(Yes|No|Not really|Often yes)\b/)
  if (!lead) {
    return <span className="text-sm leading-relaxed text-[#9ba3af]">{value}</span>
  }
  return (
    <span className="text-sm leading-relaxed text-[#9ba3af]">
      <strong className="font-semibold text-[#f4f5f7]">{lead[1]}</strong>
      {value.slice(lead[1].length)}
    </span>
  )
}

export function Comparison() {
  return (
    <section id="comparison" className="relative bg-[#0b0f14] px-6 pb-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="What you would use instead, and where each one stops."
          sub="Conxa sits at an intersection nobody else occupies: fast to value, maintainable by your own team, self-healing, predictable, and shippable to other people's machines. Every alternative gives up at least two of those — and each one genuinely beats us somewhere, so we've said where."
        />

        {/* Below `lg` the table is wider than the viewport, and a scroll box with no visible
            cut-off edge reads as a finished table with fewer columns than it actually has. */}
        <p className="mt-14 mb-3 text-xs text-[#6b7280] lg:hidden">Scroll the table sideways to see every column →</p>

        <Reveal className="mt-14 max-lg:mt-0">
          {/* Scrolls inside its own box: six approach columns cannot fit a phone, and the
              page body must never scroll sideways. `relative` is load-bearing — without a
              positioned scroll container the sticky question column loses its containing block. */}
          <div className="relative overflow-x-auto rounded-2xl border border-white/6">
            <table className="w-full min-w-[64rem] border-collapse text-left">
              <caption className="sr-only">
                How Conxa compares on business value — time to value, maintenance, resilience, reliability, cost,
                legacy compatibility, and distribution — against traditional RPA, integration platforms, in-house
                engineering, and generic AI browser agents
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 w-[11rem] bg-[#0f1620] px-4 py-4 text-sm font-semibold text-[#f4f5f7]"
                  >
                    Question
                  </th>
                  {ROWS.map((col) => (
                    <th
                      key={col.name}
                      scope="col"
                      className={`min-w-[11rem] px-5 py-4 align-top ${col.us ? 'bg-[rgba(34,211,238,0.06)]' : 'bg-[#0f1620]'}`}
                    >
                      <span className={`block text-sm font-semibold leading-snug ${col.us ? 'text-[#22d3ee]' : 'text-[#f4f5f7]'}`}>
                        {col.name}
                      </span>
                      {col.wins && (
                        <span className="mt-1.5 block text-xs font-normal leading-relaxed text-[#6b7280]">
                          Beats us at: {col.wins}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {QUESTIONS.map((q, i) => (
                  <tr key={q} className="border-t border-white/6">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 w-[11rem] px-4 py-5 align-top bg-[#0b0f14] font-normal"
                    >
                      <span className="text-sm font-semibold leading-relaxed text-[#9ba3af]">{q}</span>
                    </th>
                    {ROWS.map((col) => (
                      <td
                        key={col.name}
                        className={`px-5 py-5 align-top ${col.us ? 'bg-[rgba(34,211,238,0.04)]' : ''}`}
                      >
                        <Cell value={col.cells[i]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mt-8">
          <p className="max-w-3xl text-sm leading-relaxed text-[#9ba3af]">
            We are not the most mature automation platform and we do not have the biggest connector catalogue. If every
            system in your process has a good API, use an integration platform — it will be cheaper and faster. The
            process worth bringing to us is the one where two of the five systems have no usable API, the internal tool
            has none at all, and the connector for your ERP covers a fifth of the job.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
