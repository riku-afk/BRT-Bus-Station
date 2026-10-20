import { Navigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { ROLE_HOME } from '@/app/config/nav.config';
import { useCurrentUser } from '@/features/auth/use-auth';
import { HomePage } from './home-page';

/**
 * `/` is the passenger map with every bus on it, for someone who is signed in. A visitor who is not signed in goes straight to
 * the sign-in page (which links to registering). A konduktor only ever sees their own bus (on their own page), so they are sent
 * there instead of to the all-buses map.
 */
export function HomeRoute() {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <Skeleton className="m-4 h-32" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'konduktor') return <Navigate to={ROLE_HOME.konduktor} replace />;
  return <HomePage />;
}
