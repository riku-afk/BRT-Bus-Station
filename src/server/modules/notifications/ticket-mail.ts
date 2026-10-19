/**
 * The ticket by email (NTF-01, NTF-02). When a ticket is paid its owner gets an email with the trip, the bus and the QR code (in
 * the message and attached), so the ticket is in their inbox even without the app.
 *
 * Sending is best effort and never part of the payment: it runs after the payment has been confirmed and committed, and a failure
 * (no network, a bad address, the mail server down) is swallowed and cannot undo, delay or fail the confirmation.
 */
import { getDb } from '@core/database';
import { getMailProvider, type MailMessage } from '@integrations/mail';
import { qrPng } from '@lib/qr-image';
import { signTicketToken } from '@lib/qr-token';
import { authRepository } from '@modules/auth/auth.repository';
import { ticketsRepository } from '@modules/tickets/tickets.repository';
import type { TicketRow } from '@modules/tickets/tickets.types';
import { formatManilaDateTime } from '@shared/datetime/ph-time';
import { formatPeso } from '@shared/money';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The message for a paid ticket. Pure: the QR picture is passed in. */
export function buildTicketMessage(ticket: TicketRow, to: string, passengerName: string, qr: Buffer): MailMessage {
  const group = ticket.quantity > 1;
  const trip = `${ticket.origin_name} to ${ticket.destination_name}`;
  const validUntil = formatManilaDateTime(ticket.valid_until.toISOString());
  const instructions = ticket.bus_name
    ? `Show the attached QR code to the konduktor of ${ticket.bus_name} at ${ticket.origin_name} when you board.${group ? ` One scan admits all ${ticket.quantity} of you.` : ''} It can be used once.`
    : `Show the attached QR code to the konduktor when you board.${group ? ` One scan admits all ${ticket.quantity} of you.` : ''} It can be used once.`;

  const rows: [string, string][] = [
    ['Reference', ticket.reference_code],
    ['Trip', trip],
    ...(ticket.bus_name ? ([['Bus', ticket.bus_name]] as [string, string][]) : []),
    ...(group ? ([['Passengers', String(ticket.quantity)]] as [string, string][]) : []),
    [group ? 'Total paid' : 'Fare paid', formatPeso(ticket.fare_centavos)],
    ['Valid until', validUntil],
  ];

  const text = [
    `Hi ${passengerName},`,
    '',
    `Your ticket is paid: ${trip}.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    instructions,
    '',
    'Keep this email private: anyone with the QR code can use the ticket.',
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#f4f6f6;font-family:Arial,Helvetica,sans-serif;color:#13292b">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<h1 style="margin:0 0 4px;font-size:20px">Your ticket is paid</h1>
<p style="margin:0 0 16px;color:#52686a">Hi ${escapeHtml(passengerName)}, here is your ticket for ${escapeHtml(trip)}.</p>
<div style="text-align:center;margin:16px 0"><img src="cid:ticket-qr" alt="Ticket QR code" width="240" height="240" style="border:1px solid #d5dede;border-radius:8px;padding:4px"></div>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#52686a;width:38%">${escapeHtml(k)}</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(v)}</td></tr>`).join('')}
</table>
<p style="margin:16px 0 0;font-size:14px">${escapeHtml(instructions)}</p>
<p style="margin:16px 0 0;font-size:12px;color:#7a8e90">Keep this email private: anyone with the QR code can use the ticket.</p>
</div></body></html>`;

  return {
    to,
    subject: `Your BRT ticket ${ticket.reference_code}: ${trip}`,
    text,
    html,
    attachments: [{ filename: `ticket-${ticket.reference_code}.png`, content: qr, contentType: 'image/png', cid: 'ticket-qr' }],
  };
}

/** Email the owner a paid ticket. Returns whether it was handed to the mail service; never throws. */
async function sendPaidTicket(ticketId: string): Promise<boolean> {
  try {
    const db = getDb();
    const ticket = await ticketsRepository.findById(db, ticketId);
    if (!ticket || ticket.status !== 'paid') return false;
    const user = await authRepository.findById(db, ticket.passenger_id);
    if (!user) return false;
    const qr = await qrPng(signTicketToken(ticket.id));
    await getMailProvider().send(buildTicketMessage(ticket, user.email, user.full_name, qr));
    return true;
  } catch {
    // Nothing to do: the ticket is paid, the passenger can still see it (and its QR) in the app, and can ask for the email again.
    return false;
  }
}

export const ticketMail = { sendPaidTicket };
