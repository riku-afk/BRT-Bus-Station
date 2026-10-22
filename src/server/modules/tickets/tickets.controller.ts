import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { pageParams, PageQuery, pagedResponse } from '@lib/pagination';
import { apiResponse } from '@lib/response';
import { authorize } from '@middleware/auth.middleware';
import { paymentsService } from '@modules/payments/payments.service';
import {
  CheckoutResponse,
  CreateTicketBody,
  EmailSentResponse,
  IdParam,
  ManualTicketBody,
  ManualTicketResponse,
  ManualTicketView,
  PaymentStatusResponse,
  TicketListResponse,
  TicketResponse,
} from './tickets.schema';
import { ticketsService } from './tickets.service';

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });
const security = [{ sessionCookie: [] }];

const createTicketRoute = createRoute({
  method: 'post',
  path: '/tickets',
  tags: ['Tickets'],
  summary: 'Create a ticket awaiting payment, on a bus waiting at a shelter ({busId}) or between two stations; the fare is computed on the server (passenger)',
  security,
  request: { body: { ...json(CreateTicketBody), required: true } },
  responses: { 201: { description: 'Created', ...json(TicketResponse) } },
});
const mineRoute = createRoute({
  method: 'get',
  path: '/tickets/mine',
  tags: ['Tickets'],
  summary: 'My tickets, newest first (passenger)',
  security,
  responses: { 200: { description: 'Tickets', ...json(TicketListResponse) } },
});
const getRoute = createRoute({
  method: 'get',
  path: '/tickets/{id}',
  tags: ['Tickets'],
  summary: 'One of my tickets; the return page polls this until it is paid (passenger)',
  security,
  request: { params: IdParam },
  responses: { 200: { description: 'Ticket', ...json(TicketResponse) } },
});
const cancelRoute = createRoute({
  method: 'post',
  path: '/tickets/{id}/cancel',
  tags: ['Tickets'],
  summary: 'Cancel a ticket I have not paid for (passenger)',
  security,
  request: { params: IdParam },
  responses: { 200: { description: 'Cancelled', ...json(TicketResponse) } },
});
const checkoutRoute = createRoute({
  method: 'post',
  path: '/tickets/{id}/checkout',
  tags: ['Tickets'],
  summary: 'Start paying for a ticket: returns where to send the passenger. Does NOT mark it paid.',
  security,
  request: { params: IdParam },
  responses: { 200: { description: 'Checkout', ...json(CheckoutResponse) } },
});

const emailRoute = createRoute({
  method: 'post',
  path: '/tickets/{id}/email',
  tags: ['Tickets'],
  summary: 'Email me this paid ticket again (own ticket; at most once a minute)',
  security,
  request: { params: IdParam },
  responses: { 200: { description: 'Sent', ...json(EmailSentResponse) } },
});

const paymentRoute = createRoute({
  method: 'get',
  path: '/tickets/{id}/payment',
  tags: ['Tickets'],
  summary: "Where this ticket's payment stands; while it is open this also checks with the payment provider (own ticket)",
  security,
  request: { params: IdParam },
  responses: { 200: { description: 'Payment status', ...json(PaymentStatusResponse) } },
});

const manualCreateRoute = createRoute({
  method: 'post',
  path: '/manual-tickets',
  tags: ['Tickets'],
  summary: 'Sell a ticket over the counter: created paid, with the fare from the stations (admin)',
  security,
  request: { body: { ...json(ManualTicketBody), required: true } },
  responses: { 201: { description: 'Created and paid', ...json(ManualTicketResponse) } },
});
const manualListRoute = createRoute({
  method: 'get',
  path: '/manual-tickets',
  tags: ['Tickets'],
  summary: 'The tickets sold over the counter, newest first, 10 a page (admin)',
  security,
  request: { query: PageQuery },
  responses: { 200: { description: 'A page of manual tickets', ...json(pagedResponse(ManualTicketView)) } },
});

export const ticketsController = createOpenAPIApp()
  .openapi(manualCreateRoute, async (c) => {
    const auth = authorize(c, 'admin');
    const body = c.req.valid('json');
    const ticket = await ticketsService.createManual({
      adminId: auth.user.id,
      originId: body.originId,
      destinationId: body.destinationId,
      quantity: body.quantity,
      passengerName: body.passengerName || null,
    });
    return c.json(apiResponse(ticket), 201);
  })
  .openapi(manualListRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await ticketsService.listManual(pageParams(c.req.valid('query')))), 200);
  })
  .openapi(createTicketRoute, async (c) => {
    const auth = authorize(c, 'passenger');
    const body = c.req.valid('json');
    const ticket =
      'busId' in body
        ? await ticketsService.createForBus({ passengerId: auth.user.id, busId: body.busId, quantity: body.quantity })
        : await ticketsService.create({ passengerId: auth.user.id, originId: body.originId, destinationId: body.destinationId, quantity: body.quantity });
    return c.json(apiResponse(ticket), 201);
  })
  // Registered before /tickets/{id} so "mine" is never read as an id.
  .openapi(mineRoute, async (c) => {
    const auth = authorize(c, 'passenger');
    return c.json(apiResponse(await ticketsService.listMine(auth.user.id)), 200);
  })
  .openapi(getRoute, async (c) => {
    const auth = authorize(c, 'passenger');
    return c.json(apiResponse(await ticketsService.getMine(auth.user.id, c.req.valid('param').id)), 200);
  })
  .openapi(cancelRoute, async (c) => {
    const auth = authorize(c, 'passenger');
    return c.json(apiResponse(await ticketsService.cancelMine(auth.user.id, c.req.valid('param').id)), 200);
  })
  .openapi(checkoutRoute, async (c) => {
    const auth = authorize(c, 'passenger');
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || '';
    return c.json(apiResponse(await paymentsService.createCheckout(c.req.valid('param').id, auth.user.id, ip)), 200);
  })
  .openapi(emailRoute, async (c) => {
    const auth = authorize(c, 'passenger');
    return c.json(apiResponse(await ticketsService.emailMine(auth.user.id, c.req.valid('param').id)), 200);
  })
  .openapi(paymentRoute, async (c) => {
    const auth = authorize(c, 'passenger');
    return c.json(apiResponse(await paymentsService.paymentStatus(c.req.valid('param').id, auth.user.id)), 200);
  })
  // The QR image is a PNG, not a JSON envelope, so it is a plain route (like the live stream) rather than an OpenAPI one.
  .get('/tickets/:id/qr.png', async (c) => {
    const auth = authorize(c, 'passenger');
    const { id } = IdParam.parse({ id: c.req.param('id') });
    const png = await ticketsService.qrFor(auth.user.id, id);
    return c.body(new Uint8Array(png), 200, {
      'Content-Type': 'image/png',
      // Private to this passenger; never cached by a shared cache.
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="ticket-qr.png"',
    });
  })
  // The QR Ph code to pay with (PisoPay's code carrying the QR Ph logo), only while the ticket is awaiting payment.
  .get('/tickets/:id/payment-qr.png', async (c) => {
    const auth = authorize(c, 'passenger');
    const { id } = IdParam.parse({ id: c.req.param('id') });
    const png = await paymentsService.paymentQr(id, auth.user.id);
    return c.body(new Uint8Array(png), 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="pay-qrph.png"',
    });
  })
  // The QR of a manual ticket as a PNG (a plain route, like the passenger's).
  .get('/manual-tickets/:id/qr.png', async (c) => {
    authorize(c, 'admin');
    const { id } = IdParam.parse({ id: c.req.param('id') });
    const png = await ticketsService.manualQr(id);
    return c.body(new Uint8Array(png), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="ticket-qr.png"' });
  });
