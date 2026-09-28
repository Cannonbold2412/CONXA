import { H2, LEAD, WRAP } from './ui'

export function LocalFirst() {
  return (
    <section id="security" className="scroll-mt-20 bg-[#06080b] pt-32">
      <div className={`${WRAP} flex flex-col gap-14`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-20">
          <h2 className={`${H2} max-w-xl`}>Your logins never leave your machine.</h2>
          <p className={`${LEAD} max-w-md`}>
            Execution is entirely local. The cloud only coordinates. It is the answer your security team asks for first.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-0 md:flex-row">
          <div className="flex min-h-[260px] flex-1 flex-col justify-between rounded-2xl border border-cyan-400/50 bg-[#0b0f14] p-8">
            <div className="text-2xl font-semibold">Your machine</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-lg text-[#9ba3af]">
              <span>Recording</span>
              <span>Compiling</span>
              <span>Running</span>
              <span className="text-[#f4f5f7]">Logins and sessions</span>
            </div>
          </div>
          <div className="relative flex min-h-[110px] items-center justify-center md:w-[340px] md:min-h-0">
            <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-white/25" />
            <div
              className="hm-pkt absolute top-[calc(50%-6px)] size-3 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.7)]"
              aria-hidden="true"
            />
            <p className="relative top-9 w-[240px] bg-[#06080b] px-3 py-2 text-center text-sm leading-snug text-[#9ba3af]">
              Skill packs and signed updates come down. Logins never go up.
            </p>
          </div>
          <div className="flex min-h-[260px] flex-col justify-between rounded-2xl border border-white/14 p-8 md:w-[280px]">
            <div className="text-2xl font-semibold">Conxa cloud</div>
            <div className="text-lg leading-8 text-[#9ba3af]">
              Skill hosting
              <br />
              Updates
              <br />
              Billing
            </div>
          </div>
        </div>

        <div className="grid gap-6 text-base leading-relaxed text-[#9ba3af] md:grid-cols-3 md:gap-16">
          <p>
            <strong className="font-semibold text-[#f4f5f7]">Credentials stay local.</strong> They are never packaged
            into a skill.
          </p>
          <p>
            <strong className="font-semibold text-[#f4f5f7]">Updates are signed.</strong> Checked before install,
            rolled back on failure.
          </p>
          <p>
            <strong className="font-semibold text-[#f4f5f7]">Nothing to install on your apps.</strong> Conxa works
            through the screen.
          </p>
        </div>
      </div>
    </section>
  )
}
