/** In-memory fixed-window rate limiter (single process; the POC has no Redis). */
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function createRateLimiter(options: { max: number; windowMs: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  const hits = new Map<string, { count: number; resetAt: number }>();

  function prune(at: number) {
    if (hits.size < 1000) return;
    for (const [key, entry] of hits) if (entry.resetAt <= at) hits.delete(key);
  }

  return {
    /** Count one attempt for `key`. */
    hit(key: string): RateLimitResult {
      const at = now();
      prune(at);
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= at) {
        hits.set(key, { count: 1, resetAt: at + options.windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      entry.count += 1;
      if (entry.count > options.max) return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - at) / 1000) };
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
