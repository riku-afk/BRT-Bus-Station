/** Hono environment shared by every controller. */
import type { DiscountType } from '@shared/fares/discount';
import type { Role } from '@shared/rbac/roles';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  discountType: DiscountType | null;
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
