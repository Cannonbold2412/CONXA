import { H2, WRAP } from './ui'

const ROWS = [
  { word: 'Scripts', log: 'ERR selector not found\n#btn-submit', why: 'Break the first time a page changes.' },
  { word: 'Integrations', log: '404 no API for this app', why: 'Wait on a vendor who never ships them.' },
  { word: 'Guessing agents', log: 'run 41: clicked “Delete”\ninstead of “Save”', why: 'Improvise every run, so every run is a risk.' },
]

export function Problem() {
  return (
    <section className="bg-[#f4f5f7] py-24 text-[#06080b] sm:py-28">
      <div className={WRAP}>
        <h2 className={`${H2} max-w-3xl`}>The work that crosses five systems is the work nobody automated.</h2>

        <div className="mt-12">
          {ROWS.map((r) => (
            <div
              key={r.word}
              className="grid gap-3 border-t border-[#06080b]/20 py-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)] lg:items-baseline lg:gap-10"
            >
              <div className="text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-none tracking-[-0.04em] line-through decoration-[3px]">
                {r.word}
              </div>
              <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap">{r.log}</pre>
              <p className="text-base leading-relaxed text-[#3a4048]">{r.why}</p>
            </div>
          ))}
          <div className="border-t border-[#06080b]/20 pt-10">
            <p className="max-w-4xl text-[clamp(1.875rem,4vw,3rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-balance">
              One demonstration replaces <span className="text-[#0e7490]">all three.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
