// Express application assembly (middleware → routes → docs → error handling).
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { pinoHttp } from 'pino-http';
import { getEnv, isOriginAllowed } from './config/env.js';
import { logger } from './config/logger.js';
import { API_PREFIX } from './config/constants.js';
import { requestIdMiddleware } from './common/middleware/request-id.js';
import { apiLimiter } from './common/middleware/rate-limit.js';
import { errorHandler } from './common/errors/error-handler.js';
import { notFoundHandler } from './common/middleware/not-found.js';
import { healthRouter } from './modules/health/index.js';
import { authRouter } from './modules/auth/index.js';
import { usersRouter } from './modules/users/index.js';
import { addressesRouter } from './modules/addresses/index.js';
import { companiesRouter } from './modules/companies/index.js';
import { catalogRouter } from './modules/catalog/index.js';
import { attributesRouter } from './modules/attributes/index.js';
import { brandsRouter } from './modules/brands/index.js';
import { mediaPublicRouter, mediaAdminRouter } from './modules/media/index.js';
import { productsRouter } from './modules/products/index.js';
import { pricingRouter } from './modules/pricing/index.js';
import { searchRouter } from './modules/search/index.js';
import { cmsRouter } from './modules/cms/index.js';
import { seoRouter } from './modules/seo/index.js';
import { cartRouter } from './modules/cart/index.js';
import { checkoutRouter } from './modules/checkout/index.js';
import { ordersRouter } from './modules/orders/index.js';
import { quickOrderRouter } from './modules/quick-order/index.js';
import { settingsRouter } from './modules/settings/index.js';
import { adminRouter } from './modules/admin/index.js';
import { importsRouter } from './modules/imports/index.js';
import { generateOpenApiDocument } from './openapi-document.js';

export function createApp(): Express {
  const app = express();
  const env = getEnv();

  app.set('trust proxy', 1); // behind CDN/proxy; required for correct rate-limit IPs
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false })); // JSON API; CSP is enforced by the frontend app
  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser tools (no Origin header) and the configured
        // allow-list (exact origins or wildcard patterns — see env.ts).
        if (!origin || isOriginAllowed(origin)) return cb(null, true);
        return cb(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '30mb' })); // import uploads arrive as base64/base64url JSON
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(apiLimiter);

  // pino-http: request logging with the same request id we hand back to clients.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as Request).requestId,
      customLogLevel: (_req, res, err) =>
        res.statusCode >= 500 || err ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
    }),
  );

  app.use(`${API_PREFIX}/health`, healthRouter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/users`, usersRouter);
  app.use(`${API_PREFIX}/addresses`, addressesRouter);
  app.use(`${API_PREFIX}/companies`, companiesRouter);

  // Catalog/attributes/brands routers define their full sub-path space
  // (including /admin/... routes) and mount at the API root.
  app.use(API_PREFIX, catalogRouter);
  app.use(API_PREFIX, attributesRouter);
  app.use(API_PREFIX, brandsRouter);
  app.use(API_PREFIX, productsRouter);
  app.use(API_PREFIX, pricingRouter);
  app.use(API_PREFIX, searchRouter);
  app.use(API_PREFIX, cmsRouter);
  app.use(API_PREFIX, seoRouter);
  app.use(API_PREFIX, cartRouter);
  app.use(API_PREFIX, checkoutRouter);
  app.use(API_PREFIX, ordersRouter);
  app.use(API_PREFIX, quickOrderRouter);
  app.use(API_PREFIX, settingsRouter);
  app.use(API_PREFIX, adminRouter);
  app.use(API_PREFIX, importsRouter);
  app.use(`${API_PREFIX}/admin/media`, mediaAdminRouter);
  // Static media delivery (local adapter) at the service root, outside /api.
  app.use('/media', mediaPublicRouter);

  // OpenAPI + Swagger UI
  const openApiDocument = generateOpenApiDocument();
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'ToolHub API docs' }));

  app.get('/', (_req, res) => {
    res.json({ service: 'toolhub-api', docs: `${env.PUBLIC_API_URL}/api/docs` });
  });

  app.use(notFoundHandler);
  app.use(errorHandler(logger) as unknown as express.ErrorRequestHandler);
  return app;
}
