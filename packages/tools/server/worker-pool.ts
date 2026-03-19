/**
 * WorkerPool — distributes simulation matches across worker threads.
 *
 * Splits the seed range across N workers. Each worker runs its batch
 * sequentially and posts results back via parentPort messages.
 */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { MatchReport, AITier, MatchMode, GameConfig } from '@alloy/engine';
import type { WorkerData, WorkerMessage } from './worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SimulationRequest {
  /** JSON.stringify'd GameConfig. Pass defaultConfig() if you have no overrides. */
  configJson: string;
  matchCount: number;
  aiTier1: AITier;
  aiTier2: AITier;
  seedStart: number;
  mode: MatchMode;
  baseWeaponId: string;
  baseArmorId: string;
}

export class WorkerPool {
  private readonly workerCount: number;
  private cancelled = false;

  constructor(workerCount?: number) {
    // Default: one worker per logical CPU, minus one for the main thread,
    // minimum 1.
    this.workerCount = workerCount ?? Math.max(1, cpus().length - 1);
  }

  /**
   * Run a simulation by distributing matches across the pool.
   *
   * @param request   Simulation parameters.
   * @param onResult  Called for every successfully completed match.
   * @param onProgress Called after each match (success or failure) with totals.
   * @returns Summary counts once all workers have finished.
   */
  async runSimulation(
    request: SimulationRequest,
    onResult: (report: MatchReport) => void,
    onProgress: (completed: number, total: number) => void,
  ): Promise<{ completed: number; failed: number }> {
    this.cancelled = false;

    const { matchCount, seedStart } = request;
    const actualWorkers = Math.min(this.workerCount, matchCount);

    // Divide seed range into slices — one per worker.
    const batchSizes = distributeBatches(matchCount, actualWorkers);

    let completed = 0;
    let failed = 0;

    const workerPath = join(__dirname, 'worker.ts');

    const workerPromises = batchSizes.map((batchSize, idx) => {
      const batchSeedStart = seedStart + batchSizes.slice(0, idx).reduce((a, b) => a + b, 0);

      const workerData: WorkerData = {
        configJson: request.configJson,
        seedStart: batchSeedStart,
        matchCount: batchSize,
        aiTier1: request.aiTier1,
        aiTier2: request.aiTier2,
        mode: request.mode,
        baseWeaponId: request.baseWeaponId,
        baseArmorId: request.baseArmorId,
      };

      return new Promise<void>((resolve, reject) => {
        const worker = new Worker(workerPath, {
          workerData,
          execArgv: ['--import', 'tsx'],
        });

        worker.on('message', (msg: WorkerMessage) => {
          if (this.cancelled) return;

          if (msg.type === 'result') {
            completed++;
            onResult(msg.report);
            onProgress(completed + failed, matchCount);
          } else if (msg.type === 'error') {
            failed++;
            onProgress(completed + failed, matchCount);
          } else if (msg.type === 'done') {
            worker.terminate();
            resolve();
          }
        });

        worker.on('error', (err) => {
          reject(err);
        });

        worker.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            reject(new Error(`Worker exited with code ${code}`));
          } else {
            // Resolve in case 'done' message was not received before exit.
            resolve();
          }
        });
      });
    });

    await Promise.all(workerPromises);

    return { completed, failed };
  }

  /** Signal all in-flight workers to stop processing new results. */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * terminate() is a no-op here because workers self-terminate after their
   * batch is done. Cancel any in-progress simulation instead.
   */
  terminate(): void {
    this.cancel();
  }
}

/**
 * Distribute `total` matches across `n` workers as evenly as possible.
 * Returns an array of batch sizes that sum to `total`.
 */
function distributeBatches(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const remainder = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
