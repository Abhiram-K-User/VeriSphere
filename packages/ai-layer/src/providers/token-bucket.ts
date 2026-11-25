/**
 * @file token-bucket.ts
 * @package @verisphere/ai-layer
 * @purpose Smooth token-bucket pacer for LLM providers with strict TPM limits (e.g., Groq free tier 8,000 TPM).
 *          Supports instant availability probing (`tryAcquire`) so the multi-model/multi-provider
 *          dispatcher can immediately route to another free bucket with 0ms wait instead of stalling.
 */

export class TokenBucketLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefillTime: number;
  private queue: Array<() => void> = [];
  private processing = false;

  constructor(tokensPerMinute: number = 7200) {
    this.capacity = tokensPerMinute;
    this.tokens = tokensPerMinute;
    this.refillPerMs = tokensPerMinute / 60_000;
    this.lastRefillTime = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = Math.max(0, now - this.lastRefillTime);
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefillTime = now;
  }

  public estimateTokens(text: string): number {
    // Conservative ~3.6 chars/token + ~650 output token headroom
    return Math.min(this.capacity - 200, Math.ceil((text || "").length / 3.6) + 650);
  }

  /**
   * Non-blocking check & deduction: returns true immediately if enough tokens are available right now.
   */
  public tryAcquire(cost: number): boolean {
    const boundedCost = Math.min(Math.max(cost, 500), this.capacity);
    this.refill();
    if (this.tokens >= boundedCost) {
      this.tokens -= boundedCost;
      return true;
    }
    return false;
  }

  /**
   * Returns estimated milliseconds until `cost` tokens will be available.
   */
  public estimatedWaitMs(cost: number): number {
    const boundedCost = Math.min(Math.max(cost, 500), this.capacity);
    this.refill();
    if (this.tokens >= boundedCost) return 0;
    return Math.ceil((boundedCost - this.tokens) / this.refillPerMs);
  }

  /**
   * Marks this bucket as temporarily depleted (e.g., after an upstream 429).
   */
  public markDepleted(): void {
    this.tokens = 0;
    this.lastRefillTime = Date.now();
  }

  public async acquire(cost: number): Promise<void> {
    const boundedCost = Math.min(Math.max(cost, 500), this.capacity);

    return new Promise<void>((resolve) => {
      const attempt = () => {
        this.refill();
        if (this.tokens >= boundedCost) {
          this.tokens -= boundedCost;
          resolve();
          return;
        }
        const deficit = boundedCost - this.tokens;
        const waitMs = Math.min(Math.max(Math.ceil(deficit / this.refillPerMs), 300), 15_000);
        setTimeout(attempt, waitMs);
      };

      this.queue.push(attempt);
      this.drain();
    });
  }

  private drain(): void {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
    this.processing = false;
  }
}
