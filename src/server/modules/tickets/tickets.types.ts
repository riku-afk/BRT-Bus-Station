import type { TicketStatus } from '@shared/tickets/status';

export type TicketRow = {
  id: string;
  reference_code: string;
  passenger_id: string;
  origin_station_id: string;
  origin_name: string;
  destination_station_id: string;
  destination_name: string;
  fare_centavos: number;
  status: TicketStatus;
  valid_until: Date;
  paid_at: Date | null;
  used_at: Date | null;
  created_at: Date;
  /** The bus the ticket was bought on, when it was bought on one. */
  bus_id: string | null;
  bus_name: string | null;
  quantity: number;
};

/** A ticket sold over the counter by an admin (update 018), with who it was sold to and who sold it. */
export type ManualTicketRow = TicketRow & { passenger_name: string | null; encoded_by_name: string | null };

/** A ticket as the API returns it. Bought on a bus, it is for that bus only (SCN-09); `busId` is null for a ticket with no bus. */
export type TicketView = {
  id: string;
  referenceCode: string;
  originStationId: string;
  originName: string;
  destinationStationId: string;
  destinationName: string;
  /** The total for everyone on the ticket (the amount that is paid). */
  fareCentavos: number;
  /** How many passengers the ticket admits: one QR code, scanned once, admits all of them. */
  quantity: number;
  status: TicketStatus;
  validUntil: string;
  paidAt: string | null;
  usedAt: string | null;
  createdAt: string;
  busId: string | null;
  busName: string | null;
  /** While awaiting payment: when the ticket expires if it is not paid. */
  payBeforeAt: string | null;
};

export type ManualTicketView = TicketView & { passengerName: string | null; encodedByName: string | null };
