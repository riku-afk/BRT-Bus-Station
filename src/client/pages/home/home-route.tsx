import { Navigate } from 'react-router-dom';
import { ROLE_HOME } from '@/app/config/nav.config';
import { useCurrentUser } from '@/features/auth/use-auth';
import { HomePage } from './home-page';

/**
 * `/` is the passenger map with every bus on it. A konduktor only ever sees their own bus (on their own page), so they are
 * sent there instead of to the all-buses map.
 */
export function HomeRoute() {
  const { data: user } = useCurrentUser();
  if (user?.role === 'konduktor') return <Navigate to={ROLE_HOME.konduktor} replace />;
  return <HomePage />;
}
