// attributes module — public surface.
import './attributes.openapi.js';

export { attributesRouter } from './attributes.routes.js';
export { attributesService } from './attributes.service.js';
export {
  CategoryMappingInputSchema,
  CreateAttributeInputSchema,
  UpdateAttributeInputSchema,
} from './attributes.service.js';
export { attributesRepository } from './attributes.repository.js';
export type { AttributeRow, CategoryAttributeWithAttribute } from './attributes.repository.js';
