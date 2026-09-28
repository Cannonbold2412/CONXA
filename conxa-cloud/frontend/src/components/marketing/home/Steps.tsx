import type { ReactNode } from 'react'
import { H2, LEAD, WRAP } from './ui'

const PANEL = 'rounded-2xl border border-white/8 bg-[#0b0f14]'

function RecordMock() {
  const log = [
    'click  button “Add employee”',
    'type   field “Name” → [name]',
    'click  button “Save”',
  ]
  return (
    <div className={`${PANEL} w-full max-w-[600px] overflow-hidden`}>
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3 text-sm">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2 rounded-full bg-white/20" />
        ))}
        <span className="ml-3 truncate font-mono text-[#9ba3af]">hr.example.com/people/new</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[#f4f5f7]">
          <span className="size-2 rounded-full bg-[#ff5f57]" />
          Recording
        </span>
      </div>
      <div className="flex flex-col gap-3 px-6 py-6 text-base">
        <div className="flex gap-3">
          <div className="flex h-10 flex-1 items-center rounded-lg border border-white/14 px-3.5">Priya Nair</div>
          <div className="flex h-10 flex-1 items-center rounded-lg border border-white/14 px-3.5 text-[#9ba3af]">Team</div>
        </div>
        <span className="self-start rounded-lg border border-cyan-400 px-5 py-2.5 font-semibold">Add employee</span>
      </div>
      <div className="border-t border-white/8 px-6 py-5 font-mono text-sm leading-8 text-[#9ba3af]">
        {log.map((l, i) => (
          <div key={l} className="hm-log whitespace-pre" style={{ animationDelay: `${0.2 + i}s` }}>
            {l}
          </div>
        ))}
        <div className="hm-log text-cyan-400" style={{ animationDelay: '3.2s' }}>
          3 steps captured
        </div>
      </div>
    </div>
  )
}

function CompileMock() {
  const line = { stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1.5, fill: 'none' }
  const label = (x: number, y: number, t: string, s: string, anchor: 'start' | 'end') => (
    <g>
      <text x={x} y={y} textAnchor={anchor} fill="#f4f5f7" fontSize={16} fontWeight={600}>
        {t}
      </text>
      <text x={x} y={y + 22} textAnchor={anchor} fill="#9ba3af" fontSize={14}>
        {s}
      </text>
    </g>
  )
  return (
    <svg
      viewBox="0 0 600 320"
      className="h-auto w-full max-w-[600px]"
      role="img"
      aria-label="One button remembered four ways: role and name, visible label, test id, and position"
    >
      <rect x={220} y={132} width={160} height={56} rx={12} fill="#0f1620" stroke="#22d3ee" strokeWidth={2} />
      <text x={300} y={166} textAnchor="middle" fill="#f4f5f7" fontSize={17} fontWeight={600}>
        Add employee
      </text>
      <path d="M220 140 L150 76" {...line} />
      <path d="M380 140 L450 76" {...line} />
      <path d="M220 180 L150 246" {...line} />
      <path d="M380 180 L450 246" {...line} />
      {label(0, 60, 'Role and name', 'button, “Add employee”', 'start')}
      {label(600, 60, 'Visible label', 'the text people read', 'end')}
      {label(0, 272, 'Test id', 'if the page has one', 'start')}
      {label(600, 272, 'Position', 'third in the toolbar', 'end')}
    </svg>
  )
}

function PublishMock() {
  const row = 'flex justify-between border-b border-white/8 py-4 text-base last:border-b-0'
  return (
    <div className={`${PANEL} w-full max-w-[600px] px-7 py-3`}>
      <div className="flex items-center justify-between border-b border-white/8 py-5">
        <div>
          <div className="font-mono text-base">employee-onboarding</div>
          <div className="mt-1 text-sm text-[#9ba3af]">Skill pack, version 1.4</div>
        </div>
        <span className="rounded-full bg-cyan-400 px-3 py-1 text-sm font-semibold text-[#06080b]">Released</span>
      </div>
      <div className={row}>
        <span>Your team</span>
        <span className="text-[#9ba3af]">synced</span>
      </div>
      <div className={row}>
        <span>Your customers, under your name</span>
        <span className="text-[#9ba3af]">installer</span>
      </div>
      <div className={row}>
        <span>Version 1.3</span>
        <span className="text-[#9ba3af]">one click to roll back</span>
      </div>
    </div>
  )
}

function RunMock() {
  const done = ['Created the employee record', 'Sent the welcome email', 'Added to the design channel']
  return (
    <div className={`${PANEL} flex w-full max-w-[600px] flex-col gap-4 p-7 text-base`}>
      <div className="max-w-[420px] self-end rounded-2xl rounded-br-sm bg-[#0f1620] px-4 py-3.5">
        Onboard Priya Nair to the design team.
      </div>
      <div className="text-[#9ba3af]">
        Running <span className="font-mono text-[#f4f5f7]">employee-onboarding</span> on this machine.
      </div>
      <ul className="flex flex-col">
        {done.map((d) => (
          <li key={d} className="flex gap-3 py-2">
            <span className="text-cyan-400" aria-hidden="true">
              ✓
            </span>
            {d}
          </li>
        ))}
        <li className="flex gap-3 py-2 text-[#9ba3af]">
          <span className="text-teal-300" aria-hidden="true">
            ●
          </span>
          Setting up payroll
        </li>
      </ul>
    </div>
  )
}

function Row({ title, body, children, flip }: { title: string; body: string; children: ReactNode; flip?: boolean }) {
  return (
    <div className={`flex flex-col gap-10 lg:items-center lg:justify-between lg:gap-20 ${flip ? 'lg:flex-row-reverse' : 'lg:flex-row'}`}>
      <div className="flex max-w-[440px] flex-col gap-5">
        <h3 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.03em]">{title}</h3>
        <p className={LEAD}>{body}</p>
      </div>
      {children}
    </div>
  )
}

export function Steps() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-[#06080b] py-24 sm:py-32">
      <div className={`${WRAP} flex flex-col gap-24 lg:gap-32`}>
        <h2 className={`${H2} max-w-3xl`}>Four steps. No code.</h2>
        <Row title="Record" body="Do the task once in your browser, exactly as your team does it, across as many apps as it takes.">
          <RecordMock />
        </Row>
        <Row
          flip
          title="Compile"
          body="Conxa turns the recording into a skill. Every button is remembered several ways, so one change can’t break it."
        >
          <CompileMock />
        </Row>
        <Row title="Publish" body="Release a version to your team, or ship it to your customers under your own name.">
          <PublishMock />
        </Row>
        <Row
          flip
          title="Run"
          body="Ask your AI agent in plain words. The skill runs on your machine, step by step, on the software as it is."
        >
          <RunMock />
        </Row>
      </div>
    </section>
  )
}
