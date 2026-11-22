// Companies service — the B2B customer's company view.
import { notFound } from '../../common/errors/app-error.js';
import type { CompanyDto } from '../../shared/dto/company.dto.js';
import { authRepository } from '../auth/auth.repository.js';
import { companiesRepository, type CompanyWithUsers } from './companies.repository.js';

function toDto(company: CompanyWithUsers): CompanyDto {
  return {
    id: company.id,
    name: company.name,
    gstin: company.gstin,
    customerNumber: company.customerNumber,
    users: company.users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    })),
  };
}

/**
 * The company linked to the authenticated user. Only B2B accounts have one:
 * B2C accounts (or B2B accounts without a company) get a 404 with a neutral
 * message.
 */
export async function getMyCompany(userId: string): Promise<CompanyDto> {
  const user = await authRepository.findUserById(userId);
  if (user?.type !== 'B2B' || !user.companyId) {
    throw notFound('No company linked to this account');
  }
  const company = await companiesRepository.findById(user.companyId);
  if (!company) throw notFound('No company linked to this account');
  return toDto(company);
}
