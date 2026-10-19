import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bus, LogIn, LogOut, Map as MapIcon, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { navFor } from '@/app/config/nav.config';
import { useCurrentUser, useLogout } from '@/features/auth/use-auth';
import { useSystemInfo } from '@/features/system/use-system';
import { cn } from '@/lib/utils';
import { PocBanner } from './poc-banner';
import { ThemeToggle } from './theme-toggle';

const linkClass = 'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';
const activeClass = 'bg-accent font-medium text-foreground';

/**
 * The frame of every page: a side navigation bar (a fixed column on a wide screen, a drawer behind a menu button on a phone) and
 * the page beside it. The menu depends on who is signed in; the server enforces the roles, this only decides what to show.
 */
export function AppShell() {
  const { data } = useSystemInfo();
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const items = navFor(user?.role ?? null);
  // The drawer on a phone. On a wide screen the bar is always there and this does nothing.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} aria-hidden data-testid="nav-backdrop" />}

      <aside
        id="side-nav"
        aria-label="Side navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform duration-200',
          'md:sticky md:top-0 md:z-auto md:h-svh md:shrink-0 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold" onClick={() => setOpen(false)}>
            <Bus className="size-5 text-primary" aria-hidden />
            BRT Bus Station
          </Link>
          <Button variant="ghost" size="icon" className="size-8 md:hidden" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Main">
          {items.length === 0 && (
            <NavLink to="/" end onClick={() => setOpen(false)} className={({ isActive }) => cn(linkClass, isActive && activeClass)}>
              <MapIcon className="size-4" aria-hidden />
              Map
            </NavLink>
          )}
          {items.map((item) => (
            <NavLink key={`${item.to}-${item.label}`} to={item.to} end onClick={() => setOpen(false)} className={({ isActive }) => cn(linkClass, isActive && activeClass)}>
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t p-3">
          {user ? (
            <>
              <div className="px-1" data-testid="nav-user">
                <p className="truncate text-sm font-medium">{user.fullName}</p>
                <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={logout.isPending}
                  onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
                >
                  <LogOut /> Sign out
                </Button>
                <ThemeToggle />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild size="sm" className="flex-1">
                <Link to="/login" onClick={() => setOpen(false)}>
                  <LogIn /> Sign in
                </Link>
              </Button>
              <ThemeToggle />
            </div>
          )}
          <p className="px-1 text-xs text-muted-foreground">{data?.versionLabel ?? 'BRT Bus Station'}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-3 md:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={open} aria-controls="side-nav" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Bus className="size-5 text-primary" aria-hidden />
            BRT Bus Station
          </Link>
        </header>
        <PocBanner />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
