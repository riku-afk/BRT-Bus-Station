import { z } from '@hono/zod-openapi';
import { ADMIN_PAGE_SIZE, MAX_PAGE_SIZE } from '@shared/pagination';

/** `?page=2&pageSize=10`. Defaults to the first page of 10; nobody can ask for more than 50 rows at once. */
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export const pageParams = (q: { page?: number; pageSize?: number }, defaultSize = ADMIN_PAGE_SIZE) => ({ page: q.page ?? 1, pageSize: q.pageSize ?? defaultSize });

/** The response shape of a paged list, for an item schema. */
export const pagedResponse = <T extends z.ZodType>(item: T) =>
  z.object({
    success: z.literal(true),
    data: z.object({ items: z.array(item), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), totalPages: z.number().int() }),
    timestamp: z.string(),
  });
