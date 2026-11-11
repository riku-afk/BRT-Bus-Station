import type { DiscountType } from '@shared/fares/discount';
import type { Role } from '@shared/rbac/roles';

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: Date;
  discount_type: DiscountType | null;
  discount_id: string | null;
};

/** What the API returns about a user (never the hash). */
export type UserView = { id: string; email: string; fullName: string; role: Role; /** The fare discount this account has (shown so the screens can preview the price), or null. */ discountType: DiscountType | null };

export type CreateUserInput = { email: string; password: string; fullName: string; role: Role };
