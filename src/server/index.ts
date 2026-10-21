/**
 * Cavite Smart Transport Terminal API — Hono application.
 *
 * Mounted by src/app/api/[[...route]]/route.ts, which strips the /api prefix.
 * Register each module controller below (controller -> service -> repository).
 */
import { secureHeaders } from 'hono/secure-headers';
import { createOpenAPIApp, mountApiDocs } from '@lib/openapi';
import { requestIdMiddleware } from '@middleware/request-id.middleware';
import { loggerMiddleware } from '@middleware/logger.middleware';
import { errorHandler, notFoundHandler } from '@middleware/error.middleware';
import { originMiddleware, sessionMiddleware } from '@middleware/auth.middleware';
import { systemController } from '@modules/system';
import { authController } from '@modules/auth';
import { stationsController } from '@modules/stations';
import { faresController } from '@modules/fares';
import { busesController } from '@modules/buses';
import { konduktorsController } from '@modules/konduktors';
import { etaController } from '@modules/eta';
import { routeController } from '@modules/route';
import { statsController } from '@modules/stats';
import { trackingController } from '@modules/tracking';
import { ticketsController } from '@modules/tickets';
import { paymentsController } from '@modules/payments';
import { scansController } from '@modules/scans';
import { ssoController } from '@modules/sso';

export const api = createOpenAPIApp();

api.use('*', requestIdMiddleware);
api.use('*', loggerMiddleware);
api.use('*', secureHeaders());
api.use('*', originMiddleware);
api.use('*', sessionMiddleware);

// ── Modules ──────────────────────────────────────────────────────────────────
api.route('/', systemController);
api.route('/', authController);
api.route('/', stationsController);
api.route('/', faresController);
api.route('/', busesController);
api.route('/', konduktorsController);
api.route('/', trackingController);
api.route('/', etaController);
api.route('/', routeController);
api.route('/', statsController);
api.route('/', ticketsController);
api.route('/', paymentsController);
api.route('/', scansController);
api.route('/', ssoController);

// ── API documentation ────────────────────────────────────────────────────────
mountApiDocs(api);

api.onError(errorHandler);
api.notFound(notFoundHandler);
