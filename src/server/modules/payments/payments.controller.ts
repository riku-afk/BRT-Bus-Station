import { createRoute, z } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { pageParams } from '@lib/pagination';
import { ApiError, apiResponse } from '@lib/response';
import { toPage } from '@shared/pagination';
import { authorize } from '@middleware/auth.middleware';
import {
  AdminFilterQuery,
  AdminListQuery,
  AdminPaymentListResponse,
  AdminReportResponse,
  MockCompleteBody,
  MockCompleteResponse,
  MockSessionResponse,
  ProviderRefParam,
} from './payments.schema';
import { paymentsService } from './payments.service';
import type { PaymentAdminFilter } from './payments.types';

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });
const security = [{ sessionCookie: [] }];

const mockSessionRoute = createRoute({
  method: 'get',
  path: '/payments/mock/sessions/{ref}',
  tags: ['Payments'],
  summary: 'Demo payment page: what is being paid (mock provider only)',
  request: { params: ProviderRefParam },
  responses: { 200: { description: 'Session', ...json(MockSessionResponse) } },
});

const mockCompleteRoute = createRoute({
  method: 'post',
  path: '/payments/mock/sessions/{ref}/complete',
  tags: ['Payments'],
  summary: 'Demo payment page: press Pay or Fail. Sends a signed webhook through the real webhook path (mock provider only).',
  request: { params: ProviderRefParam, body: { ...json(MockCompleteBody), required: true } },
  responses: { 200: { description: 'Result', ...json(MockCompleteResponse) } },
});

const listRoute = createRoute({
  method: 'get',
  path: '/payments',
  tags: ['Payments'],
  summary: 'Recent payments; needsReview=true shows money that could not be applied to a ticket (admin)',
  security,
  request: { query: AdminListQuery },
  responses: { 200: { description: 'Payments', ...json(AdminPaymentListResponse) } },
});

const reportRoute = createRoute({
  method: 'get',
  path: '/payments/report',
  tags: ['Payments'],
  summary: 'Totals of the filtered payments, by status, method and Manila day (admin)',
  security,
  request: { query: AdminFilterQuery },
  responses: { 200: { description: 'Report', ...json(AdminReportResponse) } },
});

const exportRoute = createRoute({
  method: 'get',
  path: '/payments/export.csv',
  tags: ['Payments'],
  summary: 'The filtered payments as a CSV file, newest first (admin)',
  security,
  request: { query: AdminFilterQuery },
  responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: z.string() } } } },
});

/** The query's filter fields, as the service takes them. `needsReview=true` is the older way to ask for status=needs_review. */
function filterOf(q: z.infer<typeof AdminFilterQuery>): PaymentAdminFilter {
  return {
    status: q.status ?? (q.needsReview === 'true' ? 'needs_review' : undefined),
    provider: q.provider,
    method: q.method,
    from: q.from,
    to: q.to,
    q: q.q,
  };
}

/** `payments-2026-11-01_to_2026-11-11.csv`, named after the dates asked for. */
function exportFileName(f: PaymentAdminFilter): string {
  const range = f.from || f.to ? `${f.from ?? 'start'}_to_${f.to ?? 'today'}` : 'all';
  return `payments-${range}${f.status ? `-${f.status}` : ''}.csv`;
}

/** Webhook bodies are small JSON events; refuse anything bigger before reading further. */
const MAX_WEBHOOK_BYTES = 64 * 1024;

export const paymentsController = createOpenAPIApp()
  .openapi(mockSessionRoute, async (c) => c.json(apiResponse(await paymentsService.getMockSession(c.req.valid('param').ref)), 200))
  .openapi(mockCompleteRoute, async (c) => {
    const { outcome, method } = c.req.valid('json');
    return c.json(apiResponse(await paymentsService.completeMockSession(c.req.valid('param').ref, outcome, method)), 200);
  })
  .openapi(listRoute, async (c) => {
    authorize(c, 'admin');
    const query = c.req.valid('query');
    const result = await paymentsService.listForAdmin(filterOf(query), pageParams(query));
    return c.json(
      apiResponse(
        toPage(
        result.rows.map((r) => ({
          id: r.id,
          ticketId: r.ticket_id,
          referenceCode: r.reference_code,
          originName: r.origin_name,
          destinationName: r.destination_name,
          provider: r.provider,
          method: r.method,
          amountCentavos: r.amount_centavos,
          status: r.status,
          reviewReason: r.review_reason,
          createdAt: r.created_at.toISOString(),
          updatedAt: r.updated_at.toISOString(),
        })),
        result.total,
        result.page,
        result.pageSize,
        ),
      ),
      200,
    );
  })
  .openapi(reportRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await paymentsService.reportForAdmin(filterOf(c.req.valid('query')))), 200);
  })
  .openapi(exportRoute, async (c) => {
    authorize(c, 'admin');
    const filter = filterOf(c.req.valid('query'));
    const { csv, rows, truncated } = await paymentsService.exportCsv(filter);
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(filter)}"`,
      'Cache-Control': 'private, no-store',
      'X-Export-Rows': String(rows),
      'X-Export-Truncated': String(truncated),
    });
  })
  /**
   * The webhook. Not session-authenticated and not in the OpenAPI document: a provider calls it, and it proves itself
   * by signature over the RAW body. Always answers 2xx for a genuine event (including replays and ignored events) so
   * providers stop retrying; 401 for a bad signature. The body is never logged.
   */
  .post('/payments/webhook/:provider', async (c) => {
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > MAX_WEBHOOK_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Webhook body is too large');
    const raw = await c.req.text();
    if (raw.length > MAX_WEBHOOK_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Webhook body is too large');
    const result = await paymentsService.processWebhook(c.req.param('provider'), raw, c.req.raw.headers);
    return c.json(apiResponse({ received: true, outcome: result.outcome }), 200);
  });
