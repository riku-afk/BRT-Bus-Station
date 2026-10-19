import { useEffect, useState } from 'react';
import type { BusPosition, TrackingSnapshot } from '@shared/tracking/models';

export type BusStream = { buses: readonly BusPosition[]; connected: boolean };

const STREAM_URL = '/api/tracking/stream';

/**
 * Live bus positions over Server-Sent Events (TRK-04). The server sends the full list on connect and again on every
 * change, so each message simply replaces the state. `EventSource` reconnects by itself after a drop.
 */
export function useBusStream(): BusStream {
  const [state, setState] = useState<BusStream>({ buses: [], connected: false });

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(STREAM_URL);

    const onSnapshot = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data) as TrackingSnapshot;
        setState({ buses: snapshot.buses, connected: true });
      } catch {
        // Ignore a malformed message; the next one replaces the state anyway.
      }
    };
    source.addEventListener('snapshot', onSnapshot as EventListener);
    source.addEventListener('positions', onSnapshot as EventListener);
    source.onopen = () => setState((s) => ({ ...s, connected: true }));
    // While the browser retries, show "reconnecting" but keep the last known positions on the map.
    source.onerror = () => setState((s) => ({ ...s, connected: source.readyState === EventSource.OPEN }));

    return () => source.close();
  }, []);

  return state;
}
