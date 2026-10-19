import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { apiResponse } from '@lib/response';
import { authorize } from '@middleware/auth.middleware';
import {
  CreateStationBody,
  IdParam,
  ListQuery,
  ReorderBody,
  StationDemandResponse,
  StationListResponse,
  StationResponse,
  UpdateStationBody,
} from './stations.schema';
import { stationsService } from './stations.service';

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });
const adminSecurity = [{ sessionCookie: [] }];

const listRoute = createRoute({
  method: 'get',
  path: '/stations',
  tags: ['Stations'],
  summary: 'Stations in line order (public). Admins may pass includeInactive=true.',
  request: { query: ListQuery },
  responses: { 200: { description: 'Stations', ...json(StationListResponse) } },
});

const demandRoute = createRoute({
  method: 'get',
  path: '/stations/demand',
  tags: ['Stations'],
  summary: 'Tickets bought at each station: valid, and sold today (admin). Counts only, no passenger list.',
  security: adminSecurity,
  responses: { 200: { description: 'Demand per station', ...json(StationDemandResponse) } },
});

const createStationRoute = createRoute({
  method: 'post',
  path: '/stations',
  tags: ['Stations'],
  summary: 'Add a station (admin)',
  security: adminSecurity,
  request: { body: { ...json(CreateStationBody), required: true } },
  responses: { 201: { description: 'Created', ...json(StationResponse) } },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/stations/{id}',
  tags: ['Stations'],
  summary: 'Rename, move or (de)activate a station (admin)',
  security: adminSecurity,
  request: { params: IdParam, body: { ...json(UpdateStationBody), required: true } },
  responses: { 200: { description: 'Updated', ...json(StationResponse) } },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/stations/{id}',
  tags: ['Stations'],
  summary: 'Delete a station and close the gap in the sequence (admin)',
  security: adminSecurity,
  request: { params: IdParam },
  responses: { 200: { description: 'Deleted', ...json(StationListResponse) } },
});

const reorderRoute = createRoute({
  method: 'post',
  path: '/stations/reorder',
  tags: ['Stations'],
  summary: 'Set the full line order (admin)',
  security: adminSecurity,
  request: { body: { ...json(ReorderBody), required: true } },
  responses: { 200: { description: 'New order', ...json(StationListResponse) } },
});

export const stationsController = createOpenAPIApp()
  .openapi(listRoute, async (c) => {
    const includeInactive = c.req.valid('query').includeInactive === 'true';
    if (includeInactive) authorize(c, 'admin');
    return c.json(apiResponse(await stationsService.list({ includeInactive })), 200);
  })
  .openapi(demandRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await stationsService.demand()), 200);
  })
  .openapi(createStationRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await stationsService.create(c.req.valid('json'))), 201);
  })
  // Registered before /stations/{id} so "reorder" is never read as an id.
  .openapi(reorderRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await stationsService.reorder(c.req.valid('json').ids)), 200);
  })
  .openapi(updateRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await stationsService.update(c.req.valid('param').id, c.req.valid('json'))), 200);
  })
  .openapi(deleteRoute, async (c) => {
    authorize(c, 'admin');
    await stationsService.remove(c.req.valid('param').id);
    return c.json(apiResponse(await stationsService.list({ includeInactive: true })), 200);
  });
