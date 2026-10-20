import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { env } from '@config/env';
import type { AppEnv } from '@core/types';
import { createOpenAPIApp } from '@lib/openapi';
import { createRateLimiter } from '@lib/rate-limit';
import { ApiError, apiResponse } from '@lib/response';
import { startSession } from '@modules/auth/auth.controller';
import { pageParams, PageQuery } from '@lib/pagination';
import { TicketView } from '@modules/tickets/tickets.schema';
import { TICKET_FILTER_KEYS } from '@shared/tickets/status';
import { ssoService } from './sso.service';

// 20 attempts per client per minute, for each of the two routes: a real hand-off is one request. (Tests run from one address.)
const loginLimiter = createRateLimiter({ max: env.isTest ? 10_000 : 20, windowMs: 60_000 });
const ticketsLimiter = createRateLimiter({ max: env.isTest ? 10_000 : 20, windowMs: 60_000 });

const clientIp = (c: Context<AppEnv>) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';

/** Where the hand-off may land: the passenger map, My tickets, or one ticket. Anything else is ignored (no open redirect). */
const NEXT_ALLOWED = /^\/(tickets(\/[0-9a-f-]{36})?)?$/;
const landing = (next: string | undefined) => (next && NEXT_ALLOWED.test(next) ? next : '/');

const loginRoute = createRoute({
  method: 'get',
  path: '/sso/login',
  tags: ['SSO'],
  summary: 'Sign in with a one-time token from the partner system, then go to the passenger pages',
  request: { query: z.object({ token: z.string().min(20).max(4000), next: z.string().max(100).optional() }) },
  responses: { 302: { description: 'Redirect to the passenger pages, or to the sign-in page when the token is refused' } },
});

const TicketPageResponse = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(TicketView),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
    /** How many tickets there are under each filter, for the tabs of a list. */
    counts: z.object({ all: z.number().int(), pay: z.number().int(), ready: z.number().int(), transactions: z.number().int() }),
  }),
  timestamp: z.string(),
});

const ticketsRoute = createRoute({
  method: 'get',
  path: '/partner/tickets',
  tags: ['SSO'],
  summary: 'One page (10 by default) of one citizen\'s tickets, newest first, for the partner backend (Bearer: a server-to-server token). No QR codes.',
  request: { query: PageQuery.extend({ filter: z.enum(TICKET_FILTER_KEYS).optional() }) },
  responses: { 200: { description: 'A page of tickets', content: { 'application/json': { schema: TicketPageResponse } } } },
});

export const ssoController = createOpenAPIApp()
  .openapi(loginRoute, async (c) => {
    const { token, next } = c.req.valid('query');
    if (!loginLimiter.hit(clientIp(c)).allowed) return c.redirect('/login?sso=failed', 302);
    try {
      const user = await ssoService.signIn(token);
      await startSession(c, user.id);
      return c.redirect(landing(next), 302);
    } catch (e) {
      // A refused link is a normal event (it expired, or was opened twice), not an error page: send the person to sign in.
      if (e instanceof ApiError && e.statusCode === 404) throw e; // SSO switched off: behave as if the route does not exist
      return c.redirect('/login?sso=failed', 302);
    }
  })
  .openapi(ticketsRoute, async (c) => {
    if (!ticketsLimiter.hit(clientIp(c)).allowed) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests');
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw ApiError.unauthorized();
    const q = c.req.valid('query');
    return c.json(apiResponse(await ssoService.ticketsFor(token, { filter: q.filter ?? 'all', ...pageParams(q) })), 200);
  })
  // The QR image is a PNG, not a JSON envelope, so it is a plain route. Only a PAID ticket of the citizen in the token has one.
  .get('/partner/tickets/:id/qr.png', async (c) => {
    if (!ticketsLimiter.hit(clientIp(c)).allowed) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests');
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw ApiError.unauthorized();
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) throw ApiError.notFound('Ticket not found');
    const png = await ssoService.qrFor(token, id.data);
    return c.body(new Uint8Array(png), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="ticket-qr.png"' });
  });
