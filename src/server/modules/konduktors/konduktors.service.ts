/** Konduktor accounts: an auth user (role konduktor) plus a profile, managed by admins (KON-01..03). */
import { getDb, transaction, type SQLExecutor } from '@core/database';
import { ApiError } from '@lib/response';
import { clampPage, offsetOf, toPage, type Page } from '@shared/pagination';
import { authService } from '@modules/auth';
import { busesRepository } from '@modules/buses';
import { konduktorsRepository } from './konduktors.repository';
import type { KonduktorRow, KonduktorView } from './konduktors.types';

export function toKonduktorView(row: KonduktorRow): KonduktorView {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    employeeNo: row.employee_no,
    phone: row.phone,
    isActive: row.is_active,
    bus: row.bus_id ? { id: row.bus_id, plateNumber: row.bus_plate ?? '', name: row.bus_name ?? '' } : null,
  };
}

const code = (err: unknown) => (err as { code?: string }).code;
const employeeTaken = (no: string) => ApiError.conflict(`Employee number ${no} is already in use`);

export const konduktorsService = {
  async list(query: { page: number; pageSize: number }, db: SQLExecutor = getDb()): Promise<Page<KonduktorView>> {
    const total = await konduktorsRepository.count(db);
    const page = clampPage(query.page, total, query.pageSize);
    const rows = await konduktorsRepository.list(db, { limit: query.pageSize, offset: offsetOf(page, query.pageSize) });
    return toPage(rows.map(toKonduktorView), total, page, query.pageSize);
  },

  async options(db: SQLExecutor = getDb()): Promise<{ id: string; fullName: string; isActive: boolean; bus: { id: string; name: string } | null }[]> {
    return (await konduktorsRepository.options(db)).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      isActive: r.is_active,
      bus: r.bus_id && r.bus_name ? { id: r.bus_id, name: r.bus_name } : null,
    }));
  },

  async get(id: string, db: SQLExecutor = getDb()): Promise<KonduktorView> {
    const row = await konduktorsRepository.findById(db, id);
    if (!row) throw ApiError.notFound('Konduktor not found');
    return toKonduktorView(row);
  },

  /** KON-03: the signed-in konduktor's own profile and bus. */
  async me(userId: string): Promise<KonduktorView> {
    const row = await konduktorsRepository.findByUserId(getDb(), userId);
    if (!row) throw ApiError.notFound('No konduktor profile for this account');
    return toKonduktorView(row);
  },

  async create(input: { email: string; password: string; fullName: string; employeeNo: string; phone?: string | null }): Promise<KonduktorView> {
    const id = await transaction(async (tx) => {
      const user = await authService.createUser(
        { email: input.email, password: input.password, fullName: input.fullName, role: 'konduktor' },
        tx,
      );
      try {
        return await konduktorsRepository.insert(tx, { userId: user.id, employeeNo: input.employeeNo, phone: input.phone ?? null });
      } catch (err) {
        if (code(err) === '23505') throw employeeTaken(input.employeeNo);
        throw err;
      }
    });
    return konduktorsService.get(id);
  },

  async update(
    id: string,
    patch: { fullName?: string; employeeNo?: string; phone?: string | null; isActive?: boolean; password?: string },
  ): Promise<KonduktorView> {
    await transaction(async (tx) => {
      const row = await konduktorsRepository.findById(tx, id);
      if (!row) throw ApiError.notFound('Konduktor not found');
      try {
        await konduktorsRepository.update(tx, id, { employeeNo: patch.employeeNo, phone: patch.phone });
      } catch (err) {
        if (code(err) === '23505') throw employeeTaken(patch.employeeNo ?? row.employee_no);
        throw err;
      }
      if (patch.fullName !== undefined || patch.isActive !== undefined || patch.password !== undefined) {
        await authService.updateUser(tx, row.user_id, { fullName: patch.fullName, isActive: patch.isActive, password: patch.password });
      }
      // A deactivated konduktor cannot work, so they leave their bus.
      if (patch.isActive === false) await busesRepository.unassignKonduktor(tx, id);
    });
    return konduktorsService.get(id);
  },

  async remove(id: string): Promise<void> {
    await transaction(async (tx) => {
      const row = await konduktorsRepository.findById(tx, id);
      if (!row) throw ApiError.notFound('Konduktor not found');
      try {
        await konduktorsRepository.delete(tx, id);
        await authService.deleteUser(tx, row.user_id);
      } catch (err) {
        // Scan records reference konduktors (from P6): keep the history, deactivate instead.
        if (code(err) === '23503') throw ApiError.conflict('This konduktor has scan history. Deactivate them instead of deleting.');
        throw err;
      }
    });
  },
};
