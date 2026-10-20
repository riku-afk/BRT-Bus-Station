import { useCurrentUser } from '@/features/auth/use-auth';
import { AdminShell } from './admin-shell';
import { GuestShell } from './guest-shell';
import { MemberShell } from './member-shell';

/**
 * The frame of every page, chosen by who is signed in: the admin console, the passenger / konduktor app (side bar on a wide
 * screen, tab bar on a phone), or just a top bar for a visitor. The user is read once, here, and handed down, so the frames can
 * never disagree about who is signed in. The server enforces the roles; this only decides what to show.
 */
export function AppShell() {
  const { data: user } = useCurrentUser();
  if (!user) return <GuestShell />;
  if (user.role === 'admin') return <AdminShell user={user} />;
  return <MemberShell user={{ ...user, role: user.role }} />;
}
