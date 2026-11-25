/**
 * @file token-bucket.ts
 * @package @verisphere/ai-layer
 * @purpose Smooth token-bucket pacer for LLM providers with strict TPM limits (e.g., Groq free tier 8,000 TPM).
 *          Prevents concurrent batch verification jobs from slamming the API in the same second and hitting 429/413.
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
    // Conservative ~3.5 chars/token + ~700 output token headroom
    return Math.min(this.capacity - 200, Math.ceil((text || "").length / 3.5) + 700);
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
