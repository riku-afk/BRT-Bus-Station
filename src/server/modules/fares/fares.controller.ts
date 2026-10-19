import { createRoute } from '@hono/zod-openapi';
import { createOpenAPIApp } from '@lib/openapi';
import { apiResponse } from '@lib/response';
import { authorize } from '@middleware/auth.middleware';
import {
  FareOverrideListResponse,
  FareQuoteResponse,
  FareSettings,
  FareSettingsResponse,
  OverridePairQuery,
  QuoteQuery,
  SetOverrideBody,
} from './fares.schema';
import { faresService } from './fares.service';

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });
const security = [{ sessionCookie: [] }];

const quoteRoute = createRoute({
  method: 'get',
  path: '/fares/quote',
  tags: ['Fares'],
  summary: 'Fare between two stations, in centavos (public)',
  request: { query: QuoteQuery },
  responses: { 200: { description: 'Fare quote', ...json(FareQuoteResponse) } },
});
const getSettingsRoute = createRoute({
  method: 'get',
  path: '/fares/settings',
  tags: ['Fares'],
  summary: 'Fare rule: base + per station (admin)',
  security,
  responses: { 200: { description: 'Settings', ...json(FareSettingsResponse) } },
});
const putSettingsRoute = createRoute({
  method: 'put',
  path: '/fares/settings',
  tags: ['Fares'],
  summary: 'Change the fare rule; only affects tickets bought afterwards (admin)',
  security,
  request: { body: { ...json(FareSettings), required: true } },
  responses: { 200: { description: 'Saved', ...json(FareSettingsResponse) } },
});
const listOverridesRoute = createRoute({
  method: 'get',
  path: '/fares/overrides',
  tags: ['Fares'],
  summary: 'Fixed fares for station pairs (admin)',
  security,
  responses: { 200: { description: 'Overrides', ...json(FareOverrideListResponse) } },
});
const putOverrideRoute = createRoute({
  method: 'put',
  path: '/fares/overrides',
  tags: ['Fares'],
  summary: 'Set a fixed fare for a station pair, both directions (admin)',
  security,
  request: { body: { ...json(SetOverrideBody), required: true } },
  responses: { 200: { description: 'All overrides', ...json(FareOverrideListResponse) } },
});
const deleteOverrideRoute = createRoute({
  method: 'delete',
  path: '/fares/overrides',
  tags: ['Fares'],
  summary: 'Remove a fixed fare so the pair uses the fare rule again (admin)',
  security,
  request: { query: OverridePairQuery },
  responses: { 200: { description: 'All overrides', ...json(FareOverrideListResponse) } },
});

export const faresController = createOpenAPIApp()
  .openapi(quoteRoute, async (c) => {
    const { origin, destination } = c.req.valid('query');
    return c.json(apiResponse(await faresService.quote(origin, destination)), 200);
  })
  .openapi(getSettingsRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await faresService.getSettings()), 200);
  })
  .openapi(putSettingsRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await faresService.saveSettings(c.req.valid('json'))), 200);
  })
  .openapi(listOverridesRoute, async (c) => {
    authorize(c, 'admin');
    return c.json(apiResponse(await faresService.listOverrides()), 200);
  })
  .openapi(putOverrideRoute, async (c) => {
    authorize(c, 'admin');
    const { originId, destinationId, fareCentavos } = c.req.valid('json');
    return c.json(apiResponse(await faresService.setOverride(originId, destinationId, fareCentavos)), 200);
  })
  .openapi(deleteOverrideRoute, async (c) => {
    authorize(c, 'admin');
    const { origin, destination } = c.req.valid('query');
    return c.json(apiResponse(await faresService.removeOverride(origin, destination)), 200);
  });
