import { Fragment } from 'react'
import { H2, WRAP } from './ui'

const PROCESSES = [
  { name: 'Onboard an employee', apps: ['HR system', 'Email', 'Chat', 'Payroll'] },
  { name: 'Pay an invoice', apps: ['Inbox', 'Accounting', 'Bank'] },
  { name: 'Set up a customer', apps: ['Your product', 'CRM', 'Billing'] },
  { name: 'Build the weekly report', apps: ['Analytics', 'Ads', 'Docs'] },
]

export function Processes() {
  return (
    <section id="examples" className="scroll-mt-20 bg-[#06080b] pt-32 pb-4">
      <div className={WRAP}>
        <h2 className={`${H2} mb-12 max-w-3xl`}>If a person does it across tabs, Conxa can teach it.</h2>
        {PROCESSES.map((p) => (
          <div
            key={p.name}
            className="flex flex-col gap-5 border-t border-white/10 py-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12"
          >
            <div className="text-[clamp(1.75rem,3.4vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.03em] lg:w-[520px]">
              {p.name}
            </div>
            <div className="flex flex-wrap items-center gap-y-2">
              {p.apps.map((a, i) => (
                <Fragment key={a}>
                  {i > 0 && (
                    <span className="px-2.5 text-xl text-[#6b7280]" aria-hidden="true">
                      →
                    </span>
                  )}
                  <span className="rounded-full border border-white/18 px-4 py-2 text-base text-[#f4f5f7]">{a}</span>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
        <div className="border-t border-white/10" />
      </div>
    </section>
  )
}
