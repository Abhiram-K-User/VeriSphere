/**
 * @file verification-queue.ts
 * @package apps/api
 * @purpose Bounded in-process worker pool for batch verification jobs.
 *          Runs up to `concurrency` candidate verifications simultaneously without
 *          overwhelming PostgreSQL connections, GitHub API, or LLM rate limits.
 */

type QueueTask = () => Promise<void>;

export class VerificationWorkerQueue {
  private readonly concurrency: number;
  private activeCount = 0;
  private pending: Array<{ label: string; task: QueueTask }> = [];

  constructor(concurrency: number = 4) {
    this.concurrency = Math.max(1, concurrency);
  }

  public enqueue(label: string, task: QueueTask): void {
    this.pending.push({ label, task });
    console.log(
      `[WorkerQueue] Enqueued ${label} (active=${this.activeCount}/${this.concurrency}, queued=${this.pending.length})`
    );
    this.pump();
  }

  private pump(): void {
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift();
      if (!next) break;

      this.activeCount++;
      next
        .task()
        .catch((err) => {
          console.error(`[WorkerQueue] Unhandled error in ${next.label}:`, err);
        })
        .finally(() => {
          this.activeCount--;
          this.pump();
        });
    }
  }
}

export const verificationQueue = new VerificationWorkerQueue(
  Number(process.env.VERIFICATION_CONCURRENCY) || 4
);
