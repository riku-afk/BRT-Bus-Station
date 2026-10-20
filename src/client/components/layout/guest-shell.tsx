import { Link, Outlet, useLocation } from 'react-router-dom';
import { Bus, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSystemInfo } from '@/features/system/use-system';
import { PocBanner } from './poc-banner';
import { ThemeToggle } from './theme-toggle';

/**
 * The frame for someone who is not signed in: just a top bar with the name and a way to sign in. There is no side navigation,
 * because there is nothing to navigate to: every other page needs an account.
 */
export function GuestShell() {
  const { data } = useSystemInfo();
  const { pathname } = useLocation();
  const onAuthPage = pathname === '/login' || pathname === '/register';
  // Sign in and register draw their own full-screen frame (brand panel, theme toggle, version), so no top bar here.
  if (onAuthPage) return <Outlet />;
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-surface px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#facc15] text-[#0f172a]">
            <Bus className="size-5" aria-hidden />
          </span>
          <span className="text-base font-extrabold tracking-tight">BRT Bus Station</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {!onAuthPage && (
            <Button asChild>
              <Link to="/login">
                <LogIn /> Sign in
              </Link>
            </Button>
          )}
        </div>
      </header>
      <PocBanner />
      <main className="flex-1">
        <Outlet />
      </main>
      {data?.versionLabel && <p className="px-4 py-3 text-center text-xs text-muted-foreground">{data.versionLabel}</p>}
    </div>
  );
}
