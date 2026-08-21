'use client'

import { OrganizationSwitcher, UserButton } from '@clerk/nextjs'
import { clerkAppearance } from '@/lib/clerkAppearance'

export function AccountControls() {
  return (
    <div className="hidden shrink-0 items-center gap-3 md:flex">
      <OrganizationSwitcher
        hidePersonal
        afterSelectOrganizationUrl="/dashboard"
        afterCreateOrganizationUrl="/dashboard"
        appearance={{
          ...clerkAppearance,
          elements: {
            ...clerkAppearance.elements,
            rootBox: 'text-zinc-300',
            organizationSwitcherTrigger:
              'flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06] transition-colors',
            organizationSwitcherPopoverCard: 'bg-[#0d0f12] border border-white/10 shadow-xl',
            organizationSwitcherPopoverActionButton: 'text-zinc-300 hover:bg-white/5',
            organizationPreviewTextContainer: 'text-zinc-200',
          },
        }}
      />

      <UserButton
        appearance={{
          ...clerkAppearance,
          elements: {
            ...clerkAppearance.elements,
            avatarBox: 'size-8',
            userButtonAvatarBox: 'size-8',
          },
        }}
      />
    </div>
  )
}
