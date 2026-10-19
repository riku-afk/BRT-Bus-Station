import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { apiResponse } from '@lib/response';
import { authorize } from '@middleware/auth.middleware';
import { StatsQuery, StatsResponse } from './stats.schema';
import { statsService } from './stats.service';

const statsRoute = createRoute({
  method: 'get',
  path: '/admin/stats',
  tags: ['Admin'],
  summary: 'Sales and ticket statistics for the last 7, 14 or 30 Manila days (admin)',
  security: [{ sessionCookie: [] }],
  request: { query: StatsQuery },
  responses: { 200: { description: 'Statistics', content: { 'application/json': { schema: StatsResponse } } } },
});

export const statsController = createOpenAPIApp().openapi(statsRoute, async (c) => {
  authorize(c, 'admin');
  return c.json(apiResponse(await statsService.overview(c.req.valid('query').days ?? 14)), 200);
});
