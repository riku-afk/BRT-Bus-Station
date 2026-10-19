import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('rate limiter', () => {
  it('blocks after max attempts and recovers after the window', () => {
    let t = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => t });
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(true);
    const blocked = limiter.hit('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.hit('b').allowed).toBe(true);
    t = 1001;
    expect(limiter.hit('a').allowed).toBe(true);
  });

  it('reset clears the counter', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
    limiter.hit('a');
    expect(limiter.hit('a').allowed).toBe(false);
    limiter.reset('a');
    expect(limiter.hit('a').allowed).toBe(true);
  });
});
