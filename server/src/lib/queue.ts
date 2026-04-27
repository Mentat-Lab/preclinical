/**
 * Job queue abstraction.
 *
 * The rest of the codebase only touches the `JobQueue` interface.
 * Swap the implementation by changing the factory below (pg-boss → BullMQ, NATS, etc).
 */

import { config } from './config.js';
import { log } from './logger.js';

const logger = log.child({ component: 'pg-boss' });

// =============================================================================
// INTERFACE — everything the app needs from a queue
// =============================================================================

export interface ScenarioJobData {
  test_run_id: string;
  scenario_run_id: string;
  scenario_id: string;
  agent_id: string;
  agent_type: string;
  max_turns?: number | null;
  benchmark_mode?: boolean;
  creative_mode?: boolean;
  grading_mode?: string;
}

export type JobHandler = (data: ScenarioJobData) => Promise<void>;

export interface JobQueue {
  /** Start the queue (connect, create tables, etc.) */
  start(): Promise<void>;

  /** Enqueue scenario jobs. Returns job IDs. */
  enqueue(jobs: ScenarioJobData[], options?: { group?: { id: string; tier?: string } }): Promise<string[]>;

  /** Cancel queued/active jobs by ID. */
  cancel(jobIds: string[]): Promise<{ canceled: number; failed: number }>;

  /** Register a worker. Called `concurrency` times to create parallel consumers. */
  registerWorker(handler: JobHandler, concurrency: number): Promise<void>;

  /** Graceful shutdown. */
  stop(): Promise<void>;
}

// =============================================================================
// PG-BOSS IMPLEMENTATION
// =============================================================================

import { PgBoss, type Job } from 'pg-boss';

const QUEUE_NAME = 'run-scenario';

class PgBossQueue implements JobQueue {
  private boss: PgBoss;

  constructor(connectionString: string) {
    this.boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
    });

    this.boss.on('error', (error: Error) => {
      logger.error('Queue error', error);
    });
  }

  async start(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(QUEUE_NAME, {
      retryLimit: 2,
      retryDelay: 5,
      expireInSeconds: 7200, // 2 hours
    });
    logger.info('Started');
  }

  async enqueue(jobs: ScenarioJobData[], options?: { group?: { id: string; tier?: string } }): Promise<string[]> {
    const inserts = jobs.map((job) => ({
      data: job,
      ...(options?.group ? { groupId: options.group.id, groupTier: options.group.tier } : {}),
      retryLimit: 2,
      expireInSeconds: 14400, // 4 hours — browser scenarios can take 30+ min per turn
    }));

    const ids = await this.boss.insert(QUEUE_NAME, inserts, { returnId: true });
    if (!ids || ids.length !== jobs.length) {
      throw new Error(`pg-boss insert returned ${ids?.length ?? 0} IDs for ${jobs.length} jobs`);
    }
    return ids;
  }

  async cancel(jobIds: string[]): Promise<{ canceled: number; failed: number }> {
    let canceled = 0;
    for (const id of jobIds) {
      try {
        await this.boss.cancel(QUEUE_NAME, id);
        canceled++;
      } catch {
        // Job may already be completed/canceled
      }
    }
    return { canceled, failed: jobIds.length - canceled };
  }

  async registerWorker(handler: JobHandler, concurrency: number): Promise<void> {
    // pg-boss natively handles per-run concurrency via group + tiers.
    // Jobs tagged with group.id = testRunId are capped per tier (SKIP LOCKED).
    // batchSize = concurrency so a single atomic fetch respects group limits
    // (multiple localConcurrency workers race and bypass group filtering).
    await this.boss.work<ScenarioJobData>(
      QUEUE_NAME,
      {
        batchSize: concurrency,
        groupConcurrency: {
          default: 6,
          tiers: { c1: 1, c2: 2, c3: 3, c4: 4, c5: 5, c7: 7, c8: 8, c9: 9, c10: 10 },
        },
      },
      async (jobs: Job<ScenarioJobData>[]) => {
        const results = await Promise.allSettled(jobs.map((job) => handler(job.data)));
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            logger.error('Scenario job failed after app-level handling', {
              jobId: jobs[index]?.id,
              scenarioRunId: jobs[index]?.data.scenario_run_id,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
          }
        });
      },
    );
  }

  async stop(): Promise<void> {
    await this.boss.stop();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let queue: JobQueue | null = null;

export async function getQueue(): Promise<JobQueue> {
  if (queue) return queue;
  queue = new PgBossQueue(config.databaseUrl);
  await queue.start();
  return queue;
}
