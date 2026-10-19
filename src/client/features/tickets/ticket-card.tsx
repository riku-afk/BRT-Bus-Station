import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatManilaDateTime } from '@shared/datetime/ph-time';
import { formatPeso } from '@shared/money';
import { TicketStatusBadge } from './ticket-status';
import type { Ticket } from './use-tickets';

type Props = {
  ticket: Ticket;
  onPay?: (ticket: Ticket) => void;
  onCancel?: (ticket: Ticket) => void;
  busy?: boolean;
};

/** A ticket in the "My tickets" list. Only an unpaid ticket offers Pay / Cancel; a paid one is never cancellable. */
export function TicketCard({ ticket, onPay, onCancel, busy }: Props) {
  const pending = ticket.status === 'pending_payment';
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3" data-testid={`ticket-${ticket.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {ticket.originName} → {ticket.destinationName}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono tracking-wide">{ticket.referenceCode}</span> · bought {formatManilaDateTime(ticket.createdAt)}
            {ticket.busName ? ` · ${ticket.busName}` : ''}
            {ticket.quantity > 1 ? ` · ${ticket.quantity} passengers` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold">{formatPeso(ticket.fareCentavos)}</span>
          <TicketStatusBadge status={ticket.status} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`/tickets/${ticket.id}`}>View</Link>
        </Button>
        {pending && onPay && (
          <Button size="sm" disabled={busy} onClick={() => onPay(ticket)}>
            Pay now
          </Button>
        )}
        {pending && onCancel && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onCancel(ticket)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
