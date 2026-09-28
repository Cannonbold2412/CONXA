import { H2, LEAD, WRAP } from './ui'

const FAQ = [
  ['Do I need to write code?', 'No. You record the task once. Conxa builds the skill.'],
  [
    'What if the software changes?',
    'Each element is found by several clues, tried in order. The run only stops if every one fails.',
  ],
  ['Where does it run?', 'On your own machine, through your AI agent. Your data does not go to Conxa.'],
  [
    'Which AI agents work with it?',
    'Any agent that supports the MCP protocol, including Claude. You are not tied to one.',
  ],
]

export function HomeFaq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-[#06080b] pt-32 pb-32">
      <div className={`${WRAP} grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-24`}>
        <h2 className={H2}>Before you ask.</h2>
        <div className="border-b border-white/10">
          {FAQ.map(([q, a], i) => (
            <details key={q} open={i === 0} className="group border-t border-white/10 py-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-xl font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <span className="text-cyan-400 transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className={`${LEAD} mt-3 max-w-xl`}>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
