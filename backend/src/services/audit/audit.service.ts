// Audit trail (spec Sections 11/17): every admin write records who changed
// what, where from. A tiny service on top of the AuditLog table — call sites
// pass the open transaction client when the audited write is transactional so
// the log row commits (or rolls back) atomically with the change.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

/** What changed. Accepts JSON-safe objects; `null` means "no diff recorded". */
export type AuditDiff = Prisma.InputJsonValue | Record<string, unknown> | null;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

/**
 * Writes one AuditLog row.
 *
 * Signature (kept positional, per the cross-module contract):
 *   writeAudit(actorId, action, entity, entityId, diff, ip, tx?)
 *
 * - actorId may be null (system-triggered writes).
 * - action is a stable dotted string, e.g. `category.update`.
 * - entity names the table ('category' | 'attribute' | 'brand' | …).
 * - ip is the request IP (`req.ip ?? null`), kept for traceability.
 */
export function writeAudit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  diff: AuditDiff,
  ip: string | null,
  tx?: Transaction,
): Promise<unknown> {
  return db(tx).auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      diff: diff === null ? undefined : (diff as Prisma.InputJsonValue),
      ip,
    },
  });
}
