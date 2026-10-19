import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { pageParams } from '@lib/pagination';
import { apiResponse } from '@lib/response';
import { HISTORY_PAGE_SIZE } from '@shared/pagination';
import { authorize } from '@middleware/auth.middleware';
import { AdminQuery, AdminResponse, HistoryQuery, HistoryResponse, ScanBody, ScanResponse } from './scans.schema';
import { scansService } from './scans.service';

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });
const security = [{ sessionCookie: [] }];

const scanRoute = createRoute({
  method: 'post',
  path: '/scans',
  tags: ['Scans'],
  summary: 'Check a ticket: its QR token, or its reference code as a fallback. The result is in the body (konduktor)',
  security,
  request: { body: { ...json(ScanBody), required: true } },
  responses: { 200: { description: 'Scan result', ...json(ScanResponse) } },
});

const historyRoute = createRoute({
  method: 'get',
  path: '/scans/mine',
  tags: ['Scans'],
  summary: 'My scans grouped by day, today first, with a count per day (konduktor)',
  security,
  request: { query: HistoryQuery },
  responses: { 200: { description: 'History', ...json(HistoryResponse) } },
});

const adminRoute = createRoute({
  method: 'get',
  path: '/scans',
  tags: ['Scans'],
  summary: 'Scan log, filterable by konduktor, bus, day and result (admin)',
  security,
  request: { query: AdminQuery },
  responses: { 200: { description: 'Scans', ...json(AdminResponse) } },
});

export const scansController = createOpenAPIApp()
  // The konduktor is always the signed-in one; no request field can name a different konduktor or bus (GEN-05).
  .openapi(scanRoute, async (c) => {
    const auth = authorize(c, 'konduktor');
    return c.json(apiResponse(await scansService.scan(auth.user.id, c.req.valid('json'))), 200);
  })
  // Registered before the admin list so "mine" is never mistaken for anything else.
  .openapi(historyRoute, async (c) => {
    const auth = authorize(c, 'konduktor');
    const q = c.req.valid('query');
    return c.json(apiResponse(await scansService.history(auth.user.id, { days: q.days, ...pageParams(q, HISTORY_PAGE_SIZE) })), 200);
  })
  .openapi(adminRoute, async (c) => {
    authorize(c, 'admin');
    const q = c.req.valid('query');
    return c.json(apiResponse(await scansService.adminList({ konduktorId: q.konduktorId, busId: q.busId, date: q.date, result: q.result, ...pageParams(q) })), 200);
  });
