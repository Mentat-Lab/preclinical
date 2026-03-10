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
}

export type JobHandler = (data: ScenarioJobData) => Promise<void>;

export interface JobQueue {
  /** Start the queue (connect, create tables, etc.) */
  start(): Promise<void>;

  /** Enqueue scenario jobs. Returns job IDs. */
  enqueue(jobs: ScenarioJobData[]): Promise<string[]>;

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

  async enqueue(jobs: ScenarioJobData[]): Promise<string[]> {
    const ids: string[] = [];
    try {
      for (const job of jobs) {
        const id = await this.boss.send(QUEUE_NAME, job, {
          retryLimit: 2,
          expireInSeconds: 1800, // 30 minutes
        });
        if (!id) {
          throw new Error('pg-boss send returned no job id');
        }
        ids.push(id);
      }
      return ids;
    } catch (error) {
      if (ids.length > 0) {
        logger.warn('Enqueue failed after partial success, rolling back queued jobs', {
          queuedCount: ids.length,
          requestedCount: jobs.length,
        });
        await this.cancel(ids);
      }
      throw error;
    }
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
    for (let i = 0; i < concurrency; i++) {
      await this.boss.work<ScenarioJobData>(
        QUEUE_NAME,
        { batchSize: 1 },
        async ([job]: Job<ScenarioJobData>[]) => {
          await handler(job.data);
        },
      );
    }
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
