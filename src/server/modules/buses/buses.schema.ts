import { z } from '@hono/zod-openapi';
import { pagedResponse } from '@lib/pagination';
import { BUS_STATUSES } from './buses.types';

const plate = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' ').toUpperCase())
  .pipe(z.string().min(1, 'Plate number is required').max(20));
const name = z.string().trim().min(1, 'Name is required').max(60);
const status = z.enum(BUS_STATUSES);

export const BusView = z.object({
  id: z.uuid(),
  plateNumber: z.string(),
  name: z.string(),
  status: status,
  konduktor: z.object({ id: z.uuid(), fullName: z.string() }).nullable(),
});

export const IdParam = z.object({ id: z.uuid() });

export const CreateBusBody = z.object({ plateNumber: plate, name, status: status.optional() });

export const UpdateBusBody = z
  .object({ plateNumber: plate.optional(), name: name.optional(), status: status.optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const AssignKonduktorBody = z.object({ konduktorId: z.uuid().nullable() });

export const BusResponse = z.object({ success: z.literal(true), data: BusView, timestamp: z.string() });
export const BusListResponse = pagedResponse(BusView);
export const BusOptionsResponse = z.object({
  success: z.literal(true),
  data: z.array(z.object({ id: z.uuid(), name: z.string(), plateNumber: z.string() })),
  timestamp: z.string(),
});
export const OkResponse = z.object({ success: z.literal(true), data: z.object({ ok: z.literal(true) }), timestamp: z.string() });
