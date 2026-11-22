// Users service — self-service account area: profile, password change and
// session management (list / revoke), all scoped to the authenticated user.
import { ERR, AUTH_EVENT_KIND } from '../../config/constants.js';
import { unauthorized, notFound } from '../../common/errors/app-error.js';
import { hashPassword, verifyPassword } from '../../common/utils/argon2.util.js';
import { sendMail } from '../../services/mail/index.js';
import type { ChangePasswordInput, ProfileDto, SessionDto, UpdateProfileInput } from '../../shared/dto/users.dto.js';
import { authRepository } from '../auth/auth.repository.js';
import { sessionRepository } from '../auth/session.repository.js';
import { usersRepository, type UserWithCompany } from './users.repository.js';

function toProfileDto(user: UserWithCompany): ProfileDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    type: user.type,
    ...(user.company ? { companyId: user.company.id, companyName: user.company.name } : {}),
    emailVerified: user.emailVerifiedAt !== null,
  };
}

/** Live sessions of the user; `current` is the one whose access JWT made the request. */
async function listSessions(userId: string, currentSid: string | undefined): Promise<SessionDto[]> {
  const rows = await sessionRepository.listActive(userId);
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
    current: row.id === currentSid,
  }));
}

/** Revokes one session by id — 404 unless it belongs to the caller (IDOR-safe). */
async function revokeSession(userId: string, sessionId: string, ip: string | null): Promise<void> {
  const row = await sessionRepository.findByIdForUser(sessionId, userId);
  if (!row) throw notFound('Session not found');
  if (!row.revokedAt) {
    await sessionRepository.revokeById(row.id);
  }
  const user = await usersRepository.findUserById(userId);
  if (user) {
    await authRepository.recordAuthEvent({
      kind: AUTH_EVENT_KIND.LOGOUT,
      email: user.email,
      ip,
      detail: { sessionId },
    });
  }
}

/** Revokes every session except the one that made the request. */
async function revokeOtherSessions(
  userId: string,
  currentSid: string | undefined,
  ip: string | null,
): Promise<void> {
  if (!currentSid) {
    await sessionRepository.revokeAllForUser(userId);
  } else {
    await sessionRepository.revokeAllForUserExcept(userId, currentSid);
  }
  const user = await usersRepository.findUserById(userId);
  if (user) {
    await authRepository.recordAuthEvent({
      kind: AUTH_EVENT_KIND.LOGOUT_ALL,
      email: user.email,
      ip,
      detail: { exceptCurrent: Boolean(currentSid) },
    });
  }
}

/** PATCH /users/me — name/phone updates. */
async function updateProfile(userId: string, input: UpdateProfileInput): Promise<ProfileDto> {
  const user = await usersRepository.updateUser(userId, {
    firstName: input.firstName,
    lastName: input.lastName,
    // Empty string clears the phone (the DTO allows '' for "remove").
    phone: input.phone === '' ? null : input.phone,
  });
  return toProfileDto(user);
}

/**
 * POST /users/me/password — verifies the current password, then rotates it
 * and revokes every OTHER session (current session stays signed in).
 */
async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  currentSid: string | undefined,
  ip: string | null,
): Promise<void> {
  const user = await usersRepository.findUserById(userId);
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw unauthorized('Invalid email or password', ERR.INVALID_CREDENTIALS);
  }
  await usersRepository.updateUser(userId, { passwordHash: await hashPassword(input.newPassword) });
  if (currentSid) {
    await sessionRepository.revokeAllForUserExcept(userId, currentSid);
  } else {
    await sessionRepository.revokeAllForUser(userId);
  }
  await authRepository.recordAuthEvent({ kind: AUTH_EVENT_KIND.PASSWORD_CHANGE, email: user.email, ip });
  await sendMail(user.email, 'password-reset', { name: user.firstName });
}

export const usersService = {
  listSessions,
  revokeSession,
  revokeOtherSessions,
  updateProfile,
  changePassword,
};
