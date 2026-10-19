import { describe, expect, it } from 'vitest';
import type { TicketRow } from '@modules/tickets/tickets.types';
import { buildTicketMessage } from './ticket-mail';

const ticket = (overrides: Partial<TicketRow> = {}): TicketRow => ({
  id: 't-1',
  reference_code: 'BRT-ABC234',
  passenger_id: 'p-1',
  origin_station_id: 's1',
  origin_name: 'Bus Shelter S3',
  destination_station_id: 's2',
  destination_name: 'Bus Shelter S20',
  fare_centavos: 4900,
  status: 'paid',
  valid_until: new Date('2026-10-19T15:59:59Z'),
  paid_at: new Date('2026-10-19T02:00:00Z'),
  used_at: null,
  created_at: new Date('2026-10-19T01:55:00Z'),
  bus_id: 'b-1',
  bus_name: 'Bus 3',
  quantity: 1,
  ...overrides,
});
const qr = Buffer.from('PNG');

describe('the ticket email', () => {
  it('has the trip, the bus, the reference, the fare and when it is valid until, in Manila time', () => {
    const m = buildTicketMessage(ticket(), 'pax@t.test', 'Pax One', qr);
    expect(m.to).toBe('pax@t.test');
    expect(m.subject).toBe('Your BRT ticket BRT-ABC234: Bus Shelter S3 to Bus Shelter S20');
    for (const part of ['Hi Pax One', 'BRT-ABC234', 'Bus Shelter S3 to Bus Shelter S20', 'Bus: Bus 3', 'Fare paid: ₱49.00', 'Valid until: Oct 19, 11:59 PM']) expect(m.text).toContain(part);
    expect(m.text).toContain('konduktor of Bus 3 at Bus Shelter S3');
    expect(m.text).not.toContain('Passengers');
  });

  it('carries the QR both in the message and as an attachment of the same picture', () => {
    const m = buildTicketMessage(ticket(), 'pax@t.test', 'Pax One', qr);
    expect(m.html).toContain('src="cid:ticket-qr"');
    expect(m.attachments).toEqual([{ filename: 'ticket-BRT-ABC234.png', content: qr, contentType: 'image/png', cid: 'ticket-qr' }]);
  });

  it('says how many a group ticket admits, and the total', () => {
    const m = buildTicketMessage(ticket({ quantity: 5, fare_centavos: 24500 }), 'pax@t.test', 'Pax One', qr);
    expect(m.text).toContain('Passengers: 5');
    expect(m.text).toContain('Total paid: ₱245.00');
    expect(m.text).toContain('One scan admits all 5 of you');
    expect(m.html).toContain('Total paid');
  });

  it('a ticket with no bus says to show the code to the konduktor', () => {
    const m = buildTicketMessage(ticket({ bus_id: null, bus_name: null }), 'pax@t.test', 'Pax One', qr);
    expect(m.text).toContain('Show the attached QR code to the konduktor when you board.');
    expect(m.text).not.toContain('Bus:');
  });

  it('cannot be turned into markup by a name: everything shown is escaped', () => {
    const m = buildTicketMessage(ticket({ bus_name: '<script>alert(1)</script>', origin_name: 'A & "B"' }), 'pax@t.test', '<b>Pax</b>', qr);
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<b>Pax</b>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('A &amp; &quot;B&quot;');
  });

  it('never includes anything it should not: no passenger id, no payment details', () => {
    const m = buildTicketMessage(ticket(), 'pax@t.test', 'Pax One', qr);
    expect(m.text + m.html).not.toMatch(/p-1|payment|provider/i);
  });
});
