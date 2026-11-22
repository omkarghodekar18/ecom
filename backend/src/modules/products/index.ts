// products module — public surface.
import './products.openapi.js';

export { productsRouter } from './products.routes.js';
export { productsService } from './products.service.js';
export {
  AdminProductListQuerySchema,
  CreateProductInputSchema,
  CreateVariantInputSchema,
  PriceTiersInputSchema,
  ReplaceDocumentsInputSchema,
  ReplaceImagesInputSchema,
  UpdateProductInputSchema,
  UpdateVariantInputSchema,
} from './products.service.js';
export type { AdminProductDto, AdminProductListItemDto, ListingQuery } from './products.service.js';
export type { FacetAttributeMeta, FacetScope } from './products.service.js';
export {
  buildListingDtos,
  computeFacets,
  filterIndexFromDefs,
  listGlobalFacetAttributes,
  orderByFor,
  parseAttributeFilters,
} from './products.service.js';
export { productsRepository, recomputeProductMinPrice } from './products.repository.js';
export type {
  AdminProductListRow,
  AdminProductRow,
  AttributePredicate,
  FacetValueRow,
  ImageLiteRow,
  ProductDetailRow,
  ProductListRow,
  VariantDetailRow,
  VariantLiteRow,
} from './products.repository.js';
export type { VariantDtoRow } from './products.mapper.js';
export { availabilityOf, attributesMap } from './products.mapper.js';
export type { AvailabilitySource, AttributeValueRow } from './products.mapper.js';
export { parseListingQuery } from './products.controller.js';
