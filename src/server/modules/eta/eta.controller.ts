import { createRoute, z } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { apiResponse } from '@lib/response';
import { trackingService } from '@modules/tracking/tracking.service';
import { BusEtasResponse, StationArrivalsResponse } from './eta.schema';
import { etaService } from './eta.service';

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });

const stationRoute = createRoute({
  method: 'get',
  path: '/eta/stations/{id}',
  tags: ['ETA'],
  summary: 'Buses that will reach a station, soonest first, with minutes away (public; a konduktor sees only their own bus)',
  request: { params: z.object({ id: z.uuid() }) },
  responses: { 200: { description: 'Arrivals', ...json(StationArrivalsResponse) } },
});

const busesRoute = createRoute({
  method: 'get',
  path: '/eta/buses',
  tags: ['ETA'],
  summary: 'For each bus on the road: when it reaches its next station and the end of its run',
  responses: { 200: { description: 'Estimates', ...json(BusEtasResponse) } },
});

export const etaController = createOpenAPIApp()
  .openapi(stationRoute, async (c) => {
    const visible = await trackingService.visibleBusIds(c.get('auth'));
    return c.json(apiResponse(await etaService.forStation(c.req.valid('param').id, visible)), 200);
  })
  .openapi(busesRoute, async (c) => {
    const visible = await trackingService.visibleBusIds(c.get('auth'));
    return c.json(apiResponse(await etaService.forBuses(visible)), 200);
  });
