// Search routes — public search reads. The router defines the FULL sub-path
// space with absolute-in-router paths, so it must be mounted at the API root:
// app.use(API_PREFIX, searchRouter). No collisions: nothing else serves /search.
import { Router } from 'express';
import { asyncHandler } from '../../common/response/http.js';
import { searchController } from './search.controller.js';

export const searchRouter = Router();

// Registered before '/search' so the static children can never be shadowed
// (defensive — Express matches exact paths here, there are no params).
searchRouter.get('/search/filters', asyncHandler(searchController.filterDefs));
searchRouter.get('/search/suggest', asyncHandler(searchController.suggest));
searchRouter.get('/search', asyncHandler(searchController.search));
