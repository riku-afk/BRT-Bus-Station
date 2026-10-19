import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { pageParams, PageQuery } from '@lib/pagination';
import { apiResponse } from '@lib/response';
import { authorize } from '@middleware/auth.middleware';
import { AssignKonduktorBody, BusListResponse, BusOptionsResponse, BusResponse, CreateBusBody, IdParam, OkResponse, UpdateBusBody } from './buses.schema';
import { busesService } from './buses.service';

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });
const security = [{ sessionCookie: [] }];

const listRoute = createRoute({
  method: 'get',
  path: '/buses',
  tags: ['Buses'],
  summary: 'All buses with their konduktor (admin)',
  security,
  request: { query: PageQuery },
  responses: { 200: { description: 'One page of buses', ...json(BusListResponse) } },
});
const optionsRoute = createRoute({
  method: 'get',
  path: '/buses/options',
  tags: ['Buses'],
  summary: 'Every bus, name and plate only, for drop-downs (admin)',
  security,
  responses: { 200: { description: 'Bus options', ...json(BusOptionsResponse) } },
});
const createBusRoute = createRoute({
  method: 'post',
  path: '/buses',
  tags: ['Buses'],
  summary: 'Add a bus (admin)',
  security,
  request: { body: { ...json(CreateBusBody), required: true } },
  responses: { 201: { description: 'Created', ...json(BusResponse) } },
});
const updateRoute = createRoute({
  method: 'patch',
  path: '/buses/{id}',
  tags: ['Buses'],
  summary: 'Edit a bus (admin)',
  security,
  request: { params: IdParam, body: { ...json(UpdateBusBody), required: true } },
  responses: { 200: { description: 'Updated', ...json(BusResponse) } },
});
const deleteRoute = createRoute({
  method: 'delete',
  path: '/buses/{id}',
  tags: ['Buses'],
  summary: 'Delete a bus (admin)',
  security,
  request: { params: IdParam },
  responses: { 200: { description: 'Deleted', ...json(OkResponse) } },
});
const assignRoute = createRoute({
  method: 'put',
  path: '/buses/{id}/konduktor',
  tags: ['Buses'],
  summary: 'Assign a konduktor to a bus, or unassign with null (admin)',
  security,
  request: { params: IdParam, body: { ...json(AssignKonduktorBody), required: true } },
  responses: { 200: { description: 'Assignment saved', ...json(BusResponse) } },
});

export const busesController = createOpenAPIApp()
  .openapi(listRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await busesService.list(pageParams(c.req.valid('query')))), 200);
  })
  .openapi(optionsRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await busesService.options()), 200);
  })
  .openapi(createBusRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await busesService.create(c.req.valid('json'))), 201);
  })
  .openapi(updateRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await busesService.update(c.req.valid('param').id, c.req.valid('json'))), 200);
  })
  .openapi(deleteRoute, async (c) => {
    authorize(c, 'admin');
    await busesService.remove(c.req.valid('param').id);
    return c.json(apiResponse({ ok: true as const }), 200);
  })
  .openapi(assignRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await busesService.assignKonduktor(c.req.valid('param').id, c.req.valid('json').konduktorId)), 200);
  });
