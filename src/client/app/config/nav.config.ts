/**
 * Role-driven menu. The UI uses it for convenience only — the server enforces roles.
 * Add an entry here when a role gets a new page (route lives in app/router.tsx).
 */
import type { LucideIcon } from 'lucide-react';
import { Bus, ClipboardList, History, MapPin, ScanLine, CreditCard, Radio, Settings, Tag, Ticket, Users } from 'lucide-react';
import type { Role } from '@shared/rbac/roles';

export type NavItem = { label: string; to: string; icon: LucideIcon; roles: readonly Role[] };

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Map', to: '/', icon: Bus, roles: ['passenger'] },
  { label: 'My tickets', to: '/tickets', icon: Ticket, roles: ['passenger'] },
  { label: 'My bus', to: '/konduktor', icon: ScanLine, roles: ['konduktor'] },
  { label: 'Scan', to: '/konduktor/scan', icon: ScanLine, roles: ['konduktor'] },
  { label: 'History', to: '/konduktor/history', icon: History, roles: ['konduktor'] },
  { label: 'Admin', to: '/admin', icon: Settings, roles: ['admin'] },
  { label: 'Live map', to: '/admin/live', icon: Radio, roles: ['admin'] },
  { label: 'Stations', to: '/admin/stations', icon: MapPin, roles: ['admin'] },
  { label: 'Buses', to: '/admin/buses', icon: Bus, roles: ['admin'] },
  { label: 'Konduktors', to: '/admin/konduktors', icon: Users, roles: ['admin'] },
  { label: 'Fares', to: '/admin/fares', icon: Tag, roles: ['admin'] },
  { label: 'Payments', to: '/admin/payments', icon: CreditCard, roles: ['admin'] },
  { label: 'Scans', to: '/admin/scans', icon: ScanLine, roles: ['admin'] },
  { label: 'Map', to: '/', icon: ClipboardList, roles: ['admin'] },
];

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, string> = { passenger: '/', konduktor: '/konduktor', admin: '/admin' };

export function navFor(role: Role | null): NavItem[] {
  return role ? NAV_ITEMS.filter((item) => item.roles.includes(role)) : [];
}
