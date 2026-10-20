import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bus, LogOut } from 'lucide-react';
import { currentNavItem, navFor, type NavItem } from '@/app/config/nav.config';
import { useLogout, type CurrentUser } from '@/features/auth/use-auth';
import { useSystemInfo } from '@/features/system/use-system';
import { useMyTickets } from '@/features/tickets/use-tickets';
import { cn } from '@/lib/utils';
import { PocBanner } from './poc-banner';
import { ThemeToggle } from './theme-toggle';

type Meta = { crumb: string; subtitle: string; avatar: string };

/** What differs between the passenger and konduktor frames: the words, and the colour of the avatar and role badge. */
const META: Record<'passenger' | 'konduktor', Meta> = {
  passenger: { crumb: 'Passenger', subtitle: 'Ride the line', avatar: '#0369a1' },
  konduktor: { crumb: 'Konduktor', subtitle: 'Konduktor app', avatar: '#7c3aed' },
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** The amber count on My tickets: tickets bought but not yet paid. */
function AwaitingBadge() {
  const { data } = useMyTickets();
  const n = data?.filter((t) => t.status === 'pending_payment').length ?? 0;
  if (n === 0) return null;
  return (
    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#f59e0b] px-1.5 text-[11px] font-extrabold text-[#1c1203]" aria-label={`${n} awaiting payment`}>
      {n}
    </span>
  );
}

function Chip({ item, size }: { item: NavItem; size: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-lg" style={{ width: size, height: size, background: item.tone, color: item.ink ?? '#ffffff' }}>
      <item.icon className="size-4" aria-hidden />
    </span>
  );
}

function SideLink({ item, role }: { item: NavItem; role: 'passenger' | 'konduktor' }) {
  return (
    <NavLink
      to={item.to}
      end
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
          isActive ? 'bg-white font-bold text-[#0f172a]' : 'font-semibold text-[#c3cbe0] hover:bg-white/10 hover:text-white',
        )
      }
    >
      <Chip item={item} size={28} />
      {item.label}
      {role === 'passenger' && item.to === '/tickets' && <AwaitingBadge />}
    </NavLink>
  );
}

function TabLink({ item, role }: { item: NavItem; role: 'passenger' | 'konduktor' }) {
  return (
    <NavLink
      to={item.to}
      end
      className={({ isActive }) =>
        cn(
          'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
          isActive ? 'bg-white font-extrabold text-[#0f172a]' : 'font-semibold text-[#c3cbe0]',
        )
      }
    >
      <Chip item={item} size={28} />
      {item.label}
      {role === 'passenger' && item.to === '/tickets' && (
        <span className="absolute right-3 top-1">
          <AwaitingBadge />
        </span>
      )}
    </NavLink>
  );
}

/**
 * The frame for a passenger or a konduktor (design-handoff). On a wide screen: the navy side bar and a header with the
 * breadcrumb, title, theme toggle, who is signed in and Log out. On a phone (below md): an app bar on top (avatar, name, role,
 * theme toggle, log out) and a bottom tab bar, which is where a thumb is.
 */
export function MemberShell({ user }: { user: CurrentUser & { role: 'passenger' | 'konduktor' } }) {
  const { data } = useSystemInfo();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const meta = META[user.role];
  const items = navFor(user.role);
  const here = currentNavItem(user.role, pathname);
  // The konduktor's Dispatch screen on a phone has a back button instead of the profile, and no tab bar: the Dispatch button is there.
  const focused = user.role === 'konduktor' && pathname === '/konduktor/dispatch';
  const signOut = () => logout.mutate(undefined, { onSuccess: () => navigate('/login') });
  const badge = (
    <span className="self-start rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white" style={{ background: meta.avatar }}>
      {user.role}
    </span>
  );
  const avatar = (
    <span className="grid size-[38px] shrink-0 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: meta.avatar }} aria-hidden>
      {initials(user.fullName)}
    </span>
  );

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside aria-label="Side navigation" className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-navy px-3.5 py-5 text-white md:flex">
        <Link to="/" className="flex items-center gap-3 px-2">
          <span className="grid size-[42px] place-items-center rounded-xl bg-[#facc15] text-[#0f172a]">
            <Bus className="size-[22px]" aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="text-base font-extrabold tracking-tight">BRT Bus Station</span>
            <span className="text-xs text-[#9ba6c2]">{meta.subtitle}</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {items.map((item) => (
            <SideLink key={`${item.to}-${item.label}`} item={item} role={user.role} />
          ))}
        </nav>
        <p className="mt-auto px-2 text-[11px] text-[#8590ad]">{data?.versionLabel ?? 'BRT Bus Station'}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Wide screens: the header. */}
        <header className="sticky top-0 z-20 hidden flex-wrap items-center justify-between gap-3 border-b bg-surface px-8 py-3 md:flex">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {meta.crumb} / {here?.label ?? 'Page'}
            </span>
            <span className="text-lg font-extrabold leading-tight tracking-tight">{here?.title ?? here?.label ?? 'BRT Bus Station'}</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-3 rounded-full bg-surface-2 py-1 pl-1 pr-4" data-testid="nav-user">
              {avatar}
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold leading-none">{user.fullName}</span>
                {badge}
              </span>
            </div>
            <button
              type="button"
              aria-label="Log out"
              disabled={logout.isPending}
              onClick={signOut}
              className="flex h-11 items-center gap-2 rounded-xl bg-[#ffe4e6] px-4 text-sm font-bold text-[#9f1239] transition-colors hover:bg-[#be123c] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#be123c] disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden />
              <span aria-hidden>Log out</span>
            </button>
          </div>
        </header>

        {/* Phones: the app bar. */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-surface px-3.5 py-2.5 md:hidden" data-testid="app-bar">
          {focused ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Link to="/konduktor" aria-label="Back to My bus" className="grid size-11 shrink-0 place-items-center rounded-xl border bg-card hover:bg-surface-2">
                <ArrowLeft className="size-5" aria-hidden />
              </Link>
              <span className="text-base font-extrabold">Dispatch</span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3" data-testid="nav-user-mobile">
              {avatar}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-bold leading-none">{user.fullName}</span>
                {badge}
              </span>
            </div>
          )}
          <ThemeToggle />
          <button
            type="button"
            aria-label="Log out"
            disabled={logout.isPending}
            onClick={signOut}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#ffe4e6] text-[#9f1239] hover:bg-[#be123c] hover:text-white disabled:opacity-60"
          >
            <LogOut className="size-[18px]" aria-hidden />
          </button>
        </header>

        <PocBanner />
        <main className={cn('flex-1 md:pb-0', !focused && 'pb-tabbar')}>
          <Outlet />
        </main>
      </div>

      <nav aria-label="Main (tabs)" className={cn('fixed inset-x-0 bottom-0 z-30 gap-1 bg-navy px-2 pt-2 text-white pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden', focused ? 'hidden' : 'flex')}>
        {items.map((item) => (
          <TabLink key={`${item.to}-${item.label}`} item={item} role={user.role} />
        ))}
      </nav>
    </div>
  );
}
