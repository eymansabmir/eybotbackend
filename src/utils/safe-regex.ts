import { Worker } from 'worker_threads';
import path from 'path';

export class SafeRegex {
  private static WORKER_PATH = path.resolve(__dirname, 'safe-regex-worker.js');

  /**
   * Tests a string against a regex pattern in a worker thread with a timeout.
   * Prevents catastrophic backtracking from blocking the main event loop.
   */
  static async test(pattern: string, text: string, timeoutMs: number = 100): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.WORKER_PATH, {
        workerData: { regex: pattern, text }
      });

      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error(`Regex execution timed out after ${timeoutMs}ms (Potential catastrophic backtracking)`));
      }, timeoutMs);

      worker.on('message', (msg) => {
        clearTimeout(timeout);
        worker.terminate();
        if (msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.result);
        }
      });

      worker.on('error', (err) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(err);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }
}
