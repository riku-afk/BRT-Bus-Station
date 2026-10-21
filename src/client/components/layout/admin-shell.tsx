import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bus, LogOut, Menu, X } from 'lucide-react';
import { currentNavItem, navFor, type NavGroup, type NavItem } from '@/app/config/nav.config';
import { useLogout, type CurrentUser } from '@/features/auth/use-auth';
import { useSystemInfo } from '@/features/system/use-system';
import { cn } from '@/lib/utils';
import { PocBanner } from './poc-banner';
import { ThemeToggle } from './theme-toggle';

const GROUPS: { key: NavGroup; label: string }[] = [
  { key: 'operations', label: 'Operations' },
  { key: 'revenue', label: 'Revenue' },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function SideLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
          isActive ? 'bg-white font-bold text-[#0f172a]' : 'font-semibold text-[#c3cbe0] hover:bg-white/10 hover:text-white',
        )
      }
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: item.tone, color: item.ink ?? '#ffffff' }}>
        <item.icon className="size-4" aria-hidden />
      </span>
      {item.label}
    </NavLink>
  );
}

/**
 * The admin frame (design-handoff): a navy sidebar with Operations and Revenue groups, and a header with the breadcrumb, page title,
 * theme toggle, who is signed in and Log out. On a phone the sidebar is a drawer behind the menu button.
 */
export function AdminShell({ user }: { user: CurrentUser | null | undefined }) {
  const { data } = useSystemInfo();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const items = navFor('admin');
  const here = currentNavItem('admin', pathname);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {open && <div className="fixed inset-0 z-30 bg-black/55 md:hidden" onClick={close} aria-hidden data-testid="nav-backdrop" />}

      <aside
        id="side-nav"
        aria-label="Side navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-6 overflow-y-auto bg-navy px-3.5 py-5 text-white transition-transform duration-200',
          'md:sticky md:top-0 md:z-auto md:h-svh md:shrink-0 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-2">
          <Link to="/admin" onClick={close} className="flex items-center gap-3">
            <span className="grid size-[42px] place-items-center rounded-xl bg-[#facc15] text-[#0f172a]">
              <Bus className="size-[22px]" aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-base font-extrabold leading-tight tracking-tight">Cavite Smart Transport Terminal</span>
              <span className="text-xs text-[#9ba6c2]">Admin console</span>
            </span>
          </Link>
          <button type="button" aria-label="Close menu" onClick={close} className="grid size-9 place-items-center rounded-lg text-[#c3cbe0] hover:bg-white/10 md:hidden">
            <X className="size-5" />
          </button>
        </div>

        <nav aria-label="Main" className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            {items
              .filter((i) => !i.group)
              .map((item) => (
                <SideLink key={item.to} item={item} onNavigate={close} />
              ))}
          </div>
          {GROUPS.map((g) => (
            <div key={g.key} className="flex flex-col gap-1">
              <span className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8590ad]">{g.label}</span>
              {items
                .filter((i) => i.group === g.key)
                .map((item) => (
                  <SideLink key={`${item.to}-${item.label}`} item={item} onNavigate={close} />
                ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1.5 rounded-2xl bg-navy-2 p-4">
          <span className="text-[13px] font-bold">Need help?</span>
          <span className="text-xs leading-relaxed text-[#9ba6c2]">Contact the BRT system support team for help with this console.</span>
          <span className="mt-1 text-[11px] text-[#8590ad]">{data?.versionLabel ?? 'Cavite Smart Transport Terminal'}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-surface px-4 py-3 sm:px-6 md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="side-nav"
              onClick={() => setOpen(true)}
              className="grid size-11 place-items-center rounded-xl border bg-card hover:bg-surface-2 md:hidden"
            >
              <Menu className="size-5" />
            </button>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Admin / {here?.label ?? 'Page'}</span>
              <span className="text-lg font-extrabold leading-tight tracking-tight">{here?.title ?? here?.label ?? 'Cavite Smart Transport Terminal'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user && (
              <div className="flex items-center gap-3 rounded-full bg-surface-2 py-1 pl-1 pr-3.5 sm:pr-4" data-testid="nav-user">
                <span className="grid size-[38px] place-items-center rounded-full bg-[#4f46e5] text-sm font-extrabold text-white" aria-hidden>
                  {initials(user.fullName)}
                </span>
                <span className="hidden flex-col gap-0.5 sm:flex">
                  <span className="text-sm font-bold leading-none">{user.fullName}</span>
                  <span className="self-start rounded-full bg-[#facc15] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#422006]">{user.role}</span>
                </span>
                <span className="sr-only sm:hidden">
                  {user.fullName}, {user.role}
                </span>
              </div>
            )}
            <button
              type="button"
              aria-label="Log out"
              disabled={logout.isPending}
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
              className="flex h-11 items-center gap-2 rounded-xl bg-[#ffe4e6] px-4 text-sm font-bold text-[#9f1239] transition-colors hover:bg-[#be123c] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#be123c] disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline" aria-hidden>
                Log out
              </span>
            </button>
          </div>
        </header>
        <PocBanner />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
