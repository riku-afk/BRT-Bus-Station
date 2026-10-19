import type { BusService } from '@shared/tracking/models';

export type PositionRow = {
  bus_id: string;
  bus_name: string;
  plate_number: string;
  latitude: number;
  longitude: number;
  heading_degrees: number;
  speed_kmh: number;
  distance_meters: number;
  direction: 1 | -1;
  next_station_id: string | null;
  next_station_name: string | null;
  at_station: boolean;
  service: BusService;
  origin_station_id: string | null;
  origin_station_name: string | null;
  destination_station_id: string | null;
  destination_station_name: string | null;
  konduktor_name: string | null;
  trip_id: string | null;
  dispatched_at: Date | null;
  expected_departure_at: Date | null;
  planned_destination_id: string | null;
  planned_destination_name: string | null;
  updated_at: Date;
};

export type ActiveBus = { id: string; name: string };

export type ParkingRow = { bus_id: string; station_id: string | null; status: 'available' | 'on_road'; planned_destination_id?: string | null; parked_at?: Date };

export type TripRow = {
  id: string;
  bus_id: string;
  origin_station_id: string;
  destination_station_id: string;
  status: 'en_route' | 'completed' | 'cancelled';
};

/** A konduktor's own bus with its availability and trip, in one row. */
export type MyBusRow = {
  bus_id: string;
  bus_name: string;
  plate_number: string;
  bus_status: 'active' | 'inactive' | 'maintenance';
  av_status: 'available' | 'on_road' | null;
  station_id: string | null;
  station_name: string | null;
  expected_departure_at: Date | null;
  planned_destination_id: string | null;
  planned_destination_name: string | null;
  trip_id: string | null;
  trip_origin_station_id: string | null;
  trip_origin_name: string | null;
  trip_destination_station_id: string | null;
  trip_destination_name: string | null;
  trip_created_at: Date | null;
};
