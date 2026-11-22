// Media routes. Two mount points (see README):
//   app.use('/media', mediaPublicRouter)            — public byte delivery
//   app.use('/api/v1/admin/media', mediaAdminRouter) — staff/admin uploads
//
// Express 5 note: path-to-regexp v8 rejects bare '*' and ':name(regex)'
// custom patterns (they throw PathError at route construction). The
// supported "rest of the path" capture is the named wildcard '{*splat}',
// which yields the decoded segments in req.params.splat — verified against
// a supertest-mounted router in tests/integration/media.test.ts.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { notFound } from '../../common/errors/app-error.js';
import { asyncHandler } from '../../common/response/http.js';
import { mediaController } from './media.controller.js';

export const mediaPublicRouter = Router();

// Malformed percent-escapes would make path-to-regexp's decoder throw (and
// surface as 500) — fail fast with a clean 404 before route matching.
mediaPublicRouter.use((req, _res, next) => {
  try {
    decodeURIComponent(req.path);
  } catch {
    next(notFound('Media asset not found'));
    return;
  }
  next();
});

mediaPublicRouter.get('/{*splat}', asyncHandler(mediaController.serve));

export const mediaAdminRouter = Router();

mediaAdminRouter.post('/sign-upload', authenticate, authorize('STAFF', 'ADMIN'), asyncHandler(mediaController.signUpload));
mediaAdminRouter.post('/upload', authenticate, authorize('STAFF', 'ADMIN'), asyncHandler(mediaController.uploadBinary));
