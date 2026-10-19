import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { apiResponse } from '@lib/response';
import { DatabaseHealthResponse, HealthResponse, SystemInfoResponse } from './system.schema';
import { systemService } from './system.service';

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Liveness check',
  responses: { 200: { description: 'Service is running', content: { 'application/json': { schema: HealthResponse } } } },
});

const databaseHealthRoute = createRoute({
  method: 'get',
  path: '/health/database',
  tags: ['System'],
  summary: 'Database connectivity check',
  responses: {
    200: { description: 'Database reachable', content: { 'application/json': { schema: DatabaseHealthResponse } } },
    503: { description: 'Database unavailable', content: { 'application/json': { schema: DatabaseHealthResponse } } },
  },
});

const infoRoute = createRoute({
  method: 'get',
  path: '/system/info',
  tags: ['System'],
  summary: 'Software name, version and environment',
  description: 'Shown in the UI footer and the proof-of-concept banner.',
  responses: { 200: { description: 'System information', content: { 'application/json': { schema: SystemInfoResponse } } } },
});

export const systemController = createOpenAPIApp()
  .openapi(healthRoute, (c) => c.json(apiResponse(systemService.getHealth()), 200))
  .openapi(databaseHealthRoute, async (c) => {
    const health = await systemService.getDatabaseHealth();
    return c.json(apiResponse(health), health.status === 'ok' ? 200 : 503);
  })
  .openapi(infoRoute, (c) => c.json(apiResponse(systemService.getInfo()), 200));
