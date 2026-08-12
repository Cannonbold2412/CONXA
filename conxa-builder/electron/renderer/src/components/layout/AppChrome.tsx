import { type ReactNode, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth, performLogout } from '@/contexts/AuthContext'
import { WindowTitleBar } from '@/components/layout/WindowTitleBar'
import { PageHeaderProvider, usePageHeaderContext } from '@/contexts/PageHeaderContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  ChevronLeft,
  ChevronRight,
  Cpu,
  Layers,
  ListChecks,
  LogOut,
  PackageCheck,
  PencilLine,
  PlayCircle,
  Settings,
  UploadCloud,
} from 'lucide-react'

const SIDEBAR_KEY = 'conxa-sidebar-collapsed'

// One button per stage of Workflows -> Compile -> Human Edit -> Test Skill ->
// Publish Skill Package -> Build Installer, so the sidebar mirrors the flow
// itself instead of the compiler's internal pipeline stages. Workflows is the
// app home — it also owns workflow create/delete/search alongside the
// recording (login + workflow) actions on each workflow's own page.
const navGroups = [
  {
    label: 'Operate',
    items: [
      { to: '/workflows', label: 'Workflows', icon: ListChecks },
      { to: '/compile', label: 'Compile', icon: Cpu },
      { to: '/human-edit', label: 'Human Edit', icon: PencilLine },
      { to: '/test', label: 'Test Skill', icon: PlayCircle },
      { to: '/publish', label: 'Publish Skill Package', icon: UploadCloud },
      { to: '/build-installer', label: 'Build Installer', icon: PackageCheck },
    ],
  },
] as const

const settingsNavItem = { to: '/settings', label: 'Settings', icon: Settings } as const

// The current page's title/description, registered by its <PageHeader> via
// PageHeaderContext, rendered here so it sits next to the logout widget
// instead of the page repeating its own header block.
function HeaderPageTitle() {
  const { header } = usePageHeaderContext()
  // Always occupies the flex-1 slot (even empty) so the user/logout widget
  // stays pinned to the right regardless of whether a page has registered a
  // header yet (e.g. during the initial render tick, or on chrome-only screens).
  return (
    <div className="min-w-0 flex-1">
      {header ? (
        <>
          <h1 className={cn('truncate text-sm font-semibold text-white sm:text-base', header.description && 'leading-snug')}>
            {header.title}
          </h1>
          {header.description != null && header.description !== false ? (
            <div className={cn('mt-0.5 min-w-0', typeof header.description === 'string' ? 'truncate text-xs text-zinc-500' : 'text-xs text-zinc-500')}>
              {header.description}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ProductMark() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white shadow-sm"
      aria-hidden
    >
      <Layers className="size-4" strokeWidth={2} />
    </span>
  )
}

function SidebarNavLink({
  item,
  collapsed,
}: {
  item: (typeof navGroups)[number]['items'][number] | typeof settingsNavItem
  collapsed: boolean
}) {
  const { pathname } = useLocation()
  const Icon = item.icon
  const active = pathname === item.to || pathname.startsWith(`${item.to}/`)

  return (
    <NavLink
      to={item.to}
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm transition-colors',
        'hover:border-white/8 hover:bg-white/[0.045] hover:text-white',
        active ? 'border-white/10 bg-white/[0.07] text-white' : 'text-zinc-400',
        collapsed && 'justify-center px-2.5',
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className="size-4 shrink-0" />
      <span className={cn('truncate', collapsed && 'hidden')}>{item.label}</span>
    </NavLink>
  )
}

function SidebarNav({ collapsed }: { collapsed: boolean }) {
  return (
    <nav className="space-y-1.5" aria-label="Primary">
      {navGroups.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <p className={cn('px-3 pt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600', collapsed && 'sr-only')}>
            {group.label}
          </p>
          {group.items.map((item) => (
            <SidebarNavLink key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>
      ))}
    </nav>
  )
}

function DesktopSidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  return (
    <aside
      className={cn(
        'hidden border-r border-white/8 bg-[#0d0f12] md:flex md:h-full md:min-h-0 md:flex-col md:transition-[width] md:duration-200',
        collapsed ? 'md:w-20' : 'md:w-54',
      )}
    >
      <div className="flex items-center gap-3 border-b border-white/8 px-4 py-4">
        <NavLink to="/workflows" className={cn('flex min-w-0 items-center gap-3', collapsed && 'justify-center')}>
          <ProductMark />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Conxa</p>
              <p className="truncate text-xs text-zinc-500">Build Studio</p>
            </div>
          )}
        </NavLink>
        {!collapsed && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-zinc-400 hover:bg-white/5 hover:text-white"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="size-4" />
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
        {collapsed && (
          <div className="mb-6 flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-zinc-400 hover:bg-white/5 hover:text-white"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
        <SidebarNav collapsed={collapsed} />
        <nav className="mt-auto border-t border-white/8 pt-3" aria-label="Settings">
          <SidebarNavLink item={settingsNavItem} collapsed={collapsed} />
        </nav>
      </div>
    </aside>
  )
}

function UserWidget() {
  const { identity, setIdentity } = useAuth()
  if (!identity) return null
  return (
    <div className="flex items-center gap-2">
      <span className="hidden truncate text-xs text-zinc-300 sm:block max-w-[160px]">
        {identity.email}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-zinc-400 hover:bg-white/5 hover:text-white"
        title="Sign out"
        onClick={() => performLogout(setIdentity)}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  )
}

export function AppChrome({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === 'true')
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? 'true' : 'false')
  }, [collapsed])

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-[#0a0c0f] text-zinc-100">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_transparent_40%),linear-gradient(180deg,_#0f1115_0%,_#090b0d_100%)]" />
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          />
        </div>

        <WindowTitleBar />

        <div className="flex min-h-0 flex-1">
          <DesktopSidebar collapsed={collapsed} setCollapsed={setCollapsed} />

          <PageHeaderProvider>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0b0d10]/88 backdrop-blur">
                <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
                  <HeaderPageTitle />
                  <UserWidget />
                </div>
              </header>

              <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            </div>
          </PageHeaderProvider>
        </div>
      </div>
    </TooltipProvider>
  )
}
