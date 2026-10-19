import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isTerminalStatus, TICKET_STATUSES, TICKET_STATUS_LABEL, TICKET_TRANSITIONS } from './status';

describe('ticket status machine', () => {
  it('allows exactly the moves in the plan', () => {
    expect(canTransition('pending_payment', 'paid')).toBe(true);
    expect(canTransition('pending_payment', 'expired')).toBe(true);
    expect(canTransition('pending_payment', 'cancelled')).toBe(true);
    expect(canTransition('paid', 'used')).toBe(true);
    expect(canTransition('paid', 'expired')).toBe(true);
  });

  it('never lets a ticket skip payment, be used twice, or come back from a final state', () => {
    expect(canTransition('pending_payment', 'used')).toBe(false); // cannot be scanned before it is paid
    expect(canTransition('paid', 'pending_payment')).toBe(false);
    expect(canTransition('paid', 'cancelled')).toBe(false); // no refunds in the POC
    expect(canTransition('used', 'used')).toBe(false); // a second scan cannot succeed
    expect(canTransition('used', 'paid')).toBe(false);
    expect(canTransition('expired', 'paid')).toBe(false);
    expect(canTransition('cancelled', 'paid')).toBe(false);
  });

  it('treats used, expired and cancelled as final', () => {
    for (const s of TICKET_STATUSES) expect(isTerminalStatus(s)).toBe(['used', 'expired', 'cancelled'].includes(s));
  });

  it('asserts moves, throwing on an illegal one', () => {
    expect(() => assertTransition('pending_payment', 'paid')).not.toThrow();
    expect(() => assertTransition('used', 'paid')).toThrow(/Illegal ticket transition used -> paid/);
  });

  it('covers every status in the table and the labels', () => {
    for (const s of TICKET_STATUSES) {
      expect(TICKET_TRANSITIONS[s]).toBeDefined();
      expect(TICKET_STATUS_LABEL[s].length).toBeGreaterThan(0);
      for (const to of TICKET_TRANSITIONS[s]) expect(TICKET_STATUSES).toContain(to);
    }
  });
});
