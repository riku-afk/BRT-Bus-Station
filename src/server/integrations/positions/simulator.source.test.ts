import { describe, expect, it, vi } from 'vitest';
import { buildRoutePath, positionAlongPath, type LatLng } from '@shared/geo/route';
import type { BusPositionUpdate } from '@shared/tracking/models';
import type { PositionSink } from './position-source';
import { SimulatorSource, type SimBus, type SimParking, type SimStation, type SimTrip } from './simulator.source';

// Stations roughly 1 km apart along a meridian: 0.009° of latitude ≈ 1000 m.
const line = (n = 6): SimStation[] =>
  Array.from({ length: n }, (_, i) => ({ id: `st-${i + 1}`, name: `Station ${i + 1}`, latitude: 14 + i * 0.009, longitude: 121 }));
const buses = (prefix: string, n: number): SimBus[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i + 1}`, name: `${prefix} ${i + 1}` }));
const trip = (id: string, busId: string, from: number, to: number): SimTrip => ({
  id,
  busId,
  originStationId: `st-${from}`,
  destinationStationId: `st-${to}`,
});

async function setup(opts: { stations?: SimStation[]; auto?: SimBus[]; crewed?: SimBus[]; parking?: SimParking[]; trips?: SimTrip[]; legs?: (LatLng[] | null)[] } = {}) {
  const state = {
    now: 1_000_000,
    stations: opts.stations ?? line(),
    legs: opts.legs,
    auto: opts.auto ?? [],
    crewed: opts.crewed ?? [],
    parking: new Map((opts.parking ?? []).map((p) => [p.busId, p])),
    trips: opts.trips ?? ([] as SimTrip[]),
    heartbeats: 0,
    finished: [] as { id: string; status: string }[],
    parkCalls: [] as { busId: string; stationId: string }[],
  };
  const published: { updates: BusPositionUpdate[]; replace?: boolean }[] = [];
  const sink: PositionSink = {
    publish: vi.fn(async (updates, options) => {
      published.push({ updates: [...updates], replace: options?.replace });
    }),
  };
  const sim = new SimulatorSource({
    now: () => state.now,
    loadStations: async () => state.stations,
    loadLegs: async () => state.legs ?? [],
    loadAutoBuses: async (limit) => state.auto.slice(0, limit),
    loadCrewedBuses: async () => state.crewed,
    loadParking: async () => [...state.parking.values()],
    loadActiveTrips: async () => [...state.trips],
    parkBus: async (busId, stationId) => {
      state.parkCalls.push({ busId, stationId });
      state.parking.set(busId, { busId, stationId, status: 'available' });
    },
    // What the real dependency does: the database drops the trip, and parks the bus at the destination (or back at the origin).
    finishTrip: async (t, status) => {
      state.finished.push({ id: t.id, status });
      state.trips = state.trips.filter((x) => x.id !== t.id);
      state.parking.set(t.busId, { busId: t.busId, stationId: status === 'completed' ? t.destinationStationId : t.originStationId, status: 'available' });
    },
    heartbeat: async () => void state.heartbeats++,
    // 36 km/h = 10 m/s, 5 s at stations.
    config: { busCount: 3, speedKmh: 36, dwellSeconds: 5, tickMs: 1000 },
  });
  await sim.start(sink);
  await sim.stop(); // clear the loop's timer; tests call tick() themselves
  published.length = 0; // discard the first tick that start() ran
  const tick = async (seconds = 1) => {
    state.now += seconds * 1000;
    await sim.tick();
  };
  /** A konduktor dispatches: the database now says on_road with an en-route trip. */
  const dispatch = (t: SimTrip) => {
    state.trips.push(t);
    state.parking.set(t.busId, { busId: t.busId, stationId: t.originStationId, status: 'on_road' });
  };
  return { sim, state, published, tick, dispatch };
}

type Published = { updates: BusPositionUpdate[] }[];
const latest = (published: Published) => published[published.length - 1]!.updates;
const byBus = (published: Published, busId: string) => latest(published).find((u) => u.busId === busId);

describe('buses with no konduktor run the line on their own', () => {
  it('start moving as soon as the worker ticks, with no command, and check in with a heartbeat', async () => {
    const { state, tick, published } = await setup({ auto: buses('auto', 2) });
    const before = state.heartbeats;
    await tick(1);
    await tick(10);
    expect(state.heartbeats).toBe(before + 2);
    expect(published.every((p) => p.replace === true)).toBe(true);
    const [a, b] = latest(published);
    expect(a!.speedKmh).toBe(36);
    expect(b!.speedKmh).toBe(36);
    expect(a!.service).toBe('line');
  });

  it('are placed evenly along the line, alternating direction, and move at the configured speed', async () => {
    const { tick, published } = await setup({ auto: buses('auto', 2) });
    await tick(1);
    const p0 = latest(published);
    expect(p0.map((u) => u.direction)).toEqual([1, -1]);
    expect(p0[0]!.distanceMeters).toBeGreaterThan(1200);
    expect(p0[0]!.distanceMeters).toBeLessThan(1300);
    for (let i = 0; i < 10; i++) await tick(1);
    const p1 = latest(published);
    expect(p1[0]!.distanceMeters - p0[0]!.distanceMeters).toBeCloseTo(100, 0);
    expect(p0[1]!.distanceMeters - p1[1]!.distanceMeters).toBeCloseTo(100, 0);
  });

  it('say where each run came from and where it ends: the two terminals, swapping when they turn around', async () => {
    const { tick, published } = await setup({ auto: buses('auto', 1) });
    await tick(1);
    expect(latest(published)[0]).toMatchObject({ originStationId: 'st-1', destinationStationId: 'st-6', tripId: null });
    let swapped = false;
    for (let i = 0; i < 900 && !swapped; i++) {
      await tick(1);
      const u = latest(published)[0]!;
      if (u.originStationId === 'st-6') {
        swapped = true;
        expect(u.destinationStationId).toBe('st-1');
        expect(u.direction).toBe(-1);
      }
    }
    expect(swapped).toBe(true);
  });

  it('dwell at stations and stay on the line over a long run', async () => {
    const { tick, published } = await setup({ auto: buses('auto', 1) });
    let sawDwell = false;
    for (let i = 0; i < 1500; i++) {
      await tick(1);
      const u = latest(published)[0]!;
      expect(u.distanceMeters).toBeGreaterThanOrEqual(0);
      expect(u.distanceMeters).toBeLessThanOrEqual(5010);
      if (u.atStation) {
        sawDwell = true;
        expect(u.speedKmh).toBe(0);
      }
    }
    expect(sawDwell).toBe(true);
  });

  it('respect the configured bus count and follow buses entering and leaving service', async () => {
    const { state, tick, published } = await setup({ auto: buses('auto', 8) });
    await tick(1);
    expect(latest(published)).toHaveLength(3);
    state.auto = buses('auto', 2);
    await tick(1);
    expect(latest(published).map((u) => u.busId)).toEqual(['auto-1', 'auto-2']);
  });

  it('never simulate more than a few seconds per tick after a stall, and stay on the line when stations are removed', async () => {
    const { state, tick, published } = await setup({ auto: buses('auto', 2) });
    await tick(1);
    const before = latest(published)[0]!.distanceMeters;
    await tick(600);
    expect(Math.abs(latest(published)[0]!.distanceMeters - before)).toBeLessThanOrEqual(10 * 5 + 1);
    state.stations = line(4);
    await tick(1);
    for (const u of latest(published)) expect(u.distanceMeters).toBeLessThanOrEqual(3 * 0.009 * 111_195 + 1);
  });

  it('refuse to tick before there is a sink', async () => {
    const sim = new SimulatorSource({
      now: () => 0,
      loadStations: async () => [],
      loadAutoBuses: async () => [],
      loadCrewedBuses: async () => [],
      loadParking: async () => [],
      loadActiveTrips: async () => [],
      parkBus: async () => {},
      finishTrip: async () => {},
      heartbeat: async () => {},
      config: { busCount: 1, speedKmh: 10, dwellSeconds: 0, tickMs: 1000 },
    });
    await expect(sim.tick()).rejects.toThrow(/before start/);
  });
});

describe('crewed buses wait for their konduktor', () => {
  it('are parked at stations, spread along the line, and do not move on their own', async () => {
    const { state, tick, published } = await setup({ crewed: buses('crew', 3) });
    await tick(1);
    const first = latest(published);
    expect(first).toHaveLength(3);
    for (const u of first) expect(u).toMatchObject({ service: 'parked', atStation: true, speedKmh: 0, destinationStationId: null, tripId: null, nextStationId: null });
    // Each on a different station (6 stations, 3 buses), recorded as available.
    expect(new Set(first.map((u) => u.originStationId)).size).toBe(3);
    expect(state.parkCalls.map((c) => c.busId)).toEqual(['crew-1', 'crew-2', 'crew-3']);

    for (let i = 0; i < 30; i++) await tick(1);
    const later = latest(published);
    expect(later.map((u) => u.distanceMeters)).toEqual(first.map((u) => u.distanceMeters));
    expect(later.map((u) => [u.latitude, u.longitude])).toEqual(first.map((u) => [u.latitude, u.longitude]));
  });

  it('keep the station they were already parked at, without being placed again', async () => {
    const { state, tick, published } = await setup({ crewed: buses('crew', 1), parking: [{ busId: 'crew-1', stationId: 'st-4', status: 'available' }] });
    await tick(1);
    expect(byBus(published, 'crew-1')).toMatchObject({ service: 'parked', originStationId: 'st-4' });
    expect(state.parkCalls).toEqual([]);
  });

  it('are parked somewhere else when their station leaves service', async () => {
    const { state, tick, published } = await setup({ crewed: buses('crew', 1), parking: [{ busId: 'crew-1', stationId: 'st-4', status: 'available' }] });
    await tick(1);
    state.stations = line().filter((s) => s.id !== 'st-4');
    await tick(1);
    const u = byBus(published, 'crew-1')!;
    expect(u.originStationId).not.toBe('st-4');
    expect(state.parkCalls).toHaveLength(1);
    expect(state.parking.get('crew-1')).toMatchObject({ status: 'available', stationId: u.originStationId });
  });

  it('are parked again at their origin when they were on the road but the trip is gone (a worker restart)', async () => {
    const { state, tick, published } = await setup({ crewed: buses('crew', 1), parking: [{ busId: 'crew-1', stationId: 'st-3', status: 'on_road' }] });
    await tick(1);
    expect(byBus(published, 'crew-1')).toMatchObject({ service: 'parked', originStationId: 'st-3' });
    expect(state.parking.get('crew-1')).toMatchObject({ status: 'available', stationId: 'st-3' });
  });
});

describe('a konduktor dispatches a crewed bus', () => {
  const crewedAt = (st: number) => ({ crewed: buses('crew', 1), parking: [{ busId: 'crew-1', stationId: `st-${st}`, status: 'available' as const }] });

  it('leaves at once from where it was parked, labelled as a dispatch from there to the destination', async () => {
    const { tick, published, dispatch } = await setup(crewedAt(2));
    await tick(1);
    dispatch(trip('trip-1', 'crew-1', 2, 5));
    await tick(1); // the trip is picked up
    const start = byBus(published, 'crew-1')!;
    expect(start).toMatchObject({ service: 'dispatch', tripId: 'trip-1', originStationId: 'st-2', destinationStationId: 'st-5', nextStationId: 'st-5', atStation: false, speedKmh: 36 });
    await tick(5);
    expect(byBus(published, 'crew-1')!.distanceMeters).toBeGreaterThan(start.distanceMeters + 40); // already moving, no waiting
  });

  it('drives non-stop, dwells at the destination, then is parked there, available again', async () => {
    const { state, tick, published, dispatch } = await setup(crewedAt(2));
    await tick(1);
    dispatch(trip('trip-1', 'crew-1', 2, 5));
    await tick(1);
    const startDistance = byBus(published, 'crew-1')!.distanceMeters;

    const trail: BusPositionUpdate[] = [];
    for (let i = 0; i < 600 && state.finished.length === 0; i++) {
      await tick(1);
      const u = byBus(published, 'crew-1');
      if (u && u.service === 'dispatch') trail.push(u);
    }
    expect(state.finished).toEqual([{ id: 'trip-1', status: 'completed' }]);
    // Express: the only stop is the destination (3 km ≈ 300 s at 10 m/s).
    const middleStops = trail.filter((u) => u.atStation && u.distanceMeters > startDistance + 10 && u.distanceMeters < startDistance + 2990);
    expect(middleStops).toHaveLength(0);
    expect(trail.filter((u) => u.atStation).length).toBeGreaterThanOrEqual(3); // dwelt at the destination

    // In the very tick the trip ended it is parked at the destination, and it stays there.
    expect(byBus(published, 'crew-1')).toMatchObject({ service: 'parked', originStationId: 'st-5', atStation: true, speedKmh: 0, tripId: null });
    expect(state.parking.get('crew-1')).toMatchObject({ status: 'available', stationId: 'st-5' });
    const parkedAt = byBus(published, 'crew-1')!.distanceMeters;
    for (let i = 0; i < 20; i++) await tick(1);
    expect(byBus(published, 'crew-1')).toMatchObject({ service: 'parked', originStationId: 'st-5', distanceMeters: parkedAt });
  });

  it('can run against the direction of the line, and be dispatched again from where it arrived', async () => {
    const { state, tick, published, dispatch } = await setup(crewedAt(5));
    await tick(1);
    dispatch(trip('t1', 'crew-1', 5, 2));
    let last = Infinity;
    for (let i = 0; i < 600 && state.finished.length === 0; i++) {
      await tick(1);
      const u = byBus(published, 'crew-1');
      if (u?.service === 'dispatch') {
        expect(u.direction).toBe(-1);
        expect(u.distanceMeters).toBeLessThanOrEqual(last + 0.001);
        last = u.distanceMeters;
      }
    }
    expect(state.finished[0]).toEqual({ id: 't1', status: 'completed' });
    expect(byBus(published, 'crew-1')).toMatchObject({ service: 'parked', originStationId: 'st-2' });

    // The second dispatch starts where the first ended.
    dispatch(trip('t2', 'crew-1', 2, 6));
    await tick(1);
    expect(byBus(published, 'crew-1')).toMatchObject({ service: 'dispatch', originStationId: 'st-2', destinationStationId: 'st-6' });
  });

  it('is cancelled, and the bus parked back at its origin, if a station on the trip leaves service', async () => {
    const { state, tick, published, dispatch } = await setup(crewedAt(2));
    await tick(1);
    dispatch(trip('trip-1', 'crew-1', 2, 5));
    await tick(1);
    state.stations = line().filter((s) => s.id !== 'st-5');
    await tick(1);
    expect(state.finished).toEqual([{ id: 'trip-1', status: 'cancelled' }]);
    expect(byBus(published, 'crew-1')).toMatchObject({ service: 'parked', originStationId: 'st-2' });
  });

  it('is cancelled if the bus loses its konduktor, after which it runs the line by itself', async () => {
    const { state, tick, published, dispatch } = await setup(crewedAt(2));
    await tick(1);
    dispatch(trip('trip-1', 'crew-1', 2, 5));
    await tick(1);
    state.crewed = [];
    state.auto = [{ id: 'crew-1', name: 'crew 1' }];
    await tick(1);
    expect(state.finished).toEqual([{ id: 'trip-1', status: 'cancelled' }]);
    expect(byBus(published, 'crew-1')).toMatchObject({ service: 'line' });
  });

  it('several crewed buses run their own trips independently', async () => {
    const { state, tick, published, dispatch } = await setup({
      crewed: buses('crew', 2),
      parking: [
        { busId: 'crew-1', stationId: 'st-1', status: 'available' },
        { busId: 'crew-2', stationId: 'st-6', status: 'available' },
      ],
    });
    await tick(1);
    dispatch(trip('t1', 'crew-1', 1, 4));
    await tick(1);
    for (let i = 0; i < 30; i++) await tick(1);
    expect(byBus(published, 'crew-1')).toMatchObject({ service: 'dispatch', direction: 1 });
    expect(byBus(published, 'crew-2')).toMatchObject({ service: 'parked', originStationId: 'st-6' }); // not dispatched: still waiting
    expect(state.finished).toEqual([]);
  });

  it('a bus out on a trip is never also driving the line', async () => {
    const { state, tick, published, dispatch } = await setup({ ...crewedAt(2), auto: buses('auto', 1) });
    await tick(1);
    dispatch(trip('t1', 'crew-1', 2, 5));
    state.auto = [...state.auto, { id: 'crew-1', name: 'crew 1' }]; // misreported as un-crewed too
    await tick(1);
    expect(latest(published).filter((u) => u.busId === 'crew-1')).toHaveLength(1);
    expect(byBus(published, 'crew-1')!.service).toBe('dispatch');
  });

  it('runs alongside the automatic buses, which keep going', async () => {
    const { tick, published, dispatch } = await setup({ ...crewedAt(2), auto: buses('auto', 2) });
    await tick(1);
    dispatch(trip('t1', 'crew-1', 2, 5));
    for (let i = 0; i < 10; i++) await tick(1);
    expect(latest(published).map((u) => [u.busId, u.service])).toEqual([
      ['crew-1', 'dispatch'],
      ['auto-1', 'line'],
      ['auto-2', 'line'],
    ]);
  });

  it('everything is cancelled and the map cleared once when the line has fewer than two stations', async () => {
    const { state, tick, published, dispatch } = await setup(crewedAt(2));
    await tick(1);
    dispatch(trip('t1', 'crew-1', 2, 5));
    await tick(1);
    published.length = 0;
    state.stations = line(1);
    await tick(1);
    expect(published).toEqual([{ updates: [], replace: true }]);
    expect(state.finished).toEqual([{ id: 't1', status: 'cancelled' }]);
  });
});

describe('buses drive along the real road, not the straight line', () => {
  // The road from station 1 to station 2 bows far out east (about 2.4 km long instead of 1 km).
  const bend: LatLng[] = [
    { latitude: 14.0005, longitude: 121.0005 },
    { latitude: 14.0045, longitude: 121.012 },
    { latitude: 14.0085, longitude: 121.0005 },
  ];
  const stations = line(3);
  const path = buildRoutePath(
    stations.map((st) => ({ latitude: st.latitude, longitude: st.longitude })),
    [bend, null],
  );

  it('a dispatched bus follows the bend: positions are on the road and distances are measured along it', async () => {
    const { tick, dispatch, published, state } = await setup({ stations, crewed: buses('crew', 1), parking: [{ busId: 'crew-1', stationId: 'st-1', status: 'available' }], legs: [bend, null] });
    dispatch(trip('t1', 'crew-1', 1, 2));
    let farEast = 0;
    let last: BusPositionUpdate | undefined;
    for (let i = 0; i < 400 && state.trips.length > 0; i++) {
      await tick(1);
      last = byBus(published, 'crew-1');
      if (!last) continue;
      const expected = positionAlongPath(path, last.distanceMeters);
      expect(last.latitude).toBeCloseTo(expected.latitude, 6);
      expect(last.longitude).toBeCloseTo(expected.longitude, 6);
      farEast = Math.max(farEast, last.longitude);
    }
    expect(farEast).toBeGreaterThan(121.01); // it went out to the bend; a straight line never leaves longitude 121
    expect(state.finished.map((x) => x.status)).toEqual(['completed']);
    // The road is much longer than the straight 1 km, and the trip took that long: at 10 m/s.
    expect(path.stationDistances[1]).toBeGreaterThan(2200);
  });

  it('a bus on the line (no konduktor) follows it too, and its distance runs to the end of the road, not the straight line', async () => {
    const { tick, published } = await setup({ stations, auto: buses('auto', 1), legs: [bend, null] });
    let maxDistance = 0;
    let farEast = 0;
    for (let i = 0; i < 700; i++) {
      await tick(1);
      const u = byBus(published, 'auto-1');
      if (!u) continue;
      maxDistance = Math.max(maxDistance, u.distanceMeters);
      farEast = Math.max(farEast, u.longitude);
    }
    expect(maxDistance).toBeGreaterThan(3000); // straight it would be about 2 km
    expect(maxDistance).toBeLessThanOrEqual(path.totalMeters + 1);
    expect(farEast).toBeGreaterThan(121.01);
  });

  it('without any road it is the straight line, as before', async () => {
    const { tick, published } = await setup({ stations, auto: buses('auto', 1) });
    for (let i = 0; i < 300; i++) {
      await tick(1);
      expect(byBus(published, 'auto-1')!.longitude).toBe(121);
    }
  });

  it('when the road arrives later the buses are placed on it afresh, not left at distances measured on the old line', async () => {
    const { tick, published, state } = await setup({ stations, auto: buses('auto', 1) });
    await tick(3);
    state.legs = [bend, null];
    await tick(1);
    const u = byBus(published, 'auto-1')!;
    const onRoad = positionAlongPath(path, u.distanceMeters);
    expect(u.latitude).toBeCloseTo(onRoad.latitude, 6);
    expect(u.longitude).toBeCloseTo(onRoad.longitude, 6);
  });
});
