import { cn } from '@/lib/utils';
import { TICKET_STATUS_LABEL, type TicketStatus } from '@shared/tickets/status';

const STYLE: Record<TicketStatus, string> = {
  pending_payment: 'bg-warning/20 text-warning',
  paid: 'bg-success/15 text-success',
  used: 'bg-muted text-muted-foreground',
  expired: 'bg-destructive/15 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', STYLE[status], className)}>{TICKET_STATUS_LABEL[status]}</span>;
}
