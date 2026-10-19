/** Hono environment shared by every controller. */
import type { Role } from '@shared/rbac/roles';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};

export type AuthContext = {
  user: AuthUser;
};

export type AppEnv = {
  Variables: {
    requestId: string;
    auth: AuthContext | null;
  };
};
