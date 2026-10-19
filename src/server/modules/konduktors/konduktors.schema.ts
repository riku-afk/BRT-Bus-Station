import { z } from '@hono/zod-openapi';
import { pagedResponse } from '@lib/pagination';

const fullName = z.string().trim().min(2, 'Enter the full name').max(120);
const employeeNo = z.string().trim().min(1, 'Employee number is required').max(30);
const phone = z
  .string()
  .trim()
  .max(30)
  .transform((v) => (v === '' ? null : v));
const password = z.string().min(8, 'Password must be at least 8 characters').max(72);

export const KonduktorView = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  fullName: z.string(),
  employeeNo: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  bus: z.object({ id: z.uuid(), plateNumber: z.string(), name: z.string() }).nullable(),
});

export const IdParam = z.object({ id: z.uuid() });

export const CreateKonduktorBody = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  password,
  fullName,
  employeeNo,
  phone: phone.optional(),
});

export const UpdateKonduktorBody = z
  .object({
    fullName: fullName.optional(),
    employeeNo: employeeNo.optional(),
    phone: phone.optional(),
    isActive: z.boolean().optional(),
    /** Admin password reset. */
    password: password.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const KonduktorResponse = z.object({ success: z.literal(true), data: KonduktorView, timestamp: z.string() });
export const KonduktorListResponse = pagedResponse(KonduktorView);
export const KonduktorOptionsResponse = z.object({
  success: z.literal(true),
  data: z.array(z.object({ id: z.uuid(), fullName: z.string(), isActive: z.boolean(), bus: z.object({ id: z.uuid(), name: z.string() }).nullable() })),
  timestamp: z.string(),
});
export const OkResponse = z.object({ success: z.literal(true), data: z.object({ ok: z.literal(true) }), timestamp: z.string() });
