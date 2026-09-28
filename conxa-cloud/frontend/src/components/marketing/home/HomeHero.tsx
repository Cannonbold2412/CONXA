import { GlowButton } from '../primitives/GlowButton'

interface AppWindow {
  x: number
  y: number
  w: number
  title: string
  btn: { x: number; y: number; label: string }
  delay: number
}

const WINDOWS: AppWindow[] = [
  { x: 0, y: 90, w: 340, title: 'hr.example.com', btn: { x: 210, y: 262, label: 'Add' }, delay: 0.15 },
  { x: 430, y: 150, w: 340, title: 'mail.example.com', btn: { x: 640, y: 290, label: 'Send' }, delay: 2.4 },
  { x: 860, y: 30, w: 340, title: 'pay.example.com', btn: { x: 1060, y: 210, label: 'Pay' }, delay: 4.9 },
]

const TRACE = 'M260 279 C 380 340 540 340 690 306 C 820 276 940 160 1110 227'

function Window({ x, y, w, title, btn, delay }: AppWindow) {
  const h = y === 90 ? 230 : y === 150 ? 190 : 230
  const cx = btn.x + 50
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill="#0b0f14" stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} />
      <path d={`M${x} ${y + 34} H${x + w}`} stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} fill="none" />
      {[20, 36, 52].map((dx) => (
        <circle key={dx} cx={x + dx} cy={y + 17} r={4} fill="rgba(255,255,255,0.22)" />
      ))}
      <text x={x + 72} y={y + 22} fill="#9ba3af" fontSize={13} fontFamily="ui-monospace, monospace">
        {title}
      </text>
      {[0.52, 0.72, 0.4].map((f, i) => (
        <rect key={f} x={x + 24} y={y + 62 + i * 26} width={Math.round(w * f)} height={10} rx={5} fill="rgba(255,255,255,0.08)" />
      ))}
      <rect
        className="hm-hit"
        x={btn.x}
        y={btn.y}
        width={100}
        height={34}
        rx={8}
        fill="#0f1620"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={1.5}
        style={{ animationDelay: `${delay}s` }}
      />
      <text x={cx} y={btn.y + 22} textAnchor="middle" fill="#f4f5f7" fontSize={14} fontWeight={600}>
        {btn.label}
      </text>
      <circle
        className="hm-rip"
        cx={cx}
        cy={btn.y + 17}
        r={26}
        fill="none"
        stroke="#22d3ee"
        strokeWidth={2}
        style={{ animationDelay: `${delay}s` }}
      />
    </g>
  )
}

export function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-[#06080b] px-6 pt-28 pb-20 sm:pt-36">
      <div className="mx-auto max-w-[1200px]">
        <h1 className="max-w-[1100px] text-[clamp(2.5rem,6.5vw,5.5rem)] font-semibold leading-none tracking-[-0.04em] text-[#f4f5f7] text-balance">
          Show it once. <span className="text-cyan-400">Any agent</span> runs it.
        </h1>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-20">
          <p className="max-w-[700px] text-lg leading-relaxed text-[#9ba3af]">
            Conxa records a task the way your team already does it, across any software, and hands it to any AI agent
            as a skill. It runs on your own machines and keeps working after the screens change.
          </p>
          <div className="flex shrink-0 flex-wrap gap-3">
            <GlowButton href="#demo">Book a demo</GlowButton>
            <GlowButton href="/docs" variant="ghost">
              Read the docs
            </GlowButton>
          </div>
        </div>

        <div className="mt-16 sm:mt-20">
          <div className="relative w-full" style={{ aspectRatio: '1200 / 360' }}>
            <svg viewBox="0 0 1200 360" className="absolute inset-0 h-full w-full" aria-hidden="true">
              {WINDOWS.map((win) => (
                <Window key={win.title} {...win} />
              ))}
              <path
                className="hm-trace"
                d={TRACE}
                fill="none"
                stroke="#22d3ee"
                strokeWidth={3}
                strokeLinecap="round"
              />
            </svg>
            <svg
              className="hm-cursor absolute top-0 left-0 h-[1.8%] w-[1.8%] min-h-[14px] min-w-[14px]"
              viewBox="0 0 22 22"
              aria-hidden="true"
            >
              <path
                d="M2 2 L2 17 L6.2 13 L9 19.5 L11.6 18.4 L8.8 12 L14.5 12 Z"
                fill="#f4f5f7"
                stroke="#06080b"
                strokeWidth={1.2}
              />
            </svg>
          </div>
          <div className="hm-chip mt-2 inline-flex items-center gap-3 rounded-[10px] border border-cyan-400/50 px-4 py-3 font-mono text-sm text-[#f4f5f7]">
            <span className="size-2 rounded-full bg-cyan-400" />
            onboard-employee · 3 apps · ready for any agent
          </div>
        </div>
      </div>
    </section>
  )
}
