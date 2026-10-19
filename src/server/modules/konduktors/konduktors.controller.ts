import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { pageParams, PageQuery } from '@lib/pagination';
import { apiResponse } from '@lib/response';
import { authorize } from '@middleware/auth.middleware';
import {
  CreateKonduktorBody,
  IdParam,
  KonduktorListResponse,
  KonduktorOptionsResponse,
  KonduktorResponse,
  OkResponse,
  UpdateKonduktorBody,
} from './konduktors.schema';
import { konduktorsService } from './konduktors.service';

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });
const security = [{ sessionCookie: [] }];

const listRoute = createRoute({
  method: 'get',
  path: '/konduktors',
  tags: ['Konduktors'],
  summary: 'All konduktors with their bus (admin)',
  security,
  request: { query: PageQuery },
  responses: { 200: { description: 'One page of konduktors', ...json(KonduktorListResponse) } },
});
const optionsRoute = createRoute({
  method: 'get',
  path: '/konduktors/options',
  tags: ['Konduktors'],
  summary: 'Every konduktor, name only, for drop-downs (admin)',
  security,
  responses: { 200: { description: 'Konduktor options', ...json(KonduktorOptionsResponse) } },
});
const meRoute = createRoute({
  method: 'get',
  path: '/konduktors/me',
  tags: ['Konduktors'],
  summary: 'Own profile and assigned bus (konduktor)',
  security,
  responses: { 200: { description: 'Profile', ...json(KonduktorResponse) } },
});
const createKonduktorRoute = createRoute({
  method: 'post',
  path: '/konduktors',
  tags: ['Konduktors'],
  summary: 'Create a konduktor account and profile (admin)',
  security,
  request: { body: { ...json(CreateKonduktorBody), required: true } },
  responses: { 201: { description: 'Created', ...json(KonduktorResponse) } },
});
const updateRoute = createRoute({
  method: 'patch',
  path: '/konduktors/{id}',
  tags: ['Konduktors'],
  summary: 'Edit, deactivate or reset the password of a konduktor (admin)',
  security,
  request: { params: IdParam, body: { ...json(UpdateKonduktorBody), required: true } },
  responses: { 200: { description: 'Updated', ...json(KonduktorResponse) } },
});
const deleteRoute = createRoute({
  method: 'delete',
  path: '/konduktors/{id}',
  tags: ['Konduktors'],
  summary: 'Delete a konduktor who has no scan history (admin)',
  security,
  request: { params: IdParam },
  responses: { 200: { description: 'Deleted', ...json(OkResponse) } },
});

export const konduktorsController = createOpenAPIApp()
  .openapi(listRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await konduktorsService.list(pageParams(c.req.valid('query')))), 200);
  })
  .openapi(optionsRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await konduktorsService.options()), 200);
  })
  // Registered before /konduktors/{id} so "me" is never read as an id.
  .openapi(meRoute, async (c) => {
    const auth = authorize(c, 'konduktor');
    return c.json(apiResponse(await konduktorsService.me(auth.user.id)), 200);
  })
  .openapi(createKonduktorRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await konduktorsService.create(c.req.valid('json'))), 201);
  })
  .openapi(updateRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await konduktorsService.update(c.req.valid('param').id, c.req.valid('json'))), 200);
  })
  .openapi(deleteRoute, async (c) => {
    authorize(c, 'admin');
    await konduktorsService.remove(c.req.valid('param').id);
    return c.json(apiResponse({ ok: true as const }), 200);
  });
