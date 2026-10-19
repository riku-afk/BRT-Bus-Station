import { z } from '@hono/zod-openapi';
import { ROLES } from '@shared/rbac/roles';

export const RegisterBody = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  // bcrypt only uses the first 72 bytes.
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
});

export const LoginBody = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(72),
});

export const UserView = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string(),
  role: z.enum(ROLES),
});

export const UserResponse = z.object({ success: z.literal(true), data: UserView, timestamp: z.string() });
export const NullableUserResponse = z.object({ success: z.literal(true), data: UserView.nullable(), timestamp: z.string() });
export const OkResponse = z.object({ success: z.literal(true), data: z.object({ ok: z.literal(true) }), timestamp: z.string() });
