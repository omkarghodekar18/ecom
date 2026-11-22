// brands module — public surface.
import './brands.openapi.js';

export { brandsRouter } from './brands.routes.js';
export { brandsService } from './brands.service.js';
export { CreateBrandInputSchema, UpdateBrandInputSchema } from './brands.service.js';
export type { BrandWithCountDto } from './brands.service.js';
export { brandsRepository } from './brands.repository.js';
export type { BrandRow } from './brands.repository.js';
