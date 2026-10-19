import { describe, expect, it } from 'vitest';
import { SCAN_RESULTS, scanMessage } from './models';

describe('scanMessage', () => {
  it('says "Already used at 08:42" in Manila time for a second scan (SCN-03)', () => {
    expect(scanMessage('already_used', null, '2026-10-16T00:42:00Z')).toBe('Already used at 8:42 AM');
    expect(scanMessage('already_used', null, null)).toBe('Already used');
  });

  it('gives a clear reason for every kind of rejection', () => {
    expect(scanMessage('valid', null)).toBe('Valid ticket');
    expect(scanMessage('expired', null)).toBe('This ticket has expired');
    expect(scanMessage('invalid', 'not_paid')).toBe('This ticket has not been paid');
    expect(scanMessage('invalid', 'cancelled')).toBe('This ticket was cancelled');
    expect(scanMessage('invalid', 'wrong_station', null, { boardsAt: 'Bus Shelter S2', busAt: 'Bus Shelter S20' })).toBe(
      'Wrong shelter: this ticket boards at Bus Shelter S2, and your bus is at Bus Shelter S20',
    );
    expect(scanMessage('invalid', 'wrong_station')).toBe('Wrong shelter: this ticket boards at a different shelter');
    expect(scanMessage('invalid', 'bus_not_at_station')).toMatch(/not waiting at a shelter/);
    for (const reason of ['bad_token', 'bad_code', 'unknown_ticket', null, 'something-else']) {
      expect(scanMessage('invalid', reason)).toBe('Not a valid BRT ticket');
    }
  });

  it('has a message for every result', () => {
    for (const r of SCAN_RESULTS) expect(scanMessage(r, null, '2026-10-16T00:42:00Z').length).toBeGreaterThan(0);
  });
});
