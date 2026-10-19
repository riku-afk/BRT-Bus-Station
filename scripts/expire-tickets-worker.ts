/**
 * Ticket expiry worker (TKT-07, TKT-04).
 *   - tickets left in pending_payment longer than TICKET_PENDING_TTL_MINUTES become `expired`, and their open checkouts
 *     are closed (a late payment for one is flagged for an admin, never lost);
 *   - paid tickets whose Manila day has ended become `expired`.
 * Idempotent and safe to run more than once at the same time: every change is a conditional update that skips rows
 * another process is working on.
 *
 *   bun run worker:expire            (or `bun run workers` to run it together with the bus simulator)
 */
import { env } from '@config/env';
import { closeDatabase } from '@core/database';
import { ticketsService } from '@modules/tickets';

const intervalMs = env.tickets.expiryIntervalSeconds * 1000;
console.log(`[expiry] unpaid tickets expire after ${env.tickets.pendingTtlMinutes} min; checking every ${env.tickets.expiryIntervalSeconds}s`);

let running = true;
let timer: ReturnType<typeof setTimeout> | null = null;

async function pass() {
  try {
    const { unpaid, lapsed } = await ticketsService.expireStale();
    if (unpaid > 0 || lapsed > 0) console.log(`[expiry] expired ${unpaid} unpaid and ${lapsed} lapsed ticket(s)`);
  } catch (err) {
    console.error(`[expiry] pass failed: ${(err as Error).message}`);
  }
  if (running) timer = setTimeout(pass, intervalMs);
}

async function shutdown() {
  running = false;
  if (timer) clearTimeout(timer);
  await closeDatabase();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await pass();
