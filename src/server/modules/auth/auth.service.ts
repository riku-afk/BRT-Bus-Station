/** Business rules for accounts and sessions. Session = signed JWT in an httpOnly cookie (D-07). */
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '@config/env';
import { getDb, type SQLExecutor } from '@core/database';
import type { AuthUser } from '@core/types';
import { ApiError } from '@lib/response';
import { isRole } from '@shared/rbac/roles';
import { authRepository } from './auth.repository';
import type { CreateUserInput, UserRow, UserView } from './auth.types';

const BCRYPT_COST = 10;
const secret = () => new TextEncoder().encode(env.session.secret);
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export const SESSION_COOKIE = 'brt_session';

export function toView(user: UserRow): UserView {
  return { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
}

export function toAuthUser(user: UserRow): AuthUser {
  return toView(user);
}

export const authService = {
  /** Creates an account with any role. Callers decide who may do this (register = passenger only; admins create konduktors). */
  async createUser(input: CreateUserInput, db: SQLExecutor = getDb()): Promise<UserRow> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    try {
      return await authRepository.insert(db, {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        role: input.role,
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw ApiError.conflict('An account with this email already exists');
      throw err;
    }
  },

  /** Public self-registration (AUTH-01): always a passenger. The role is never taken from the request. */
  register(input: { email: string; password: string; fullName: string }) {
    return authService.createUser({ ...input, role: 'passenger' });
  },

  /** Admin-side account changes (used by the konduktors module). */
  async updateUser(
    db: SQLExecutor,
    id: string,
    patch: { fullName?: string; isActive?: boolean; password?: string },
  ): Promise<UserRow> {
    const passwordHash = patch.password ? await bcrypt.hash(patch.password, BCRYPT_COST) : undefined;
    const row = await authRepository.update(db, id, { fullName: patch.fullName, isActive: patch.isActive, passwordHash });
    if (!row) throw ApiError.notFound('User not found');
    return row;
  },

  deleteUser(db: SQLExecutor, id: string): Promise<void> {
    return authRepository.delete(db, id);
  },

  async authenticate(email: string, password: string): Promise<UserRow> {
    const user = await authRepository.findByEmail(getDb(), email);
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok || !user.is_active) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    return user;
  },

  async issueSessionToken(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${env.session.ttlHours}h`)
      .sign(secret());
  },

  /** Verifies the cookie value and reloads the user, so deactivation and role changes take effect immediately (AUTH-07). */
  async userFromSessionToken(token: string, db: SQLExecutor = getDb()): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
      if (!payload.sub) return null;
      const user = await authRepository.findById(db, payload.sub);
      if (!user || !user.is_active || !isRole(user.role)) return null;
      return toAuthUser(user);
    } catch {
      return null;
    }
  },
};
