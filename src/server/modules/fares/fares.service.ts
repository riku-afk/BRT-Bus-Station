/**
 * Fare quotes and admin fare management (FARE-01..04). The fare is always computed here, on the server; tickets (P5)
 * freeze the result and the client never sends a fare. Changing settings or overrides never touches existing tickets.
 */
import { getDb, type SQLExecutor } from '@core/database';
import { ApiError } from '@lib/response';
import { computeFareCentavos, stationsTravelled } from '@shared/fares/fare';
import { faresRepository } from './fares.repository';
import type { FareOverrideView, FareQuote, FareSettings, OverrideRow } from './fares.types';

function toOverrideView(row: OverrideRow, sequences: Map<string, number>): FareOverrideView {
  // Present the pair with the station nearer the start of the line first.
  const aFirst = (sequences.get(row.station_a_id) ?? 0) <= (sequences.get(row.station_b_id) ?? 0);
  return aFirst
    ? { originId: row.station_a_id, destinationId: row.station_b_id, originName: row.station_a_name, destinationName: row.station_b_name, fareCentavos: row.fare_centavos }
    : { originId: row.station_b_id, destinationId: row.station_a_id, originName: row.station_b_name, destinationName: row.station_a_name, fareCentavos: row.fare_centavos };
}

export const faresService = {
  async quote(originId: string, destinationId: string, db: SQLExecutor = getDb()): Promise<FareQuote> {
    if (originId === destinationId) throw ApiError.badRequest('Origin and destination must be different stations');

    const stations = await faresRepository.findStations(db, [originId, destinationId]);
    const origin = stations.find((s) => s.id === originId);
    const destination = stations.find((s) => s.id === destinationId);
    if (!origin || !destination) throw ApiError.notFound('Station not found');
    if (!origin.is_active || !destination.is_active) throw ApiError.badRequest('This station is not in service');

    const settings = await faresRepository.getSettings(db);
    if (!settings) throw new Error('fare_settings row is missing — run db:migrate');

    const override = await faresRepository.findOverride(db, originId, destinationId);
    const computed = computeFareCentavos(
      { baseFareCentavos: settings.base_fare_centavos, perStationCentavos: settings.per_station_centavos },
      origin.sequence,
      destination.sequence,
    );
    return {
      originId,
      destinationId,
      stationsTravelled: stationsTravelled(origin.sequence, destination.sequence),
      fareCentavos: override ?? computed,
      source: override === null ? 'computed' : 'override',
    };
  },

  async getSettings(db: SQLExecutor = getDb()): Promise<FareSettings> {
    const row = await faresRepository.getSettings(db);
    if (!row) throw new Error('fare_settings row is missing — run db:migrate');
    return { baseFareCentavos: row.base_fare_centavos, perStationCentavos: row.per_station_centavos };
  },

  async saveSettings(input: FareSettings): Promise<FareSettings> {
    await faresRepository.saveSettings(getDb(), input);
    return faresService.getSettings();
  },

  async listOverrides(db: SQLExecutor = getDb()): Promise<FareOverrideView[]> {
    const rows = await faresRepository.listOverrides(db);
    const ids = [...new Set(rows.flatMap((r) => [r.station_a_id, r.station_b_id]))];
    const sequences = new Map((await faresRepository.findStations(db, ids)).map((s) => [s.id, s.sequence]));
    return rows.map((r) => toOverrideView(r, sequences));
  },

  async setOverride(originId: string, destinationId: string, fareCentavos: number): Promise<FareOverrideView[]> {
    if (originId === destinationId) throw ApiError.badRequest('Choose two different stations');
    const found = await faresRepository.findStations(getDb(), [originId, destinationId]);
    if (found.length !== 2) throw ApiError.notFound('Station not found');
    await faresRepository.upsertOverride(getDb(), originId, destinationId, fareCentavos);
    return faresService.listOverrides();
  },

  async removeOverride(originId: string, destinationId: string): Promise<FareOverrideView[]> {
    if (!(await faresRepository.deleteOverride(getDb(), originId, destinationId))) throw ApiError.notFound('No fixed fare is set for this pair');
    return faresService.listOverrides();
  },
};
