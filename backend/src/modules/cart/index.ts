// cart module — public surface.
import './cart.openapi.js';

export { cartRouter } from './cart.routes.js';
export { cartService, hashCartToken, CART_TTL_MS, type CartActor, type CartMutationResult } from './cart.service.js';
export { cartRepository } from './cart.repository.js';
export type { CartItemRow } from './cart.repository.js';
export { isBuyable, toCartItemDto } from './cart.mapper.js';
export {
  applyQuantityRules,
  computeTotals,
  shippingFor,
  stockWarnings,
  QuantityRuleError,
  type PricedLine,
  type QuantityRuleSource,
} from './cart.rules.js';
