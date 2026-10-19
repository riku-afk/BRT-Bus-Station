import { createRoute } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { createOpenAPIApp } from '@lib/openapi';
import { apiResponse } from '@lib/response';
import { authorize } from '@middleware/auth.middleware';
import {
  AvailabilityResponse,
  DepartureBody,
  DestinationBody,
  DispatchBody,
  DispatchResultResponse,
  MyBusResponse,
  TrackingSnapshotResponse,
  WorkerStatusResponse,
} from './tracking.schema';
import { trackingHub } from './tracking.hub';
import { snapshotFor, trackingService } from './tracking.service';

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });
const security = [{ sessionCookie: [] }];

const busesRoute = createRoute({
  method: 'get',
  path: '/tracking/buses',
  tags: ['Tracking'],
  summary: 'Current position of every bus in service, with where each run started and ends (public)',
  responses: { 200: { description: 'Positions', ...json(TrackingSnapshotResponse) } },
});

const statusRoute = createRoute({
  method: 'get',
  path: '/tracking/status',
  tags: ['Tracking'],
  summary: 'Whether the simulator worker is running (public)',
  responses: { 200: { description: 'Status', ...json(WorkerStatusResponse) } },
});

const availabilityRoute = createRoute({
  method: 'get',
  path: '/tracking/availability',
  tags: ['Tracking'],
  summary: 'Buses waiting at each station right now, with their konduktor and expected departure (public)',
  responses: { 200: { description: 'Buses available per station', ...json(AvailabilityResponse) } },
});

const myBusRoute = createRoute({
  method: 'get',
  path: '/tracking/my-bus',
  tags: ['Tracking'],
  summary: "The signed-in konduktor's own bus: where it is and what they can do (konduktor)",
  security,
  responses: { 200: { description: 'My bus', ...json(MyBusResponse) } },
});

const departureRoute = createRoute({
  method: 'put',
  path: '/tracking/my-bus/departure',
  tags: ['Tracking'],
  summary: 'Say roughly when my parked bus leaves, in minutes from now; null clears it (konduktor)',
  security,
  request: { body: { ...json(DepartureBody), required: true } },
  responses: { 200: { description: 'My bus', ...json(MyBusResponse) } },
});

const destinationRoute = createRoute({
  method: 'put',
  path: '/tracking/my-bus/destination',
  tags: ['Tracking'],
  summary: 'Say where my waiting bus is headed next, so passengers at the shelter see it; null clears it (konduktor)',
  security,
  request: { body: { ...json(DestinationBody), required: true } },
  responses: { 200: { description: 'My bus', ...json(MyBusResponse) } },
});

const dispatchRoute = createRoute({
  method: 'post',
  path: '/tracking/my-bus/dispatch',
  tags: ['Tracking'],
  summary: 'Send my bus on the road: to the far end of the line, or to the station given (konduktor)',
  security,
  request: { body: { ...json(DispatchBody), required: true } },
  responses: { 201: { description: 'Dispatched', ...json(DispatchResultResponse) } },
});

export const trackingController = createOpenAPIApp()
  .openapi(busesRoute, async (c) => {
    const visible = await trackingService.visibleBusIds(c.get('auth'));
    return c.json(apiResponse(snapshotFor(await trackingService.snapshot(), visible)), 200);
  })
  .openapi(statusRoute, async (c) => c.json(apiResponse(await trackingService.workerStatus()), 200))
  .openapi(availabilityRoute, async (c) => c.json(apiResponse(await trackingService.availability(await trackingService.visibleBusIds(c.get('auth')))), 200))
  // The bus is always the signed-in konduktor's own, taken from the session and the assignment: no bus id is accepted (GEN-05).
  .openapi(myBusRoute, async (c) => {
    const auth = authorize(c, 'konduktor');
    return c.json(apiResponse(await trackingService.myBus(auth.user.id)), 200);
  })
  .openapi(departureRoute, async (c) => {
    const auth = authorize(c, 'konduktor');
    return c.json(apiResponse(await trackingService.setMyDeparture(auth.user.id, c.req.valid('json').inMinutes)), 200);
  })
  .openapi(destinationRoute, async (c) => {
    const auth = authorize(c, 'konduktor');
    return c.json(apiResponse(await trackingService.setMyDestination(auth.user.id, c.req.valid('json').destinationId)), 200);
  })
  .openapi(dispatchRoute, async (c) => {
    const auth = authorize(c, 'konduktor');
    return c.json(apiResponse(await trackingService.dispatchMyBus(auth.user.id, c.req.valid('json').destinationId)), 201);
  })
  /**
   * Live feed (TRK-04): Server-Sent Events. A full snapshot on connect, then a `positions` event whenever anything
   * changes. Not in the OpenAPI document (it is a stream, not a JSON response). `EventSource` reconnects by itself.
   */
  .get('/tracking/stream', async (c) => {
    // `no-transform` stops Next's compression layer from buffering the stream.
    c.header('Cache-Control', 'no-cache, no-transform');
    c.header('X-Accel-Buffering', 'no');
    // A konduktor's stream carries only their own bus: the filter is applied before anything is written.
    const visible = await trackingService.visibleBusIds(c.get('auth'));
    return streamSSE(c, async (stream) => {
      let unsubscribe = () => {};
      const closed = new Promise<void>((resolve) => {
        stream.onAbort(() => {
          unsubscribe();
          resolve();
        });
      });

      // The hub's first call is the current state (sent as `snapshot`); every later call is a change (`positions`).
      let first = true;
      unsubscribe = trackingHub.subscribe((snapshot) => {
        const shown = snapshotFor(snapshot, visible);
        const message = first ? { event: 'snapshot', data: JSON.stringify(shown), retry: 2000 } : { event: 'positions', data: JSON.stringify(shown) };
        first = false;
        stream.writeSSE(message).catch(() => {});
      });
      // Keeps idle connections open through proxies.
      const heartbeat = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: '' }).catch(() => {});
      }, 15_000);
      await closed;
      clearInterval(heartbeat);
    });
  });
