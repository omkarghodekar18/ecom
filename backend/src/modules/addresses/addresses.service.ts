// Addresses service — CRUD with single-default invariant: promoting an
// address to default shipping/billing unsets the previous default of the
// same kind inside the same transaction.
import { notFound } from '../../common/errors/app-error.js';
import { withTransaction } from '../../db/transaction.js';
import type { AddressDto, AddressInput } from '../../shared/dto/address.dto.js';
import { addressesRepository, type AddressRow } from './addresses.repository.js';

function toDto(row: AddressRow): AddressDto {
  return {
    id: row.id,
    label: row.label,
    contactName: row.contactName,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    gstin: row.gstin,
    isDefaultShipping: row.isDefaultShipping,
    isDefaultBilling: row.isDefaultBilling,
  };
}

/** Optional text fields arrive as `""` from clients — store them as NULL instead. */
function normalizeBlank<T extends AddressInput | Partial<AddressInput>>(input: T): T {
  return {
    ...input,
    ...(input.label !== undefined ? { label: input.label || null } : {}),
    ...(input.line2 !== undefined ? { line2: input.line2 || null } : {}),
    ...(input.gstin !== undefined ? { gstin: input.gstin || null } : {}),
  };
}

export const addressesService = {
  list: async (userId: string): Promise<AddressDto[]> => {
    const rows = await addressesRepository.listForUser(userId);
    return rows.map(toDto);
  },

  create: async (userId: string, input: AddressInput): Promise<AddressDto> => {
    const data = normalizeBlank(input);
    const row = await withTransaction(async (tx) => {
      if (data.isDefaultShipping) await addressesRepository.clearDefault(userId, 'isDefaultShipping', tx);
      if (data.isDefaultBilling) await addressesRepository.clearDefault(userId, 'isDefaultBilling', tx);
      return addressesRepository.create({ ...data, userId }, tx);
    });
    return toDto(row);
  },

  /** Partial update; promoting to default swaps the previous default atomically. */
  update: async (userId: string, id: string, input: Partial<AddressInput>): Promise<AddressDto> => {
    const data = normalizeBlank(input);
    const row = await withTransaction(async (tx) => {
      if (data.isDefaultShipping) await addressesRepository.clearDefault(userId, 'isDefaultShipping', tx);
      if (data.isDefaultBilling) await addressesRepository.clearDefault(userId, 'isDefaultBilling', tx);
      return addressesRepository.updateForUser(id, userId, data, tx);
    });
    if (!row) throw notFound('Address not found');
    return toDto(row);
  },

  remove: async (userId: string, id: string): Promise<void> => {
    const deleted = await addressesRepository.deleteForUser(id, userId);
    if (!deleted) throw notFound('Address not found');
  },
};
