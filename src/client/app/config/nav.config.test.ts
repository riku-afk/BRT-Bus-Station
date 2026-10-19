import { describe, expect, it } from 'vitest';
import { navFor } from './nav.config';

const links = (role: Parameters<typeof navFor>[0]) => navFor(role).map((i) => i.to);

describe('menus by role', () => {
  it('a konduktor has their own bus, the scanner and their history: no link to the map that shows every bus', () => {
    expect(links('konduktor')).toEqual(['/konduktor', '/konduktor/scan', '/konduktor/history']);
  });

  it('a passenger gets the map and their tickets', () => {
    expect(links('passenger')).toEqual(['/', '/tickets']);
  });

  it('an admin gets the monitoring and management pages, and nothing of the konduktor or passenger flows', () => {
    const admin = links('admin');
    expect(admin).toEqual(expect.arrayContaining(['/admin', '/admin/live', '/admin/stations', '/admin/buses', '/admin/konduktors', '/admin/fares', '/admin/payments', '/admin/scans']));
    expect(admin).not.toContain('/konduktor');
    expect(admin).not.toContain('/tickets');
  });

  it('a signed-out visitor has no menu', () => {
    expect(links(null)).toEqual([]);
  });
});
