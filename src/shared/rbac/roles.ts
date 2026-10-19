/** Roles — browser-safe. The server enforces them; the client only uses them to pick routes and menus. */
export const ROLES = ['passenger', 'konduktor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
