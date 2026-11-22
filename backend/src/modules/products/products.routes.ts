// Products routes — public product reads (PDP, variant lookup, category/brand
// listings, related products) + admin product/variant/media-list management.
// The router defines the FULL sub-path space with absolute-in-router paths, so
// it must be mounted at the API root: app.use(API_PREFIX, productsRouter).
// Paths deliberately do not collide with the catalog module's /categories/:code/*
// reads or the brands module's /brands/:slug read (this router only adds the
// .../products children of both).
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { asyncHandler } from '../../common/response/http.js';
import { productsController } from './products.controller.js';

export const productsRouter = Router();

/** Admin guard for every back-office write/read in this module. */
const staffOnly = [authenticate, authorize('STAFF', 'ADMIN')] as const;

// Public reads (spec 15.4/15.5)
productsRouter.get('/products/:slug', asyncHandler(productsController.detailBySlug));
productsRouter.get('/products/:slug/related', asyncHandler(productsController.relatedProducts));
productsRouter.get('/variants/:articleNo', asyncHandler(productsController.variantByArticleNo));
productsRouter.get('/categories/:code/products', asyncHandler(productsController.listByCategory));
productsRouter.get('/brands/:slug/products', asyncHandler(productsController.listByBrand));

// Admin: product CRUD (spec 11/12)
productsRouter.post('/admin/products', ...staffOnly, asyncHandler(productsController.createProduct));
productsRouter.get('/admin/products', ...staffOnly, asyncHandler(productsController.adminList));
productsRouter.get('/admin/products/:id', ...staffOnly, asyncHandler(productsController.adminDetail));
productsRouter.patch('/admin/products/:id', ...staffOnly, asyncHandler(productsController.updateProduct));
productsRouter.delete('/admin/products/:id', ...staffOnly, asyncHandler(productsController.deleteProduct));
productsRouter.post('/admin/products/bulk', ...staffOnly, asyncHandler(productsController.bulkUpdateProducts));
productsRouter.post('/admin/products/:id/duplicate', ...staffOnly, asyncHandler(productsController.duplicateProduct));

// Admin: variants of one product
productsRouter.post(
  '/admin/products/:id/variants',
  ...staffOnly,
  asyncHandler(productsController.createVariant),
);
productsRouter.patch(
  '/admin/products/:id/variants/:variantId',
  ...staffOnly,
  asyncHandler(productsController.updateVariant),
);
productsRouter.delete(
  '/admin/products/:id/variants/:variantId',
  ...staffOnly,
  asyncHandler(productsController.deleteVariant),
);

// Admin: image / document / price-tier lists (PUT and POST both REPLACE)
productsRouter.put('/admin/products/:id/images', ...staffOnly, asyncHandler(productsController.replaceImages));
productsRouter.post(
  '/admin/products/:id/documents',
  ...staffOnly,
  asyncHandler(productsController.replaceDocuments),
);
productsRouter.put(
  '/admin/products/:id/price-tiers/:variantId',
  ...staffOnly,
  asyncHandler(productsController.replacePriceTiers),
);
