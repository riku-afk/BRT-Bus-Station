/**
 * Role-driven menu. The UI uses it for convenience only — the server enforces roles.
 * Add an entry here when a role gets a new page (route lives in app/router.tsx).
 */
import type { LucideIcon } from 'lucide-react';
import { Bus, CreditCard, History, LayoutDashboard, Map as MapIcon, MapPin, Radio, ScanLine, Tag, Ticket, Users } from 'lucide-react';
import type { Role } from '@shared/rbac/roles';

export type NavGroup = 'operations' | 'revenue';

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: readonly Role[];
  /** The heading it sits under in the admin sidebar (none: stands alone at the top). */
  group?: NavGroup;
  /** The section's identity colour: its icon chip, and what it is called in the header. */
  tone?: string;
  /** Text on that colour (amber needs dark ink). */
  ink?: string;
  /** The page's title in the header, when it differs from the menu label. */
  title?: string;
};

const DARK_INK = '#1c1203';

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Map', to: '/', icon: MapIcon, roles: ['passenger'], tone: '#0369a1' },
  { label: 'My tickets', to: '/tickets', icon: Ticket, roles: ['passenger'], tone: '#be185d' },
  { label: 'My bus', to: '/konduktor', icon: Bus, roles: ['konduktor'], tone: '#c2410c' },
  { label: 'Scan', to: '/konduktor/scan', icon: ScanLine, roles: ['konduktor'], tone: '#f59e0b', ink: DARK_INK },
  { label: 'History', to: '/konduktor/history', icon: History, roles: ['konduktor'], tone: '#4f46e5' },
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, roles: ['admin'], tone: '#4f46e5', title: 'Dashboard' },
  { label: 'Live map', to: '/admin/live', icon: Radio, roles: ['admin'], group: 'operations', tone: '#2563eb' },
  { label: 'Map', to: '/', icon: MapIcon, roles: ['admin'], group: 'operations', tone: '#0369a1' },
  { label: 'Stations', to: '/admin/stations', icon: MapPin, roles: ['admin'], group: 'operations', tone: '#0f766e' },
  { label: 'Buses', to: '/admin/buses', icon: Bus, roles: ['admin'], group: 'operations', tone: '#c2410c' },
  { label: 'Konduktors', to: '/admin/konduktors', icon: Users, roles: ['admin'], group: 'operations', tone: '#7c3aed' },
  { label: 'Fares', to: '/admin/fares', icon: Tag, roles: ['admin'], group: 'revenue', tone: '#be185d' },
  { label: 'Payments', to: '/admin/payments', icon: CreditCard, roles: ['admin'], group: 'revenue', tone: '#15803d' },
  { label: 'Scans', to: '/admin/scans', icon: ScanLine, roles: ['admin'], group: 'revenue', tone: '#f59e0b', ink: DARK_INK },
];

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, string> = { passenger: '/', konduktor: '/konduktor', admin: '/admin' };

export function navFor(role: Role | null): NavItem[] {
  return role ? NAV_ITEMS.filter((item) => item.roles.includes(role)) : [];
}

/** The menu entry for the page being shown (the longest matching path), for the header's breadcrumb and title. */
export function currentNavItem(role: Role | null, pathname: string): NavItem | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  return navFor(role)
    .filter((i) => path === i.to || (i.to !== '/' && path.startsWith(i.to + '/')))
    .sort((a, b) => b.to.length - a.to.length)[0];
}
