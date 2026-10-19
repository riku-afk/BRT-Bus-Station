export const BUS_STATUSES = ['active', 'inactive', 'maintenance'] as const;
export type BusStatus = (typeof BUS_STATUSES)[number];

export type BusRow = {
  id: string;
  plate_number: string;
  name: string;
  status: BusStatus;
  konduktor_id: string | null;
  konduktor_name: string | null;
};

export type BusView = {
  id: string;
  plateNumber: string;
  name: string;
  status: BusStatus;
  konduktor: { id: string; fullName: string } | null;
};
