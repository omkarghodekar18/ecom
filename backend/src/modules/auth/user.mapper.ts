// User → MeDto mapper: the single place that whitelists user fields for API
// responses. Never expose passwordHash or internal timestamps.
import type { MeDto } from '../../shared/dto/auth.dto.js';
import type { UserWithCompany } from './auth.repository.js';

/** Maps a user (with company included) to the public MeDto shape. */
export function sanitizeUserToMe(user: UserWithCompany): MeDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    type: user.type,
    ...(user.company ? { companyId: user.company.id, companyName: user.company.name } : {}),
    emailVerified: user.emailVerifiedAt !== null,
  };
}
