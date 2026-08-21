import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

/**
 * Mirrors docs/PRD.md §10. Two rules when editing this:
 *
 * 1. The "wins" line is not a courtesy — a page that claims to beat everyone at everything is
 *    read as marketing and discounted wholesale. Conceding where each alternative is genuinely
 *    better is what makes the rest of the row credible to a technical buyer.
 * 2. `Partly` / `n/a` / prose are real answers. Forcing every cell into a tick or a cross would
 *    overstate the claim, and a buyer tests overstated claims in the room.
 *
 * "AI agents driving the browser live" collapses the PRD's separate rows for live-UI agents and
 * browser assistants: the distinction matters in a sales conversation, not on a homepage.
 */
const CAPABILITIES = [
  'No code needed',
  "Works without the vendor's help",
  'Same result every run',
  'Heals itself when screens change',
  'Ships to your customers',
  'Cost per run',
] as const

type Cell = 'yes' | 'no' | string

const ROWS: { name: string; wins: string | null; cells: Cell[]; us?: boolean }[] = [
  {
    name: 'Conxa',
    wins: null,
    us: true,
    cells: ['yes', 'yes', 'yes', 'yes', 'yes', 'Nothing — it runs locally'],
  },
  {
    name: 'Traditional RPA',
    wins: 'Desktop and mainframe apps, and two decades of procurement trust.',
    cells: ['Partly', 'yes', 'yes', 'no', 'no', 'Licence per bot'],
  },
  {
    name: 'Browser scripts',
    wins: 'Total control, nothing to buy — if you have the engineers.',
    cells: ['no', 'yes', 'yes', 'no', 'no', 'Nothing to run'],
  },
  {
    name: 'Zapier, Workato, Make',
    wins: 'Anything API-shaped, plus scheduling and event handling.',
    cells: ['yes', 'no — needs an API', 'yes', 'n/a', 'Partly', 'Per task'],
  },
  {
    name: 'Building the API yourself',
    wins: 'For one system you own, an API is often the better answer.',
    cells: ['no', 'no', 'yes', 'yes', 'yes', 'Build, then maintain'],
  },
  {
    name: 'AI agents driving the browser live',
    wins: 'Anything nobody has recorded yet — they decide what, skills decide how.',
    cells: ['yes', 'yes', 'no', 'Adaptive, not reliable', 'no', 'Tokens, every run'],
  },
]

function Mark({ value }: { value: Cell }) {
  if (value === 'yes') {
    return (
      <>
        <svg className="h-4 w-4 text-cyan-400" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">Yes</span>
      </>
    )
  }
  if (value === 'no') {
    return (
      <>
        <svg className="h-4 w-4 text-[#6b7280]" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 8h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="sr-only">No</span>
      </>
    )
  }
  return <span className="text-xs leading-relaxed text-[#9ba3af]">{value}</span>
}

export function Comparison() {
  return (
    <section id="comparison" className="relative bg-[#0b0f14] px-6 pb-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="What you would use instead, and where each one stops."
          sub="Conxa sits at an intersection nobody else occupies: no code, no cooperation needed from the software vendor, the same path every run, self-healing, and shippable to other people's machines. Every alternative gives up at least two of those — and each one genuinely beats us somewhere, so we've said where."
        />

        {/* Below `lg` the table is wider than the viewport, and a scroll box with no visible
            cut-off edge reads as a finished table with five columns rather than seven. */}
        <p className="mt-14 mb-3 text-xs text-[#6b7280] lg:hidden">Scroll the table sideways to see every column →</p>

        <Reveal className="mt-14 max-lg:mt-0">
          {/* Scrolls inside its own box: six capability columns cannot fit a phone, and the
              page body must never scroll sideways. `relative` is load-bearing — the sr-only
              cells are position:absolute, and without a positioned scroll container their
              containing block becomes the relative <section>, so they escape the scroller at
              their static position (up to the table's full 864px) and widen the whole page. */}
          <div className="relative overflow-x-auto rounded-2xl border border-white/6">
            <table className="w-full min-w-[54rem] border-collapse text-left">
              <caption className="sr-only">
                How Conxa compares with traditional RPA, browser scripts, integration platforms, building an API, and
                AI agents driving the browser live
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 w-[12rem] bg-[#0f1620] px-4 py-4 text-sm font-semibold text-[#f4f5f7] sm:w-[17rem] sm:px-6"
                  >
                    Approach
                  </th>
                  {CAPABILITIES.map((cap) => (
                    <th
                      key={cap}
                      scope="col"
                      className="bg-[#0f1620] px-5 py-4 text-xs font-medium leading-relaxed text-[#9ba3af]"
                    >
                      {cap}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.name} className="border-t border-white/6">
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 w-[12rem] px-4 py-5 align-top font-normal sm:w-[17rem] sm:px-6 ${
                        row.us ? 'bg-[#0d1420]' : 'bg-[#0b0f14]'
                      }`}
                    >
                      <span className={`text-sm font-semibold ${row.us ? 'text-[#22d3ee]' : 'text-[#f4f5f7]'}`}>
                        {row.name}
                      </span>
                      {row.wins && (
                        <span className="mt-1.5 block text-xs leading-relaxed text-[#6b7280]">
                          Beats us at: {row.wins}
                        </span>
                      )}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td
                        key={CAPABILITIES[i]}
                        className={`px-5 py-5 align-top ${row.us ? 'bg-[rgba(34,211,238,0.04)]' : ''}`}
                      >
                        <Mark value={cell} />
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
