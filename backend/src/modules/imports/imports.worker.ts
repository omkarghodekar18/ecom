// Registers the import queue workers (import = side effect, same pattern as
// catalog.worker/checkout.worker). The dry run runs after upload; commit is
// enqueued by the controller path when an admin confirms.
import { logger } from '../../config/logger.js';
import { queue } from '../../services/queue/index.js';
import { IMPORTS_COMMIT_QUEUE, IMPORTS_DRY_RUN_QUEUE, runCommit, runDryRun } from './imports.service.js';

queue
  .work<{ jobId: string }>(IMPORTS_DRY_RUN_QUEUE, async (data) => {
    await runDryRun(data.jobId);
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'failed to register imports.dry-run worker');
  });

queue
  .work<{ jobId: string; actorId: string; ip: string | null }>(IMPORTS_COMMIT_QUEUE, async (data) => {
    await runCommit(data.jobId, data.actorId, data.ip);
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'failed to register imports.commit worker');
  });
