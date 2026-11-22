# users module

Self-service account area for the authenticated user: profile updates,
password change and session management.

**Public API** (`index.ts`): `usersRouter`.

## Endpoints (all under `/api/v1`, Bearer-authenticated)

| Method | Path | Notes |
|---|---|---|
| GET | `/users/me/sessions` | `SessionDto[]`; `current` matches the `sid` claim of the presented access token |
| DELETE | `/users/me/sessions/:id` | 204; 404 if the session is not the caller's (IDOR-safe) |
| DELETE | `/users/me/sessions` | 204; revokes all except the current session |
| PATCH | `/users/me` | `ProfileDto` |
| POST | `/users/me/password` | 204; wrong current password → 401 INVALID_CREDENTIALS; revokes all OTHER sessions |

## Key flows

- "Current session" identification: the access JWT carries `sid` (refresh
  token row id) — populated by `authenticate` as `req.sessionId`.
- Password change reuses the `password-reset` mail template ("your password
  was changed") and audits `PASSWORD_CHANGE`.

## Gotchas

- `phone: ''` in PATCH clears the stored phone (DTO allows the empty string).
- Session and audit writes go through the auth module's repositories
  (`session.repository.ts`, `auth.repository.ts`); the users repository owns
  the profile queries.
