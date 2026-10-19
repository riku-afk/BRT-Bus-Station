import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { TrackingSnapshot } from '@shared/tracking/models';
import { useBusStream } from './use-bus-stream';

/** Just enough of EventSource for the hook: named listeners plus open / error callbacks. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent<string>);
  }
}

const snapshot = (names: string[]): TrackingSnapshot => ({
  serverTime: new Date().toISOString(),
  buses: names.map((busName, i) => ({
    busId: `id-${i}`, busName, plateNumber: `P${i}`, latitude: 14, longitude: 121, headingDegrees: 0, speedKmh: 40,
    distanceMeters: 0, direction: 1, nextStationId: null, nextStationName: null, atStation: false, service: 'line', originStationId: null,
    originStationName: null, destinationStationId: null, destinationStationName: null, konduktorName: null, tripId: null, dispatchedAt: null,
    expectedDepartureAt: null, plannedDestinationId: null, plannedDestinationName: null, headingToId: null, headingToName: null, updatedAt: new Date().toISOString(),
  })),
});

function Probe() {
  const { buses, connected } = useBusStream();
  return <div data-testid="out">{connected ? 'live' : 'offline'}:{buses.map((b) => b.busName).join(',')}</div>;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});
afterEach(() => {
  cleanup();
  delete (globalThis as { EventSource?: unknown }).EventSource;
});

describe('useBusStream', () => {
  it('connects to the tracking stream and replaces its state with every message', () => {
    render(<Probe />);
    const es = FakeEventSource.instances[0]!;
    expect(es.url).toBe('/api/tracking/stream');
    expect(screen.getByTestId('out').textContent).toBe('offline:');

    act(() => es.emit('snapshot', snapshot(['Bus 1', 'Bus 2'])));
    expect(screen.getByTestId('out').textContent).toBe('live:Bus 1,Bus 2');

    act(() => es.emit('positions', snapshot(['Bus 1'])));
    expect(screen.getByTestId('out').textContent).toBe('live:Bus 1');
  });

  it('keeps the last known positions while reconnecting', () => {
    render(<Probe />);
    const es = FakeEventSource.instances[0]!;
    act(() => es.emit('snapshot', snapshot(['Bus 1'])));
    es.readyState = 0; // the browser is retrying
    act(() => es.onerror?.());
    expect(screen.getByTestId('out').textContent).toBe('offline:Bus 1');
    es.readyState = FakeEventSource.OPEN;
    act(() => es.onopen?.());
    expect(screen.getByTestId('out').textContent).toBe('live:Bus 1');
  });

  it('ignores malformed messages and closes the stream on unmount', () => {
    const { unmount } = render(<Probe />);
    const es = FakeEventSource.instances[0]!;
    act(() => es.emit('snapshot', snapshot(['Bus 1'])));
    act(() => es.emit('positions', 'not json'));
    expect(screen.getByTestId('out').textContent).toBe('live:Bus 1');
    unmount();
    expect(es.closed).toBe(true);
  });
});
