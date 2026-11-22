// orders module — public surface.
import './orders.openapi.js';

export { ordersRouter } from './orders.routes.js';
export { ordersService, ListOrdersQuerySchema } from './orders.service.js';
export { ordersRepository } from './orders.repository.js';
export type { OrderDetailRow, OrderListRow } from './orders.repository.js';
export { toOrderDetailDto, toOrderListItemDto } from './orders.mapper.js';
