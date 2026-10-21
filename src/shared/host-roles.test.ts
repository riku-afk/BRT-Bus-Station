import { describe, expect, it } from 'vitest';
import { hostAllowsRole, normalizeHost, parseHostRoles, wrongHostMessage } from './host-roles';

const map = parseHostRoles('brt.example.com=admin, scan.example.com=konduktor, app.example.com=passenger, both.example.com=admin+konduktor');

describe('host roles', () => {
  it('lets a role in only on its own address', () => {
    expect(hostAllowsRole(map, 'scan.example.com', 'konduktor')).toBe(true);
    expect(hostAllowsRole(map, 'scan.example.com', 'admin')).toBe(false);
    expect(hostAllowsRole(map, 'scan.example.com', 'passenger')).toBe(false);
    expect(hostAllowsRole(map, 'brt.example.com', 'admin')).toBe(true);
    expect(hostAllowsRole(map, 'brt.example.com', 'passenger')).toBe(false);
    expect(hostAllowsRole(map, 'app.example.com', 'passenger')).toBe(true);
  });

  it('allows several roles on one address, and anyone on an address that is not listed', () => {
    expect(hostAllowsRole(map, 'both.example.com', 'admin')).toBe(true);
    expect(hostAllowsRole(map, 'both.example.com', 'konduktor')).toBe(true);
    expect(hostAllowsRole(map, 'both.example.com', 'passenger')).toBe(false);
    expect(hostAllowsRole(map, 'localhost', 'admin')).toBe(true);
    expect(hostAllowsRole(parseHostRoles(''), 'anything', 'passenger')).toBe(true);
  });

  it('ignores the port, the letter case, and a proxy list of hosts', () => {
    expect(normalizeHost('Scan.Example.com:8080')).toBe('scan.example.com');
    expect(normalizeHost('scan.example.com, internal:3000')).toBe('scan.example.com');
    expect(normalizeHost(undefined)).toBe('');
  });

  it('refuses a wrong role name or a malformed entry, so a typo cannot leave an address open', () => {
    expect(() => parseHostRoles('a.example.com=superuser')).toThrow(/not a role/);
    expect(() => parseHostRoles('a.example.com')).toThrow(/host=role/);
  });

  it('says who an address is for', () => {
    expect(wrongHostMessage(map, 'scan.example.com')).toContain('konduktors');
    expect(wrongHostMessage(map, 'both.example.com')).toContain('admins and konduktors');
  });
});
