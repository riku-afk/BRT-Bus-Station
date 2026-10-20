import { useConfirm } from '@/components/confirm-dialog';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Ticket as TicketIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PageTitle } from '@/components/layout/page-title';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { TicketCard } from '@/features/tickets/ticket-card';
import { goToCheckout, useCancelTicket, useMyTickets, usePayTicket, type Ticket } from '@/features/tickets/use-tickets';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'pay', label: 'To pay', test: (t: Ticket) => t.status === 'pending_payment' },
  { key: 'ready', label: 'Ready to ride', test: (t: Ticket) => t.status === 'paid' },
  { key: 'past', label: 'Past', test: (t: Ticket) => t.status === 'used' || t.status === 'expired' || t.status === 'cancelled' },
] as const;

/** Passenger: all my tickets, newest first (TKT-05), filtered by where they are in their life. */
export function MyTicketsPage() {
  const { data: tickets, isLoading, error } = useMyTickets();
  const pay = usePayTicket();
  const cancel = useCancelTicket();
  const { ask, dialog } = useConfirm();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  function payNow(ticket: Ticket) {
    pay.mutate(ticket.id, {
      onSuccess: (checkout) => goToCheckout(checkout.checkoutUrl, navigate),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  async function cancelTicket(ticket: Ticket) {
    const ok = await ask({ title: "Cancel this ticket?", description: `${ticket.originName} → ${ticket.destinationName}`, confirmLabel: "Cancel ticket", cancelLabel: "Keep it", destructive: true });
    if (!ok) return;
    cancel.mutate(ticket.id, { onSuccess: () => toast.success('Ticket cancelled'), onError: (e) => toast.error(errorMessage(e)) });
  }

  const active = FILTERS.find((f) => f.key === filter)!;
  const shown = tickets?.filter(active.test) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-4 pb-6 pt-5 sm:px-6 md:gap-5 md:px-8 md:pb-10 md:pt-7">
      {dialog}
      <PageTitle icon={TicketIcon} color="#be185d" title="My tickets" description="Show the QR code to the konduktor when you board.">
        <Link to="/" className="hidden h-12 items-center gap-2 rounded-xl bg-[#0369a1] px-5 text-sm font-extrabold text-white hover:brightness-110 sm:flex">
          <Plus className="size-4" strokeWidth={2.6} aria-hidden /> Buy a ticket
        </Link>
      </PageTitle>

      {tickets && tickets.length > 0 && (
        <div role="group" aria-label="Filter tickets" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:self-start sm:rounded-[14px] sm:bg-surface-2 sm:p-1 [scrollbar-width:none]">
          {FILTERS.map((f) => {
            const count = tickets.filter(f.test).length;
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.key)}
                className={cn('flex h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-extrabold transition-colors sm:h-10', on ? 'bg-[#be185d] text-white' : 'bg-surface-2 text-muted-foreground hover:text-foreground sm:bg-transparent')}
              >
                {f.label}
                <span className={cn('rounded-full px-2 py-px text-xs font-extrabold', on ? 'bg-white/25' : 'bg-foreground/10')}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {isLoading && <Skeleton className="h-28 w-full rounded-[20px]" />}
      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
      {tickets?.length === 0 && (
        <div className="rounded-[20px] border-2 border-dashed p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">You have not bought a ticket yet.</p>
          <Link to="/" className="inline-flex h-12 items-center rounded-xl bg-[#0369a1] px-5 text-sm font-extrabold text-white hover:brightness-110">
            Pick your stations on the map
          </Link>
        </div>
      )}
      {tickets && tickets.length > 0 && shown.length === 0 && <p className="rounded-[20px] border-2 border-dashed p-8 text-center text-sm text-muted-foreground">No tickets here.</p>}
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr))]">
        {shown.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} onPay={payNow} onCancel={cancelTicket} busy={pay.isPending || cancel.isPending} />
        ))}
      </div>
    </div>
  );
}
