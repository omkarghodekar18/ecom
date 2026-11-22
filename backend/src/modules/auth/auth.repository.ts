// Auth repository — the ONLY layer touching Prisma for users, companies and
// auth audit events. Methods take an optional transaction client so services
// can compose atomic multi-step writes via `withTransaction`.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';
import { AUTH_EVENT_KIND, type AuthEventKind } from '../../config/constants.js';

/** Every user lookup in the auth flows carries its company (B2B name in MeDto). */
const userInclude = { company: true } satisfies Prisma.UserInclude;

export type UserWithCompany = Prisma.UserGetPayload<{ include: typeof userInclude }>;

/** Prisma client or an open interactive transaction. */
function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: 'CUSTOMER';
  type: 'B2B' | 'B2C';
  company?: { name: string; gstin: string | null; customerNumber: string };
}

export const authRepository = {
  findUserByEmail(email: string, tx?: Transaction): Promise<UserWithCompany | null> {
    return db(tx).user.findUnique({ where: { email }, include: userInclude });
  },

  findUserById(id: string, tx?: Transaction): Promise<UserWithCompany | null> {
    return db(tx).user.findUnique({ where: { id }, include: userInclude });
  },

  /** Registration insert: user plus its (optional) company in one write. */
  createUser(input: CreateUserInput, tx?: Transaction): Promise<UserWithCompany> {
    const { company, ...fields } = input;
    return db(tx).user.create({
      data: {
        ...fields,
        phone: fields.phone ?? null,
        ...(company ? { company: { create: company } } : {}),
      },
      include: userInclude,
    });
  },

  updateUser(id: string, data: Prisma.UserUpdateInput, tx?: Transaction): Promise<UserWithCompany> {
    return db(tx).user.update({ where: { id }, data, include: userInclude });
  },

  countCompanies(tx?: Transaction): Promise<number> {
    return db(tx).company.count();
  },

  recordAuthEvent(
    data: {
      kind: AuthEventKind;
      email: string;
      ip: string | null;
      detail?: Record<string, string | number | boolean>;
    },
    tx?: Transaction,
  ): Promise<unknown> {
    return db(tx).authEvent.create({
      data: { kind: data.kind, email: data.email, ip: data.ip, detail: data.detail ?? {} },
    });
  },

  /** Failed password logins for one email since `since` (account lockout). */
  countRecentLoginFailuresByEmail(email: string, since: Date, tx?: Transaction): Promise<number> {
    return db(tx).authEvent.count({
      where: { kind: AUTH_EVENT_KIND.LOGIN_FAIL, email, createdAt: { gte: since } },
    });
  },

  /** Failed password logins for one IP since `since` (network lockout). */
  countRecentLoginFailuresByIp(ip: string, since: Date, tx?: Transaction): Promise<number> {
    return db(tx).authEvent.count({
      where: { kind: AUTH_EVENT_KIND.LOGIN_FAIL, ip, createdAt: { gte: since } },
    });
  },

  /** OTP requests since `since` for one email or IP (spec: max 5 sends/hour). */
  countRecentOtpRequests(
    subject: { email?: string; ip?: string },
    since: Date,
    tx?: Transaction,
  ): Promise<number> {
    return db(tx).authEvent.count({
      where: { kind: AUTH_EVENT_KIND.OTP_REQUEST, createdAt: { gte: since }, ...subject },
    });
  },
};
