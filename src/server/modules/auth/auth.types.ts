import type { Role } from '@shared/rbac/roles';

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: Date;
};

/** What the API returns about a user (never the hash). */
export type UserView = { id: string; email: string; fullName: string; role: Role };

export type CreateUserInput = { email: string; password: string; fullName: string; role: Role };
