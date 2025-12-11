/**
 * Universal Context Engine - Parallel Indexer
 * @module core/parallel-indexer
 *
 * Multi-threaded parallel indexing using worker threads.
 * Significantly faster for large codebases (100K+ files).
 */

import { Worker } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import type { FileIndex } from './incremental-indexer.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Parallel indexer configuration
 */
export interface ParallelIndexerConfig {
  /** Number of worker threads (default: CPU cores) */
  workers?: number;
  /** Files per batch */
  batchSize?: number;
  /** Worker script path */
  workerScript?: string;
}

/**
 * Indexing task
 */
export interface IndexingTask {
  /** Task ID */
  id: string;
  /** Files to index */
  files: string[];
  /** Project root */
  projectRoot: string;
}

/**
 * Indexing result
 */
export interface IndexingResult {
  /** Task ID */
  id: string;
  /** Indexed files */
  files: Map<string, FileIndex>;
  /** Errors */
  errors: Array<{ file: string; error: string }>;
}

/**
 * Progress callback
 */
export type ProgressCallback = (progress: {
  processed: number;
  total: number;
  percentage: number;
}) => void;

// =============================================================================
// Parallel Indexer
// =============================================================================

/**
 * Parallel indexer using worker threads
 *
 * Usage:
 * ```typescript
 * const indexer = new ParallelIndexer({
 *   workers: 8,
 *   batchSize: 100,
 * });
 *
 * const results = await indexer.indexFiles(files, projectRoot, (progress) => {
 *   console.log(`Progress: ${progress.percentage}%`);
 * });
 * ```
 */
export class ParallelIndexer {
  private config: Required<ParallelIndexerConfig>;
  private workers: Worker[] = [];
  private taskQueue: IndexingTask[] = [];

  constructor(config?: ParallelIndexerConfig) {
    const cpuCount = os.cpus().length;
    this.config = {
      workers: config?.workers || Math.max(1, cpuCount - 1),
      batchSize: config?.batchSize || 50,
      workerScript: config?.workerScript || path.join(__dirname, 'indexer-worker.js'),
    };

    logger.info('Parallel indexer initialized', {
      workers: this.config.workers,
      batchSize: this.config.batchSize,
    });
  }

  /**
   * Index files in parallel
   */
  async indexFiles(
    files: string[],
    projectRoot: string,
    onProgress?: ProgressCallback
  ): Promise<Map<string, FileIndex>> {
    const startTime = performance.now();

    // Create tasks
    const tasks = this.createTasks(files, projectRoot);
    this.taskQueue = tasks;

    logger.info('Starting parallel indexing', {
      files: files.length,
      tasks: tasks.length,
      workers: this.config.workers,
    });

    // Process tasks in parallel
    const resultMap = await this.processTasks(tasks, onProgress);

    const duration = performance.now() - startTime;
    logger.info('Parallel indexing complete', {
      files: files.length,
      duration: `${duration.toFixed(0)}ms`,
      filesPerSecond: (files.length / duration) * 1000,
    });

    return resultMap;
  }

  /**
   * Cleanup workers
   */
  async dispose(): Promise<void> {
    for (const worker of this.workers) {
      await worker.terminate();
    }
    this.workers = [];
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private createTasks(files: string[], projectRoot: string): IndexingTask[] {
    const tasks: IndexingTask[] = [];

    for (let i = 0; i < files.length; i += this.config.batchSize) {
      const batch = files.slice(i, i + this.config.batchSize);
      tasks.push({
        id: `task-${i / this.config.batchSize}`,
        files: batch,
        projectRoot,
      });
    }

    return tasks;
  }

  private async processTasks(
    tasks: IndexingTask[],
    onProgress?: ProgressCallback
  ): Promise<Map<string, FileIndex>> {
    return new Promise((resolve, reject) => {
      let completed = 0;
      const totalFiles = tasks.reduce((sum, task) => sum + task.files.length, 0);
      let processedFiles = 0;
      const resultMap = new Map<string, FileIndex>();
      const errors: Array<{ file: string; error: string }> = [];

      // Create worker pool
      for (let i = 0; i < this.config.workers; i++) {
        const worker = new Worker(this.config.workerScript, {
          workerData: { workerId: i },
        });

        worker.on('message', (result: IndexingResult) => {
          // Collect results
          for (const [file, fileIndex] of result.files.entries()) {
            resultMap.set(file, fileIndex);
          }
          errors.push(...result.errors);

          processedFiles += result.files.size;
          completed++;

          // Report progress
          if (onProgress) {
            onProgress({
              processed: processedFiles,
              total: totalFiles,
              percentage: (processedFiles / totalFiles) * 100,
            });
          }

          // Check if all tasks complete
          if (completed === tasks.length) {
            this.dispose();
            if (errors.length > 0) {
              logger.warn('Some files failed to index', { errors: errors.length });
            }
            resolve(resultMap);
          } else {
            // Send next task
            const nextTask = this.taskQueue.shift();
            if (nextTask) {
              worker.postMessage(nextTask);
            }
          }
        });

        worker.on('error', (error) => {
          logger.error('Worker error', { error });
          reject(error);
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            logger.error('Worker exited with error', { code });
          }
        });

        // Send initial task
        const task = this.taskQueue.shift();
        if (task) {
          worker.postMessage(task);
        }

        this.workers.push(worker);
      }
    });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new parallel indexer
 */
export function createParallelIndexer(config?: ParallelIndexerConfig): ParallelIndexer {
  return new ParallelIndexer(config);
}
