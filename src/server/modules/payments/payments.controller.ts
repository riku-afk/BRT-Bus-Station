import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { pageParams } from '@lib/pagination';
import { ApiError, apiResponse } from '@lib/response';
import { toPage } from '@shared/pagination';
import { authorize } from '@middleware/auth.middleware';
import {
  AdminListQuery,
  AdminPaymentListResponse,
  MockCompleteBody,
  MockCompleteResponse,
  MockSessionResponse,
  ProviderRefParam,
} from './payments.schema';
import { paymentsService } from './payments.service';

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
    const result = await paymentsService.listForAdmin({ needsReviewOnly: query.needsReview === 'true', ...pageParams(query) });
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
