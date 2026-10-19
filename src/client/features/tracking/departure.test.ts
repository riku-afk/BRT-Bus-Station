import { describe, expect, it } from 'vitest';
import { describeDeparture, minutesUntilManilaTime } from './departure';

const now = Date.parse('2026-10-16T02:00:00Z'); // 10:00 AM in Manila

describe('describeDeparture', () => {
  it('says so when the konduktor has not set a time', () => {
    expect(describeDeparture(null, now)).toEqual({ text: 'No departure time set yet', set: false });
  });

  it('shows the time in Manila time and how many minutes away it is', () => {
    expect(describeDeparture('2026-10-16T02:20:00Z', now)).toEqual({ text: 'Departs about 10:20 AM (in 20 min)', set: true });
  });

  it('rounds a partial minute up, so it never promises a departure that has already happened', () => {
    expect(describeDeparture('2026-10-16T02:00:30Z', now).text).toBe('Departs about 10:00 AM (in 1 min)');
  });

  it('says departing any moment once the time has passed', () => {
    expect(describeDeparture('2026-10-16T01:55:00Z', now)).toEqual({ text: 'Departing any moment', set: true });
    expect(describeDeparture('2026-10-16T02:00:00Z', now).text).toBe('Departing any moment');
  });
});

describe('minutesUntilManilaTime', () => {
  it('turns a Manila clock time today into minutes from now', () => {
    expect(minutesUntilManilaTime('10:20', now)).toEqual({ minutes: 20 });
    expect(minutesUntilManilaTime('12:00', now)).toEqual({ minutes: 120 });
  });

  it('rounds up so the shown time is never a minute early', () => {
    expect(minutesUntilManilaTime('10:20', now - 30_000)).toEqual({ minutes: 21 });
  });

  it('refuses a time that has passed, or is more than 8 hours away, and asks for a time first', () => {
    expect(minutesUntilManilaTime('10:00', now)).toMatchObject({ error: expect.stringContaining('already passed') });
    expect(minutesUntilManilaTime('09:30', now)).toMatchObject({ error: expect.stringContaining('already passed') });
    expect(minutesUntilManilaTime('18:01', now)).toMatchObject({ error: expect.stringContaining('8 hours') });
    expect(minutesUntilManilaTime('18:00', now)).toEqual({ minutes: 480 });
    expect(minutesUntilManilaTime('', now)).toEqual({ error: 'Pick a time first' });
  });

  it('uses the Manila date, not the browser date', () => {
    // 23:30 Manila on the 16th is 15:30Z the same day; 00:10 is "earlier today" in Manila, so it has passed.
    const lateNight = Date.parse('2026-10-16T15:30:00Z');
    expect(minutesUntilManilaTime('23:45', lateNight)).toEqual({ minutes: 15 });
    expect(minutesUntilManilaTime('00:10', lateNight)).toMatchObject({ error: expect.any(String) });
  });
});
