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

const PLURAL: Record<Role, string> = { passenger: 'passengers', konduktor: 'konduktors', admin: 'admins' };

/** The sentence shown when someone signs in on the wrong address. */
export function wrongHostMessage(map: HostRoles, host: string): string {
  const allowed = map.get(host) ?? [];
  const who = allowed.map((r) => PLURAL[r]).join(' and ');
  return `This address is for ${who}. Please use the address meant for your account.`;
}
