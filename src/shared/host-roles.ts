import { isRole, type Role } from './rbac/roles';

/** Which roles may sign in on which address (host name). A host that is not listed has no restriction. */
export type HostRoles = ReadonlyMap<string, readonly Role[]>;

/**
 * Reads "host=role,host=role+role": for example "brt.example.com=admin,scan.example.com=konduktor,app.example.com=passenger".
 * Several roles for one host are joined with "+". An empty text means no restriction anywhere. A wrong role name is an error,
 * so a typo cannot silently leave an address open.
 */
export function parseHostRoles(raw: string): HostRoles {
  const map = new Map<string, Role[]>();
  for (const part of raw.split(',').map((p) => p.trim()).filter(Boolean)) {
    const [host, roles] = part.split('=').map((s) => s.trim());
    if (!host || !roles) throw new Error(`HOST_ROLES: "${part}" must look like host=role`);
    const list = roles.split('+').map((r) => r.trim().toLowerCase());
    const bad = list.find((r) => !isRole(r));
    if (bad) throw new Error(`HOST_ROLES: "${bad}" is not a role (passenger, konduktor, admin)`);
    map.set(host.toLowerCase(), list as Role[]);
  }
  return map;
}

/** "Brt.Example.com:443" -> "brt.example.com". The first value wins when a proxy sends a list. */
export function normalizeHost(value: string | null | undefined): string {
  return (value ?? '').split(',')[0]!.trim().toLowerCase().replace(/:\d+$/, '');
}

export function hostAllowsRole(map: HostRoles, host: string, role: Role): boolean {
  const allowed = map.get(host);
  return !allowed || allowed.includes(role);
}

/**
 * What anyone gets when they sign in on an address that is not for their role: the same sentence as for a wrong password, for everyone,
 * so the reply never reveals that an account exists, that the password was right, or which address belongs to which role.
 */
export const WRONG_ADDRESS_MESSAGE = 'Invalid email or password';
