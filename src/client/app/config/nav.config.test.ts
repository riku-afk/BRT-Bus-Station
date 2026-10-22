import { describe, expect, it } from 'vitest';
import { currentNavItem, navFor } from './nav.config';

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

describe('the admin menu', () => {
  it('has an Overview on its own, then Operations and Revenue groups, each section in its own colour', () => {
    const items = navFor('admin');
    expect(items.filter((i) => !i.group).map((i) => i.label)).toEqual(['Overview']);
    expect(items.filter((i) => i.group === 'operations').map((i) => i.label)).toEqual(['Live map', 'Map', 'Stations', 'Buses', 'Konduktors']);
    expect(items.filter((i) => i.group === 'revenue').map((i) => i.label)).toEqual(['Fares', 'Manual tickets', 'Payments', 'Scans']);
    expect(items.every((i) => i.tone)).toBe(true);
    // Amber needs dark ink to stay readable.
    expect(items.find((i) => i.label === 'Scans')?.ink).toBe('#1c1203');
  });

  it('finds the entry for the page being shown, longest path first', () => {
    expect(currentNavItem('admin', '/admin')?.label).toBe('Overview');
    expect(currentNavItem('admin', '/admin/')?.label).toBe('Overview');
    expect(currentNavItem('admin', '/admin/buses')?.label).toBe('Buses');
    expect(currentNavItem('admin', '/admin/buses/anything')?.label).toBe('Buses');
    expect(currentNavItem('admin', '/')?.label).toBe('Map');
    expect(currentNavItem('admin', '/nowhere')).toBeUndefined();
    expect(currentNavItem(null, '/admin')).toBeUndefined();
  });
});
