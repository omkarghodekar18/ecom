// OpenAPI registration for the users module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import {
  ChangePasswordInputSchema,
  ProfileDtoSchema,
  SessionDtoSchema,
  UpdateProfileInputSchema,
} from '../../shared/dto/users.dto.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const sessionsSchema = envelope(z.array(SessionDtoSchema));
const unauthorized = jsonResponse('Not authenticated');

openApiRegistry.registerPath({
  method: 'get',
  path: '/users/me/sessions',
  tags: ['Users'],
  description: 'Live sessions of the current user; `current` marks the session that made the request (sid claim).',
  responses: {
    '200': jsonResponse('Active sessions', sessionsSchema),
    '401': unauthorized,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/users/me/sessions/{id}',
  tags: ['Users'],
  description: 'Revokes one session by id. 404 unless it belongs to the caller.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    '204': jsonResponse('Session revoked'),
    '401': unauthorized,
    '404': jsonResponse('Session not found (NOT_FOUND)'),
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/users/me/sessions',
  tags: ['Users'],
  description: 'Revokes every session except the current one ("sign out other devices").',
  responses: { '204': jsonResponse('Other sessions revoked'), '401': unauthorized },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/users/me',
  tags: ['Users'],
  description: 'Updates the profile (first/last name, phone).',
  request: { body: jsonBody(UpdateProfileInputSchema) },
  responses: {
    '200': jsonResponse('Updated profile', envelope(ProfileDtoSchema)),
    '400': jsonResponse('Validation failed'),
    '401': unauthorized,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/users/me/password',
  tags: ['Users'],
  description:
    'Changes the password after verifying the current one; revokes every other session and notifies by email.',
  request: { body: jsonBody(ChangePasswordInputSchema) },
  responses: {
    '204': jsonResponse('Password changed'),
    '400': jsonResponse('Validation failed'),
    '401': jsonResponse('Current password wrong (INVALID_CREDENTIALS) or not authenticated'),
  },
});
