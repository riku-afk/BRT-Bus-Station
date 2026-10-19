import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { apiResponse } from '@lib/response';
import { RouteResponse } from './route.schema';
import { routeService } from './route.service';

const routeRoute = createRoute({
  method: 'get',
  path: '/route',
  tags: ['Route'],
  summary: 'The route buses drive: the road between the active shelters, as one polyline (public)',
  responses: { 200: { description: 'Route', content: { 'application/json': { schema: RouteResponse } } } },
});

export const routeController = createOpenAPIApp().openapi(routeRoute, async (c) => {
  const path = await routeService.path();
  return c.json(
    apiResponse({
      points: path.points.map((p): [number, number] => [Number(p.latitude.toFixed(6)), Number(p.longitude.toFixed(6))]),
      totalMeters: Math.round(path.totalMeters),
      stationDistances: path.stationDistances.map(Math.round),
      roadLegs: path.roadLegs,
      legs: path.legs,
    }),
    200,
  );
});
