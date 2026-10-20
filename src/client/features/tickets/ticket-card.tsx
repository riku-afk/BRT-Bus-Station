import { Link } from 'react-router-dom';
import { ArrowRight, QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatManilaDateTime } from '@shared/datetime/ph-time';
import { formatPeso } from '@shared/money';
import { TICKET_STATUS_LABEL, type TicketStatus } from '@shared/tickets/status';
import type { Ticket } from './use-tickets';

type Props = {
  ticket: Ticket;
  onPay?: (ticket: Ticket) => void;
  onCancel?: (ticket: Ticket) => void;
  busy?: boolean;
};

/** The coloured stub of a ticket: awaiting payment amber, paid green, used slate, cancelled / expired grey. */
export const STUB: Record<TicketStatus, { bg: string; ink: string; perf: string }> = {
  pending_payment: { bg: '#f59e0b', ink: '#1c1203', perf: '#f59e0b' },
  paid: { bg: '#15803d', ink: '#ffffff', perf: '#15803d' },
  used: { bg: '#64748b', ink: '#ffffff', perf: '#94a3b8' },
  cancelled: { bg: '#94a3b8', ink: '#0f172a', perf: '#94a3b8' },
  expired: { bg: '#94a3b8', ink: '#0f172a', perf: '#94a3b8' },
};

/** "Bus Shelter S10" is "S10"; a name that does not end in a number is shortened to its first word. */
export function shortName(name: string): string {
  return name.match(/\b(S\d+)\s*$/i)?.[1]?.toUpperCase() ?? name.split(/\s+/)[0]!.slice(0, 4);
}

/** A ticket in the "My tickets" list. Only an unpaid ticket offers Pay / Cancel; a paid one is never cancellable. */
export function TicketCard({ ticket, onPay, onCancel, busy }: Props) {
  const pending = ticket.status === 'pending_payment';
  const stub = STUB[ticket.status];
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-[20px] border bg-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-16px_rgba(15,23,42,.4)] md:flex-row', ticket.status === 'cancelled' || ticket.status === 'expired' ? 'opacity-80' : '')} data-testid={`ticket-${ticket.id}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-5 sm:py-[18px]">
        <div className="flex items-center gap-3" aria-hidden>
          <span className="text-2xl font-extrabold tracking-tight sm:text-[26px]">{shortName(ticket.originName)}</span>
          <span className="flex max-w-[120px] flex-1 items-center gap-1 text-muted-foreground">
            <span className="flex-1 border-t-2 border-dashed" />
            <ArrowRight className="size-[18px]" strokeWidth={2.2} />
            <span className="flex-1 border-t-2 border-dashed" />
          </span>
          <span className="text-2xl font-extrabold tracking-tight sm:text-[26px]">{shortName(ticket.destinationName)}</span>
        </div>
        <span className="text-[13px] text-muted-foreground">
          {ticket.originName} → {ticket.destinationName}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {/* The reference is the fallback for the konduktor: it is shown once the ticket is paid, not while it is still being bought. */}
          {(ticket.status === 'paid' || ticket.status === 'used') && (
            <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono font-semibold tracking-wide text-foreground">{ticket.referenceCode}</span>
          )}
          <span>
            bought {formatManilaDateTime(ticket.createdAt)}
            {ticket.busName ? ` · ${ticket.busName}` : ''}
            {ticket.quantity > 1 ? ` · ${ticket.quantity} passengers` : ''}
          </span>
        </span>
        <div className="flex flex-wrap gap-2">
          <Link to={`/tickets/${ticket.id}`} className="inline-flex h-11 items-center gap-1.5 rounded-xl border bg-card px-3.5 text-[13px] font-extrabold hover:bg-surface-2">
            <QrCode className="size-3.5" aria-hidden /> View ticket
          </Link>
          {pending && onPay && (
            <button type="button" disabled={busy} onClick={() => onPay(ticket)} className="h-11 rounded-xl bg-[#be185d] px-4 text-[13px] font-extrabold text-white hover:brightness-110 disabled:opacity-60">
              Pay now
            </button>
          )}
          {pending && onCancel && (
            <button type="button" disabled={busy} onClick={() => onCancel(ticket)} className="h-11 rounded-xl px-3.5 text-[13px] font-extrabold text-muted-foreground hover:bg-surface-2 disabled:opacity-60">
              Cancel
            </button>
          )}
        </div>
      </div>
      <div
        className="relative flex shrink-0 items-center justify-between gap-1.5 px-4 py-3 md:w-[150px] md:flex-col md:justify-center md:border-l-2 md:border-dashed md:px-2.5 md:py-4"
        style={{ background: stub.bg, color: stub.ink, borderColor: stub.perf }}
      >
        <span aria-hidden className="absolute -top-2.5 left-3 size-5 rounded-full bg-background md:-left-3 md:top-[-12px] md:size-[22px]" />
        <span aria-hidden className="absolute -top-2.5 right-3 size-5 rounded-full bg-background md:-bottom-3 md:-left-3 md:top-auto md:right-auto md:size-[22px]" />
        <span className="text-xl font-extrabold md:text-[26px]">{formatPeso(ticket.fareCentavos)}</span>
        <span className="text-[11px] font-extrabold uppercase tracking-wider md:text-center">{TICKET_STATUS_LABEL[ticket.status]}</span>
      </div>
    </div>
  );
}
