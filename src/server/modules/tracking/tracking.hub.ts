/**
 * Live feed hub (D-02). The simulator runs in a separate process, so it cannot push to this process's SSE streams
 * directly. Instead it writes `bus_positions` and sends NOTIFY; this hub holds ONE dedicated LISTEN connection,
 * re-reads the positions on each notification and fans the result out to every open stream.
 *
 * A slow poll runs alongside as a safety net (a missed notification, a dropped LISTEN connection), and only emits
 * when something actually changed. The hub starts with the first subscriber and shuts down with the last.
 * It is a process-wide singleton on `globalThis` so Next's dev HMR does not leave duplicate listeners behind.
 */
import { Client } from 'pg';
import { env } from '@config/env';
import type { TrackingSnapshot } from '@shared/tracking/models';
import { POSITIONS_CHANNEL } from './tracking.repository';
import { trackingService } from './tracking.service';

type Listener = (snapshot: TrackingSnapshot) => void;

const POLL_MS = 2000;
const RECONNECT_MS = 2000;

export class TrackingHub {
  private listeners = new Set<Listener>();
  /** Subscribers that have not received their first snapshot yet. */
  private fresh = new Set<Listener>();
  private client: Client | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBuses = '';
  private refreshing = false;
  private again = false;

  /** Number of open streams (exposed for tests and diagnostics). */
  get size() {
    return this.listeners.size;
  }

  /**
   * The listener's first call is the current snapshot, then one call per change. Every delivery comes from the same
   * ordered series of reads, so a client can never receive an older state after a newer one.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.fresh.add(listener);
    if (this.listeners.size === 1) void this.start();
    else void this.refresh();
    return () => {
      this.listeners.delete(listener);
      this.fresh.delete(listener);
      if (this.listeners.size === 0) void this.stop();
    };
  }

  private async start() {
    this.pollTimer = setInterval(() => void this.refresh(), POLL_MS);
    this.pollTimer.unref?.();
    void this.refresh(); // the first subscriber should not wait for the LISTEN connection
    await this.connect();
  }

  private async stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.lastBuses = '';
    this.fresh.clear();
    const client = this.client;
    this.client = null;
    if (client) await client.end().catch(() => {});
  }

  private async connect() {
    if (this.listeners.size === 0 || this.client) return;
    const client = new Client({ connectionString: env.database.url });
    try {
      await client.connect();
      // The hub may have been stopped while connecting.
      if (this.listeners.size === 0) return void (await client.end().catch(() => {}));
      client.on('notification', () => void this.refresh());
      client.on('error', () => this.lost(client));
      client.on('end', () => this.lost(client));
      await client.query(`LISTEN ${POSITIONS_CHANNEL}`);
      this.client = client;
      // Anything written while we were connecting.
      void this.refresh();
    } catch {
      await client.end().catch(() => {});
      this.scheduleReconnect();
    }
  }

  private lost(client: Client) {
    if (this.client !== client) return;
    this.client = null;
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.listeners.size === 0 || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_MS);
    this.reconnectTimer.unref?.();
  }

  /** Re-read the positions and emit if they changed. Concurrent calls are coalesced. */
  private async refresh() {
    if (this.listeners.size === 0) return;
    if (this.refreshing) {
      this.again = true;
      return;
    }
    this.refreshing = true;
    try {
      do {
        this.again = false;
        const snapshot = await trackingService.snapshot();
        const buses = JSON.stringify(snapshot.buses);
        const changed = buses !== this.lastBuses;
        this.lastBuses = buses;
        // Everyone gets a change; a new subscriber gets the current state even if nothing changed.
        const recipients = changed ? [...this.listeners] : [...this.fresh];
        for (const listener of recipients) {
          this.fresh.delete(listener);
          listener(snapshot);
        }
      } while (this.again && this.listeners.size > 0);
    } catch (err) {
      console.error(`[tracking-hub] refresh failed: ${(err as Error).message}`);
    } finally {
      this.refreshing = false;
    }
  }
}

const holder = globalThis as typeof globalThis & { __brtTrackingHub?: TrackingHub };
export const trackingHub: TrackingHub = (holder.__brtTrackingHub ??= new TrackingHub());
