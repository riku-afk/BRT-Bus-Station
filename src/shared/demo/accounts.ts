/** Demo accounts created by `bun run db:seed` (never in production). Shown on the login page outside prod. */
import type { Role } from '../rbac/roles';

export const DEMO_PASSWORD = 'Demo1234!';

export type DemoAccount = { email: string; fullName: string; role: Role };

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'admin@brt.test', fullName: 'Ana Admin', role: 'admin' },
  { email: 'konduktor1@brt.test', fullName: 'Ramon Dela Cruz', role: 'konduktor' },
  { email: 'konduktor2@brt.test', fullName: 'Liza Mendoza', role: 'konduktor' },
  { email: 'konduktor3@brt.test', fullName: 'Jun Villanueva', role: 'konduktor' },
  { email: 'passenger1@brt.test', fullName: 'Maria Santos', role: 'passenger' },
  { email: 'passenger2@brt.test', fullName: 'Juan Reyes', role: 'passenger' },
];
