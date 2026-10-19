/**
 * Where bus positions come from (TRK-02). Everything downstream — the database, the SSE feed, ETA and both maps —
 * reads `bus_positions` only, so a source can be swapped without touching consumers:
 *
 *   simulator      scripts/bus-simulator-worker.ts drives fake buses along the line (this POC)
 *   konduktor-gps  later: the konduktor's phone POSTs its location; the handler calls the same sink
 */
import type { BusPositionUpdate } from '@shared/tracking/models';

export interface PositionSink {
  /**
   * Store the latest positions and notify listeners.
   * `replace: true` also removes positions of buses not listed, for sources that own the whole fleet (the simulator).
   * A GPS source reporting a single bus leaves it off.
   */
  publish(updates: readonly BusPositionUpdate[], options?: { replace?: boolean }): Promise<void>;
}

export interface BusPositionSource {
  readonly name: 'simulator' | 'konduktor-gps';
  /** Begin reporting positions to `sink` until `stop()` is called. */
  start(sink: PositionSink): Promise<void>;
  stop(): Promise<void>;
}
