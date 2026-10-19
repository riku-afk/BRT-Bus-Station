import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ScanResponse } from '@shared/scans/models';
import { ScanResultScreen } from './scan-result-screen';

const base: ScanResponse = {
  result: 'valid',
  reason: null,
  message: 'Valid ticket',
  ticket: { referenceCode: 'BRT-ABC234', originName: 'Bus Shelter S3', destinationName: 'Bus Shelter S12', fareCentavos: 3500, quantity: 1 },
  usedAt: null,
  scannedAt: '2026-10-16T02:00:00.000Z',
};

afterEach(cleanup);

describe('ScanResultScreen', () => {
  it('is green and says where the passenger gets off', () => {
    render(<ScanResultScreen result={base} onNext={() => {}} />);
    const screenEl = screen.getByTestId('scan-result');
    expect(screenEl.dataset.result).toBe('valid');
    expect(screenEl.className).toMatch(/bg-green/);
    expect(screen.getByText('VALID')).toBeTruthy();
    expect(screen.getByText('Passenger gets off at')).toBeTruthy();
    expect(screen.getAllByText(/Bus Shelter S12/).length).toBeGreaterThan(0);
    expect(screen.getByText(/BRT-ABC234/)).toBeTruthy();
    expect(screen.getByText(/₱35\.00/)).toBeTruthy();
  });

  it('tells the konduktor how many passengers to admit: all of a group, once', () => {
    render(<ScanResultScreen result={{ ...base, ticket: { ...base.ticket!, quantity: 5 } }} onNext={() => {}} />);
    expect(screen.getByTestId('admit').textContent).toBe('Admit 5 passengers');
    expect(screen.getByText('Passengers get off at')).toBeTruthy();
  });

  it('one passenger reads "Admit 1 passenger"', () => {
    render(<ScanResultScreen result={base} onNext={() => {}} />);
    expect(screen.getByTestId('admit').textContent).toBe('Admit 1 passenger');
  });

  it('a refused ticket does not say to admit anyone', () => {
    render(<ScanResultScreen result={{ ...base, result: 'already_used', message: 'Already used at 8:42 AM', ticket: { ...base.ticket!, quantity: 5 } }} onNext={() => {}} />);
    expect(screen.queryByTestId('admit')).toBeNull();
  });

  it('is red with the reason for a ticket that was already used', () => {
    render(<ScanResultScreen result={{ ...base, result: 'already_used', message: 'Already used at 8:42 AM' }} onNext={() => {}} />);
    expect(screen.getByTestId('scan-result').className).toMatch(/bg-red/);
    expect(screen.getByText('ALREADY USED')).toBeTruthy();
    expect(screen.getByText('Already used at 8:42 AM')).toBeTruthy();
    expect(screen.queryByText('Passenger gets off at')).toBeNull();
  });

  it('is red for a code that is not a ticket, with no ticket details', () => {
    render(<ScanResultScreen result={{ ...base, result: 'invalid', reason: 'bad_token', message: 'Not a valid BRT ticket', ticket: null }} onNext={() => {}} />);
    expect(screen.getByText('NOT VALID')).toBeTruthy();
    expect(screen.getByText('Not a valid BRT ticket')).toBeTruthy();
    expect(screen.queryByText(/BRT-/)).toBeNull();
  });

  it('says WRONG SHELTER, with where the ticket boards, when the ticket was bought at another shelter', () => {
    const wrong = { ...base, result: 'invalid' as const, reason: 'wrong_station' as const, message: 'Wrong shelter: this ticket boards at Bus Shelter S3, and your bus is at Bus Shelter S20' };
    render(<ScanResultScreen result={wrong} onNext={() => {}} />);
    expect(screen.getByText('WRONG SHELTER')).toBeTruthy();
    expect(screen.getByText(/this ticket boards at Bus Shelter S3/)).toBeTruthy();
    expect(screen.getByTestId('scan-result').className).toMatch(/bg-red/);
    expect(screen.queryByText('Passenger gets off at')).toBeNull();
  });

  it('says BUS NOT AT A SHELTER when the bus is on the road', () => {
    const away = { ...base, result: 'invalid' as const, reason: 'bus_not_at_station' as const, message: 'Your bus is not waiting at a shelter, so tickets cannot be checked right now' };
    render(<ScanResultScreen result={away} onNext={() => {}} />);
    expect(screen.getByText('BUS NOT AT A SHELTER')).toBeTruthy();
  });

  it('"Scan next" hands control back', () => {
    const next = vi.fn();
    render(<ScanResultScreen result={base} onNext={next} />);
    fireEvent.click(screen.getByRole('button', { name: /scan next/i }));
    expect(next).toHaveBeenCalledOnce();
  });
});
