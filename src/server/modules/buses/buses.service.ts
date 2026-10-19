/** Bus rules: unique plates, one konduktor per bus and one bus per konduktor (BUS-01..03). */
import { getDb, transaction, type SQLExecutor } from '@core/database';
import { ApiError } from '@lib/response';
import { clampPage, offsetOf, toPage, type Page } from '@shared/pagination';
import { busesRepository } from './buses.repository';
import type { BusRow, BusStatus, BusView } from './buses.types';

export function toBusView(row: BusRow): BusView {
  return {
    id: row.id,
    plateNumber: row.plate_number,
    name: row.name,
    status: row.status,
    konduktor: row.konduktor_id ? { id: row.konduktor_id, fullName: row.konduktor_name ?? '' } : null,
  };
}

const code = (err: unknown) => (err as { code?: string }).code;

export const busesService = {
  async list(query: { page: number; pageSize: number }, db: SQLExecutor = getDb()): Promise<Page<BusView>> {
    const total = await busesRepository.count(db);
    const page = clampPage(query.page, total, query.pageSize);
    const rows = await busesRepository.list(db, { limit: query.pageSize, offset: offsetOf(page, query.pageSize) });
    return toPage(rows.map(toBusView), total, page, query.pageSize);
  },

  async options(db: SQLExecutor = getDb()): Promise<{ id: string; name: string; plateNumber: string }[]> {
    return (await busesRepository.options(db)).map((r) => ({ id: r.id, name: r.name, plateNumber: r.plate_number }));
  },

  async get(id: string, db: SQLExecutor = getDb()): Promise<BusView> {
    const row = await busesRepository.findById(db, id);
    if (!row) throw ApiError.notFound('Bus not found');
    return toBusView(row);
  },

  async create(input: { plateNumber: string; name: string; status?: BusStatus }): Promise<BusView> {
    try {
      const id = await busesRepository.insert(getDb(), { ...input, status: input.status ?? 'active' });
      return busesService.get(id);
    } catch (err) {
      if (code(err) === '23505') throw ApiError.conflict(`A bus with plate ${input.plateNumber} already exists`);
      throw err;
    }
  },

  async update(id: string, patch: { plateNumber?: string; name?: string; status?: BusStatus }): Promise<BusView> {
    try {
      if (!(await busesRepository.update(getDb(), id, patch))) throw ApiError.notFound('Bus not found');
    } catch (err) {
      if (code(err) === '23505') throw ApiError.conflict(`A bus with plate ${patch.plateNumber} already exists`);
      throw err;
    }
    return busesService.get(id);
  },

  async remove(id: string): Promise<void> {
    try {
      if (!(await busesRepository.delete(getDb(), id))) throw ApiError.notFound('Bus not found');
    } catch (err) {
      // Scan records reference buses (from P6): keep history, set the bus to inactive instead.
      if (code(err) === '23503') throw ApiError.conflict('This bus has scan history. Set it to inactive instead of deleting it.');
      throw err;
    }
  },

  /** `konduktorId = null` unassigns. A konduktor already on another bus must be unassigned there first. */
  async assignKonduktor(busId: string, konduktorId: string | null): Promise<BusView> {
    await transaction(async (tx) => {
      const bus = await busesRepository.findById(tx, busId);
      if (!bus) throw ApiError.notFound('Bus not found');
      if (konduktorId === null) {
        await busesRepository.setKonduktor(tx, busId, null);
        return;
      }
      const rows = await tx.query<{ is_active: boolean; full_name: string }>(
        'SELECT u.is_active, u.full_name FROM konduktors k JOIN users u ON u.id = k.user_id WHERE k.id = $1',
        [konduktorId],
      );
      const konduktor = rows[0];
      if (!konduktor) throw ApiError.notFound('Konduktor not found');
      if (!konduktor.is_active) throw ApiError.badRequest(`${konduktor.full_name} is deactivated and cannot be assigned`);
      const current = await busesRepository.findByKonduktor(tx, konduktorId);
      if (current && current.id !== busId) {
        throw ApiError.conflict(`${konduktor.full_name} is already assigned to ${current.name} (${current.plate_number}). Unassign them there first.`);
      }
      await busesRepository.setKonduktor(tx, busId, konduktorId);
    });
    return busesService.get(busId);
  },
};
