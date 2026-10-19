import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { ROLE_HOME } from '@/app/config/nav.config';
import type { Role } from '@shared/rbac/roles';
import { useCurrentUser } from './use-auth';

/** Route guard for convenience only — the server enforces roles on every API call. */
export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();
  const location = useLocation();
  if (isLoading) return <Skeleton className="m-4 h-32" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}

/** Login / register are for signed-out visitors; signed-in users go to their home. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <Skeleton className="m-4 h-32" />;
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}
