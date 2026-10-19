import type { ScanReason, ScanResult } from '@shared/scans/models';

/** The signed-in konduktor and the bus they have at this moment (SCN-07: the bus may be null). */
export type ScannerRow = { konduktor_id: string; konduktor_name: string; bus_id: string | null };

export type ScanRow = {
  id: string;
  result: ScanResult;
  reason: ScanReason | null;
  scanned_at: Date;
  reference_code: string | null;
  origin_name: string | null;
  destination_name: string | null;
  bus_name: string | null;
  quantity: number | null;
};

export type AdminScanRow = ScanRow & { konduktor_id: string; konduktor_name: string; bus_id: string | null };

/** What a scan found: enough to decide the result, and the ticket details the konduktor is allowed to see. */
export type ScannedTicket = {
  id: string;
  origin_station_id: string;
  bus_id: string | null;
  bus_name: string | null;
  status: 'pending_payment' | 'paid' | 'used' | 'expired' | 'cancelled';
  reference_code: string;
  origin_name: string;
  destination_name: string;
  fare_centavos: number;
  quantity: number;
  used_at: Date | null;
  /** Paid, but its day has ended (only read from the locked row; a re-read does not need it). */
  lapsed?: boolean;
};
