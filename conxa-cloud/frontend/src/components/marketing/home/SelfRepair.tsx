import { WRAP } from './ui'

const PANE = 'relative h-[260px] overflow-hidden rounded-2xl bg-[#06080b] sm:h-[340px]'
const BAR = 'h-3 rounded-md bg-white/10'
const BTN = 'absolute rounded-lg border-2 border-cyan-400 px-5 py-3 text-base font-semibold text-[#f4f5f7]'

const LADDER = [
  { t: 'Role and name', d: 'Looked for “Submit”. Not there.', hit: false },
  { t: 'Visible label', d: 'The text changed. Missed.', hit: false },
  { t: 'Position and shape', d: 'Same spot in the form. Found. The run goes on.', hit: true },
]

export function SelfRepair() {
  return (
    <section className="bg-[#22d3ee] py-24 text-[#06080b] sm:py-28">
      <div className={`${WRAP} flex flex-col gap-12`}>
        <h2 className="max-w-4xl text-[clamp(2.5rem,6.5vw,5.5rem)] font-semibold leading-none tracking-[-0.04em] text-balance">
          The screen changed. The run didn’t stop.
        </h2>
        <p className="max-w-[640px] text-lg leading-relaxed">
          A skill finds each button by more than one clue. When the first clue fails, it tries the next. Self-repair
          costs no AI usage. The AI is only called when everything else has failed.
        </p>

        <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          <div className={PANE}>
            <div className="border-b border-white/10 px-5 py-3.5 text-sm text-[#9ba3af]">Last Friday</div>
            <div className={`${BAR} absolute top-16 left-6 w-3/5`} />
            <div className={`${BAR} absolute top-[92px] left-6 w-2/5`} />
            <span className={`${BTN} top-14 right-7`}>Submit</span>
          </div>
          <svg viewBox="0 0 60 24" className="mx-auto h-6 w-[60px] rotate-90 md:rotate-0" aria-hidden="true">
            <path
              d="M4 12 H52 M42 4 L54 12 L42 20"
              fill="none"
              stroke="#06080b"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className={PANE}>
            <div className="border-b border-white/10 px-5 py-3.5 text-sm text-[#9ba3af]">After the redesign</div>
            <div className={`${BAR} absolute top-16 left-6 w-3/5`} />
            <div className={`${BAR} absolute top-[92px] left-6 w-2/5`} />
            <div className={`${BAR} absolute top-[120px] left-6 w-3/4`} />
            <span className={`${BTN} bottom-10 left-6`}>Send</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {LADDER.map((l) => (
            <div
              key={l.t}
              className={`rounded-2xl p-6 ${l.hit ? 'bg-[#06080b] text-[#f4f5f7]' : 'border-2 border-[#06080b]/60'}`}
            >
              <div className="text-xl font-semibold">{l.t}</div>
              <div className={`mt-1.5 text-base ${l.hit ? 'text-[#c9ced6]' : ''}`}>{l.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
